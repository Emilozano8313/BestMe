"""
BestMe — Rate Limiting
========================
Guards the endpoints that cost money.

Each call to `/meals/analyze` or `/scans/analyze` is a paid Claude request.
Without a limit, a retry loop in the app — or anyone who gets hold of a
token — can run up a bill unattended.

Limits are per authenticated user, falling back to client IP for anonymous
requests, so one user cannot exhaust another's quota.
"""

from __future__ import annotations

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

# Generous for a person logging meals, restrictive for a runaway loop.
AI_ENDPOINT_LIMIT = "20/minute"


def user_or_ip(request: Request) -> str:
    """
    Rate-limit key: the authenticated user when known, else the client IP.

    The JWT is read straight from the header rather than via the
    `get_current_user` dependency, because slowapi resolves the key before
    dependencies run.
    """
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        if token:
            # The raw token identifies the caller well enough for bucketing.
            # It is never logged or persisted — only hashed into a key.
            return f"token:{hash(token)}"
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=user_or_ip)
