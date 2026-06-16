"""Symmetric encryption for database credentials at rest.

Connection passwords are encrypted with Fernet (AES-128-CBC + HMAC) before
they ever touch the metadata database. The key lives only in the environment
(``ENCRYPTION_KEY``) and is never persisted alongside the ciphertext.
"""

from __future__ import annotations

from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

_PLACEHOLDER = "CHANGE_ME"


class CredentialCipher:
    """Thin wrapper around Fernet with friendly error messages."""

    def __init__(self, key: str) -> None:
        if not key or key == _PLACEHOLDER:
            raise RuntimeError(
                "ENCRYPTION_KEY is not set. Generate one with:\n"
                '  python -c "from cryptography.fernet import Fernet; '
                'print(Fernet.generate_key().decode())"'
            )
        try:
            self._fernet = Fernet(key.encode("utf-8"))
        except (ValueError, TypeError) as exc:
            raise RuntimeError(
                "ENCRYPTION_KEY is not a valid Fernet key (must be 32 "
                "url-safe base64-encoded bytes)."
            ) from exc

    def encrypt(self, plaintext: str) -> str:
        """Encrypt a UTF-8 string, returning url-safe ciphertext."""
        return self._fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")

    def decrypt(self, token: str) -> str:
        """Decrypt ciphertext produced by :meth:`encrypt`."""
        try:
            return self._fernet.decrypt(token.encode("utf-8")).decode("utf-8")
        except InvalidToken as exc:
            raise RuntimeError(
                "Failed to decrypt a stored credential. The ENCRYPTION_KEY "
                "may have changed since the credential was saved."
            ) from exc


@lru_cache
def get_cipher() -> CredentialCipher:
    """Cached cipher singleton. Constructed lazily so tooling that doesn't
    touch credentials (e.g. Alembic) can import the app without a valid key."""
    return CredentialCipher(settings.encryption_key)
