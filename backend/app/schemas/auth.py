"""
BestMe — Auth Schemas
=======================
Pydantic schemas for authentication and tokens.
"""

from __future__ import annotations

from pydantic import BaseModel, EmailStr


class Token(BaseModel):
    """Schema for JWT token response."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    """Schema for validating JWT token payload."""
    sub: str
    type: str
    exp: int


class LoginRequest(BaseModel):
    """Schema for JSON-based login request (alternative to OAuth2 form)."""
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    """Schema for requesting a new access token using a refresh token."""
    refresh_token: str
