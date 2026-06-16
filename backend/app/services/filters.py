"""Safe rendering of structured row filters.

A filter is a list of ``{column, op, value}`` conditions (AND-combined). We
NEVER accept or execute raw SQL/Mongo predicates. Identifiers are validated
against a strict allowlist and values are always passed as bound parameters,
so user-supplied filters cannot inject SQL or Mongo operators.

Three render targets:
* ``render_native_sql``  — for psycopg2/pymysql/sqlite COUNT queries.
* ``render_engine_sql``  — for the Redpanda Connect ``sql_select`` ``where`` + args.
* ``render_mongo``       — a plain dict for ``count_documents`` / the engine query.
"""

from __future__ import annotations

import re
from typing import Any

from app.models.enums import DBType

SAFE_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_$.]*$")

# Comparison operators → SQL / Mongo.
_SQL_CMP = {"eq": "=", "ne": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<=", "like": "LIKE"}
_SQL_LIST = {"in": "IN", "nin": "NOT IN"}
_MONGO = {
    "eq": "$eq", "ne": "$ne", "gt": "$gt", "gte": "$gte", "lt": "$lt",
    "lte": "$lte", "like": "$regex", "in": "$in", "nin": "$nin",
}

VALID_OPS = set(_SQL_CMP) | set(_SQL_LIST)


def _column(raw: str) -> str:
    if not SAFE_IDENT.match(raw):
        raise ValueError(f"Invalid filter column identifier: {raw!r}")
    return raw


def _quote(column: str, db_type: DBType) -> str:
    col = _column(column)
    if db_type == DBType.MYSQL:
        return f"`{col}`"
    return f'"{col}"'


def _as_list(value: Any) -> list[Any]:
    return list(value) if isinstance(value, (list, tuple)) else [value]


def _render_sql(conditions: list[dict], db_type: DBType, placeholder: str) -> tuple[str | None, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    for cond in conditions:
        op = cond.get("op", "eq")
        if op not in VALID_OPS:
            raise ValueError(f"Unsupported filter operator: {op!r}")
        quoted = _quote(cond["column"], db_type)
        if op in _SQL_LIST:
            values = _as_list(cond.get("value"))
            if not values:
                raise ValueError(f"Operator {op!r} requires a non-empty list value.")
            placeholders = ", ".join([placeholder] * len(values))
            clauses.append(f"{quoted} {_SQL_LIST[op]} ({placeholders})")
            params.extend(values)
        else:
            clauses.append(f"{quoted} {_SQL_CMP[op]} {placeholder}")
            params.append(cond.get("value"))
    if not clauses:
        return None, []
    return " AND ".join(clauses), params


def render_native_sql(conditions: list[dict] | None, db_type: DBType) -> tuple[str | None, list[Any]]:
    """For native drivers. psycopg2/pymysql use ``%s``; sqlite uses ``?``."""
    if not conditions:
        return None, []
    placeholder = "%s" if db_type in (DBType.POSTGRES, DBType.MYSQL) else "?"
    return _render_sql(conditions, db_type, placeholder)


def render_engine_sql(conditions: list[dict] | None, db_type: DBType) -> tuple[str | None, list[Any]]:
    """For Redpanda Connect ``sql_select``: ``?`` placeholders + ordered args."""
    if not conditions:
        return None, []
    return _render_sql(conditions, db_type, "?")


def render_mongo(conditions: list[dict] | None) -> dict[str, Any]:
    """Build a MongoDB query document programmatically (no string interpolation)."""
    query: dict[str, Any] = {}
    for cond in conditions or []:
        op = cond.get("op", "eq")
        if op not in VALID_OPS:
            raise ValueError(f"Unsupported filter operator: {op!r}")
        column = _column(cond["column"])
        value = cond.get("value")
        expr = {"$regex": value} if op == "like" else {_MONGO[op]: value}
        query.setdefault(column, {}).update(expr)
    return query
