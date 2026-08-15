"""
BestMe — Portable Column Types
================================
PostgreSQL-native types with SQLite fallbacks.

Production runs on PostgreSQL and keeps JSONB (indexable, queryable) and
native UUID columns. The test suite runs on in-memory SQLite, which cannot
render either type — `with_variant` picks the right one per dialect, so the
DDL emitted against PostgreSQL is byte-for-byte what migration 0001 created.
"""

from __future__ import annotations

import enum
from typing import Type

from sqlalchemy import JSON, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID

# JSONB on PostgreSQL, plain JSON on SQLite.
JSONColumn = JSONB().with_variant(JSON(), "sqlite")

# Native UUID on PostgreSQL, CHAR(32) on SQLite.
UUIDColumn = PGUUID(as_uuid=True).with_variant(Uuid(as_uuid=True), "sqlite")


def enum_values(enum_class: Type[enum.Enum]) -> list[str]:
    """
    Return an enum's *values* for SQLAlchemy's ``values_callable``.

    SQLAlchemy persists the *name* of a Python enum by default ("MALE"),
    but the migrations create the PostgreSQL types from the *values*
    ('male', 'female', 'other'). Without this every INSERT touching an
    enum column fails with `invalid input value for enum`.
    """
    return [member.value for member in enum_class]
