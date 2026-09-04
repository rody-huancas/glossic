import hashlib
import hmac
import secrets


def hash_password(password: str, *, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 240_000)

    return f"{salt}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    salt, _ = encoded.split("$", 1)

    return hmac.compare_digest(hash_password(password, salt=salt), encoded)
