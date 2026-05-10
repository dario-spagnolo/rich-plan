"""TOON encoder — minimal, stdlib-only.

Inspired by the spec at https://github.com/toon-format/spec (SPEC.md).
This module is not a general-purpose TOON serialiser; it covers the subset
of the format needed by rich-plan submissions while staying faithful to
the spec where any feature applies.

Public API:
    encode(obj) -> str   # no trailing newline; caller may append one.
"""

from __future__ import annotations

import math
import re

INDENT = "  "

_KEY_BARE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.]*$")
_NUM_LIKE = re.compile(r"^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$")
_LEADING_ZERO = re.compile(r"^0\d+$")
_RESERVED_WORDS = {"true", "false", "null"}


def encode(obj) -> str:
    lines: list[str] = []
    if isinstance(obj, dict):
        _emit_obj_fields(obj, lines, depth=0)
    elif isinstance(obj, list):
        _emit_root_array(obj, lines)
    else:
        lines.append(_scalar(obj))
    return "\n".join(lines)


# --- key / scalar formatting ---------------------------------------------

def _quote(s: str) -> str:
    out = ['"']
    for ch in s:
        if ch == "\\":
            out.append("\\\\")
        elif ch == '"':
            out.append('\\"')
        elif ch == "\n":
            out.append("\\n")
        elif ch == "\r":
            out.append("\\r")
        elif ch == "\t":
            out.append("\\t")
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def _key(k) -> str:
    s = str(k)
    return s if _KEY_BARE.match(s) else _quote(s)


def _string_needs_quoting(s: str, delim: str) -> bool:
    if s == "":
        return True
    if s != s.strip():
        return True
    if s in _RESERVED_WORDS:
        return True
    if _NUM_LIKE.match(s) or _LEADING_ZERO.match(s):
        return True
    if s == "-" or s.startswith("-"):
        return True
    forbidden = {":", '"', "\\", "[", "]", "{", "}", "\n", "\r", "\t", delim}
    if any(c in forbidden for c in s):
        return True
    return any(ord(c) < 0x20 for c in s)


def _string(s: str, delim: str) -> str:
    return _quote(s) if _string_needs_quoting(s, delim) else s


def _number(n) -> str:
    if isinstance(n, float):
        if math.isnan(n) or math.isinf(n):
            return "null"
        if n.is_integer():
            return str(int(n))
        s = repr(n)
        if "e" in s or "E" in s:
            s = f"{n:.17f}".rstrip("0").rstrip(".")
        return s
    return str(int(n))


def _scalar(v, delim: str = ",") -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return _number(v)
    return _string(str(v), delim)


# --- shape predicates -----------------------------------------------------

def _is_primitive(v) -> bool:
    return v is None or isinstance(v, (bool, int, float, str))


def _is_uniform_flat_objects(arr) -> bool:
    if not arr or not all(isinstance(x, dict) for x in arr):
        return False
    keys = list(arr[0].keys())
    if not keys:
        return False
    return all(
        list(x.keys()) == keys and all(_is_primitive(v) for v in x.values())
        for x in arr
    )


def _is_primitive_array(arr) -> bool:
    return all(_is_primitive(x) for x in arr)


# --- emit -----------------------------------------------------------------

def _emit_obj_fields(obj: dict, lines: list[str], depth: int):
    pad = INDENT * depth
    for k, v in obj.items():
        key = _key(k)
        if isinstance(v, dict):
            lines.append(f"{pad}{key}:")
            if v:
                _emit_obj_fields(v, lines, depth + 1)
        elif isinstance(v, list):
            _emit_array_field(key, v, lines, depth)
        else:
            lines.append(f"{pad}{key}: {_scalar(v)}")


def _emit_array_field(key: str, arr: list, lines: list[str], depth: int):
    pad = INDENT * depth
    n = len(arr)
    if n == 0:
        lines.append(f"{pad}{key}[0]:")
        return
    if _is_uniform_flat_objects(arr):
        cols = list(arr[0].keys())
        cols_decl = ",".join(_key(c) for c in cols)
        lines.append(f"{pad}{key}[{n}]{{{cols_decl}}}:")
        for row in arr:
            lines.append(pad + INDENT + ",".join(_scalar(row[c]) for c in cols))
        return
    if _is_primitive_array(arr):
        cells = ",".join(_scalar(x) for x in arr)
        lines.append(f"{pad}{key}[{n}]: {cells}")
        return
    lines.append(f"{pad}{key}[{n}]:")
    for item in arr:
        _emit_list_item(item, lines, depth + 1)


def _emit_list_item(item, lines: list[str], depth: int):
    pad = INDENT * depth
    if _is_primitive(item):
        lines.append(f"{pad}- {_scalar(item)}")
        return
    if isinstance(item, list):
        if _is_primitive_array(item):
            lines.append(f"{pad}- [{len(item)}]: {','.join(_scalar(x) for x in item)}")
            return
        lines.append(f"{pad}- [{len(item)}]:")
        for sub in item:
            _emit_list_item(sub, lines, depth + 1)
        return
    if isinstance(item, dict):
        if not item:
            lines.append(f"{pad}-")
            return
        keys = list(item.keys())
        first_k = keys[0]
        first_v = item[first_k]
        cont_pad = INDENT * (depth + 1)
        if _is_primitive(first_v):
            lines.append(f"{pad}- {_key(first_k)}: {_scalar(first_v)}")
        elif isinstance(first_v, dict):
            lines.append(f"{pad}- {_key(first_k)}:")
            if first_v:
                _emit_obj_fields(first_v, lines, depth + 2)
        elif isinstance(first_v, list):
            if not first_v:
                lines.append(f"{pad}- {_key(first_k)}[0]:")
            elif _is_uniform_flat_objects(first_v):
                cols = list(first_v[0].keys())
                cols_decl = ",".join(_key(c) for c in cols)
                lines.append(f"{pad}- {_key(first_k)}[{len(first_v)}]{{{cols_decl}}}:")
                row_pad = INDENT * (depth + 2)
                for row in first_v:
                    lines.append(row_pad + ",".join(_scalar(row[c]) for c in cols))
            elif _is_primitive_array(first_v):
                lines.append(f"{pad}- {_key(first_k)}[{len(first_v)}]: {','.join(_scalar(x) for x in first_v)}")
            else:
                lines.append(f"{pad}- {_key(first_k)}[{len(first_v)}]:")
                for sub in first_v:
                    _emit_list_item(sub, lines, depth + 2)
        for k in keys[1:]:
            v = item[k]
            kk = _key(k)
            if isinstance(v, dict):
                lines.append(f"{cont_pad}{kk}:")
                if v:
                    _emit_obj_fields(v, lines, depth + 2)
            elif isinstance(v, list):
                _emit_array_field(kk, v, lines, depth + 1)
            else:
                lines.append(f"{cont_pad}{kk}: {_scalar(v)}")


def _emit_root_array(arr, lines):
    n = len(arr)
    if n == 0:
        lines.append("[0]:")
        return
    if _is_uniform_flat_objects(arr):
        cols = list(arr[0].keys())
        lines.append(f"[{n}]{{{','.join(_key(c) for c in cols)}}}:")
        for row in arr:
            lines.append(INDENT + ",".join(_scalar(row[c]) for c in cols))
        return
    if _is_primitive_array(arr):
        lines.append(f"[{n}]: {','.join(_scalar(x) for x in arr)}")
        return
    lines.append(f"[{n}]:")
    for item in arr:
        _emit_list_item(item, lines, 1)


# --- self-test ------------------------------------------------------------

if __name__ == "__main__":
    import json
    import sys

    if len(sys.argv) > 1:
        data = json.loads(open(sys.argv[1], encoding="utf-8").read())
        print(encode(data))
        sys.exit(0)

    sample = {
        "title": "Demo",
        "tags": ["a", "b", "c"],
        "questions": [
            {"id": "ttl", "answer": "3600", "default": "3600", "changed": False},
            {"id": "win", "answer": "21d", "default": None, "changed": True},
        ],
        "comments": [
            {"anchor": "x", "target_type": "section", "target_locator": None, "text": "hi"},
            {"anchor": "y", "target_type": "code-line", "target_locator": {"line": 11}, "text": "why?"},
        ],
        "edits": [],
    }
    print(encode(sample))
