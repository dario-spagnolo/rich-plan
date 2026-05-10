#!/usr/bin/env python3
"""rich-plan server: serve a plan.html and block until the user submits.

Usage:
    python server.py <plan_dir> [--no-open] [--timeout <seconds>]

Reads <plan_dir>/plan.html and serves it on a free local port, alongside
the static assets bundled in this script's own directory. Opens the URL
in a browser via xdg-open. Blocks until POST /api/submit is received,
then writes:
    <plan_dir>/submission.toon   -- structured user input (compact)
    <plan_dir>/submission.json   -- same data, JSON form (debug oracle)
    <plan_dir>/submission.html   -- full DOM snapshot
and exits 0. On cancel: exits 1. On timeout: exits 2.

The APPROVED/APPROVED_FAST stdout marker points to the .toon file —
~37% smaller than JSON in tokens, so the agent reads less context.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import toon

SCRIPT_DIR = Path(__file__).resolve().parent
STATIC_DIR = SCRIPT_DIR / "static"

# Wrapping shell injected into every plan.html. Lets Claude write only the
# body content. The first <script> resolves the user's theme synchronously,
# before the stylesheet paints, to avoid a flash-of-light-content (FOUC)
# when an override is stored. See refs/conventions/theming.md.
PRELUDE_HEAD = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{title}</title>
  <script>
    (function () {{
      try {{
        var t = localStorage.getItem("rp-theme");
        if (t !== "light" && t !== "dark") {{
          t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }}
        document.documentElement.setAttribute("data-theme", t);
      }} catch (e) {{}}
    }})();
  </script>
  <link rel="stylesheet" href="/static/base.css">
  <script type="module" src="/static/runtime.js"></script>
</head>
<body>
"""
PRELUDE_TAIL = "\n</body>\n</html>\n"


def _wrap(content: str) -> str:
    """Wrap the plan.html body in the standard shell."""
    import re as _re
    # Best-effort title from the first <h1> (or "Plan")
    m = _re.search(r"<h1[^>]*>(.*?)</h1>", content, _re.IGNORECASE | _re.DOTALL)
    title = "Plan"
    if m:
        title = _re.sub(r"<[^>]+>", "", m.group(1)).strip() or "Plan"
    # Wrap in <main> if the body doesn't already include one.
    body = content if "<main" in content.lower() else f"<main>\n{content}\n</main>"
    return PRELUDE_HEAD.format(title=_re.sub(r"[<>&\"]", "", title)) + body + PRELUDE_TAIL

# ---------------------------------------------------------------------------
# Server-injected instructions
# ---------------------------------------------------------------------------

# Implementation-orchestration guidance written into the submission under
# `_instructions`. The skill consumer (Claude Code) reads this after the
# approval gate clears and applies it to structure implementation work.
_INSTRUCTIONS_GATED = [
    "Once the user has given explicit go-ahead in chat, structure the "
    "implementation with TaskCreate: one task per major step from the plan. "
    "Use TaskUpdate to flip each task to in_progress when starting and to "
    "completed when done — do not batch updates at the end.",
]

_INSTRUCTIONS_FAST = [
    "approval_mode is 'fast' — begin implementation now without restating "
    "the plan.",
    "Before touching code, structure the work with TaskCreate: one task per "
    "major step from the plan. Use TaskUpdate to flip each task to "
    "in_progress when starting and to completed when done — do not batch "
    "updates at the end.",
]


def _build_instructions(mode: str) -> list[str]:
    return _INSTRUCTIONS_FAST if mode == "fast" else _INSTRUCTIONS_GATED


# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------

class Session:
    def __init__(self, plan_dir: Path):
        self.plan_dir = plan_dir
        self.done = threading.Event()
        self.outcome = None       # "submitted" | "cancelled" | "timeout"
        self.lock = threading.Lock()


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

class PlanHandler(BaseHTTPRequestHandler):
    session: Session  # injected as class attr by build_handler

    # quieten default access log
    def log_message(self, fmt, *args):
        sys.stderr.write("[server] %s - %s\n" % (self.address_string(), fmt % args))

    # ---- routing ------------------------------------------------------
    def do_GET(self):  # noqa: N802 (stdlib API)
        path = self.path.split("?", 1)[0]
        if path == "/" or path == "/plan.html":
            self._serve_plan(self.session.plan_dir / "plan.html")
        elif path.startswith("/static/"):
            rel = path[len("/static/"):]
            # Reject any traversal attempt or absolute path before resolving.
            if not rel or rel.startswith("/") or ".." in rel.split("/"):
                self._send_status(404, "Bad path")
                return
            # Only .js / .css are served; everything else under static/ is
            # internal and must stay invisible to the browser.
            if not (rel.endswith(".js") or rel.endswith(".css")):
                self._send_status(404, "Unsupported asset type")
                return
            target = (STATIC_DIR / rel).resolve()
            try:
                target.relative_to(STATIC_DIR.resolve())
            except ValueError:
                self._send_status(404, "Out of bounds")
                return
            ctype = "text/css" if rel.endswith(".css") else "application/javascript"
            self._serve_file(target, ctype + "; charset=utf-8")
        elif path == "/favicon.ico":
            self._send_status(204)
        else:
            self._send_status(404, "Not found")

    def do_POST(self):  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path == "/api/submit":
            self._handle_submit()
        elif path in ("/api/reject", "/api/cancel"):  # /api/cancel kept as alias
            self._handle_reject()
        else:
            self._send_status(404, "Not found")

    # ---- helpers ------------------------------------------------------
    def _serve_file(self, p: Path, ctype: str):
        if not p.is_file():
            self._send_status(404, f"Missing: {p.name}")
            return
        data = p.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def _serve_plan(self, p: Path):
        """Serve plan.html, wrapped in the standard shell."""
        if not p.is_file():
            self._send_status(404, f"Missing: {p.name}")
            return
        try:
            content = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            self._send_status(500, "plan.html is not valid UTF-8")
            return
        wrapped = _wrap(content).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(wrapped)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(wrapped)

    def _send_status(self, code: int, msg: str = ""):
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        if msg:
            self.wfile.write(msg.encode("utf-8"))

    def _read_json(self) -> dict | None:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0 or length > 8 * 1024 * 1024:  # 8MB cap
            return None
        try:
            raw = self.rfile.read(length)
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None

    # ---- endpoints ----------------------------------------------------
    def _handle_submit(self):
        s = self.session
        with s.lock:
            if s.done.is_set():
                self._send_status(409, "Already finalised")
                return
            body = self._read_json()
            if body is None:
                self._send_status(400, "Invalid JSON")
                return

            payload = body.get("payload", {})
            snapshot = body.get("snapshot_html", "")

            mode = payload.get("approval_mode") if isinstance(payload, dict) else None
            if mode not in ("gated", "fast"):
                self._send_status(400, "missing/invalid approval_mode")
                return

            payload["_instructions"] = _build_instructions(mode)

            json_path = s.plan_dir / "submission.json"
            toon_path = s.plan_dir / "submission.toon"
            html_path = s.plan_dir / "submission.html"
            json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
            toon_path.write_text(toon.encode(payload) + "\n", encoding="utf-8")
            if isinstance(snapshot, str) and snapshot:
                html_path.write_text(snapshot, encoding="utf-8")

            s.outcome = "approved_fast" if mode == "fast" else "approved"
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            # release main thread AFTER response is flushed
            s.done.set()

    def _handle_reject(self):
        s = self.session
        with s.lock:
            if s.done.is_set():
                self._send_status(409, "Already finalised")
                return
            s.outcome = "rejected"
            self._send_status(200, "rejected")
            s.done.set()


def build_handler(session: Session):
    cls = type("BoundPlanHandler", (PlanHandler,), {"session": session})
    return cls


# ---------------------------------------------------------------------------
# Browser open
# ---------------------------------------------------------------------------

def try_open_browser(url: str) -> bool:
    candidates = ["xdg-open", "open"]  # macOS fallback
    for cmd in candidates:
        if shutil.which(cmd):
            try:
                subprocess.Popen(
                    [cmd, url],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True,
                )
                return True
            except OSError:
                continue
    return False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="rich-plan local server")
    parser.add_argument("plan_dir", type=Path, help="directory containing plan.html")
    parser.add_argument("--no-open", action="store_true", help="don't try to open the browser")
    parser.add_argument("--timeout", type=int, default=3600, help="seconds before auto-cancel (default: 3600)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=0, help="0 = pick a free port")
    args = parser.parse_args(argv)

    plan_dir: Path = args.plan_dir.resolve()
    if not plan_dir.is_dir():
        print(f"error: not a directory: {plan_dir}", file=sys.stderr)
        return 3
    if not (plan_dir / "plan.html").is_file():
        print(f"error: missing plan.html in {plan_dir}", file=sys.stderr)
        return 3

    session = Session(plan_dir)
    handler_cls = build_handler(session)
    server = ThreadingHTTPServer((args.host, args.port), handler_cls)
    actual_port = server.server_address[1]
    url = f"http://{args.host}:{actual_port}/"

    print(f"[rich-plan] serving {plan_dir}", file=sys.stderr)
    print(f"[rich-plan] open: {url}", file=sys.stderr)
    print(f"[rich-plan] timeout: {args.timeout}s", file=sys.stderr)

    serve_thread = threading.Thread(target=server.serve_forever, daemon=True)
    serve_thread.start()

    # Machine-readable event for Monitor (clean stdout stream).
    print(f"URL {url}", flush=True)

    if not args.no_open:
        opened = try_open_browser(url)
        if not opened:
            print("[rich-plan] (could not auto-open browser; copy the URL above)", file=sys.stderr)

    try:
        finished = session.done.wait(timeout=args.timeout)
    except KeyboardInterrupt:
        session.outcome = "interrupted"
        finished = True

    server.shutdown()
    server.server_close()

    if not finished:
        session.outcome = "timeout"

    outcome = session.outcome or "unknown"
    print(f"[rich-plan] outcome: {outcome}", file=sys.stderr)

    sub_path = plan_dir / "submission.toon"
    if outcome == "approved":
        print(f"APPROVED {sub_path}", flush=True)
        return 0
    if outcome == "approved_fast":
        print(f"APPROVED_FAST {sub_path}", flush=True)
        return 0
    if outcome == "rejected":
        print("REJECTED", flush=True)
        return 1
    if outcome == "timeout":
        print("TIMEOUT", flush=True)
        return 2
    print("INTERRUPTED", flush=True)
    return 130


if __name__ == "__main__":
    sys.exit(main())
