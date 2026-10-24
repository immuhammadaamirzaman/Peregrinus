"""Authentication-related schemas."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.security import MIN_PASSWORD_LENGTH, is_acceptable_password


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)

    @field_validator("password")
    @classmethod
    def _enforce_password_policy(cls, value: str) -> str:
        """Apply the same floor as privileged accounts: a sane minimum length
        and a rejection of well-known weak values."""
        if not is_acceptable_password(value):
            raise ValueError(
                f"Password must be at least {MIN_PASSWORD_LENGTH} characters "
                "and not a commonly used password."
            )
        return value


class Token(BaseModel):
    """Login/refresh response. The refresh token is delivered as an httpOnly
    cookie (not in the body), so it is never exposed to JavaScript."""

    access_token: str
    token_type: str = "bearer"
