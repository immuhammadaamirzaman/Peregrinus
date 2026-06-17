"""Authentication-related schemas."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


class Token(BaseModel):
    """Login/refresh response. The refresh token is delivered as an httpOnly
    cookie (not in the body), so it is never exposed to JavaScript."""

    access_token: str
    token_type: str = "bearer"
