"""Print fresh secrets for .env (JWT_SECRET_KEY and ENCRYPTION_KEY).

    python scripts/generate_keys.py
"""

import secrets

from cryptography.fernet import Fernet

print(f"JWT_SECRET_KEY={secrets.token_urlsafe(64)}")
print(f"ENCRYPTION_KEY={Fernet.generate_key().decode()}")
