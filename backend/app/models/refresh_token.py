"""Persisted refresh-token sessions.

Each issued refresh token has a row here, keyed by its JWT ``jti``. This makes
refresh tokens *revocable* (logout / admin action) and supports rotation with
reuse detection: refreshing revokes the presented token and issues a new one in
the same ``family``; presenting an already-revoked token is treated as theft and
revokes the whole family.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class RefreshToken(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "refresh_tokens"

    # The JWT ``jti`` (hex). Unique so a token can be looked up / revoked.
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Rotation family: all tokens derived from one login share a family id, so a
    # detected reuse can revoke the entire chain.
    family_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<RefreshToken jti={self.jti[:8]}… user={self.user_id} revoked={self.revoked}>"
