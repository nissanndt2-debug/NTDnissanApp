from hashlib import sha256

from app.config.database import execute, fetchrow


def _token_digest(token: str) -> str:
    """La base conserva un verificador, no un bearer token reutilizable."""
    return sha256(token.encode("utf-8")).hexdigest()


class RefreshTokenRepository:
    async def create(self, user_id: int, token: str, expires_at):
        digest = _token_digest(token)
        return await fetchrow(
            'INSERT INTO "RefreshToken" ("userId", token, "expiresAt", "createdAt") VALUES ($1, $2, $3, NOW() AT TIME ZONE \'UTC\') RETURNING id, "userId", token, "expiresAt", "revokedAt", "createdAt"',
            user_id,
            digest,
            expires_at,
        )

    async def find_by_token(self, token: str):
        digest = _token_digest(token)
        return await fetchrow(
            'SELECT id, "userId", token, "expiresAt", "revokedAt", "createdAt" FROM "RefreshToken" WHERE token = $1',
            digest,
        )

    async def revoke(self, token: str) -> None:
        await execute('UPDATE "RefreshToken" SET "revokedAt" = NOW() AT TIME ZONE \'UTC\' WHERE token = $1', _token_digest(token))

    async def revoke_by_user_id(self, user_id: int) -> None:
        await execute('UPDATE "RefreshToken" SET "revokedAt" = NOW() AT TIME ZONE \'UTC\' WHERE "userId" = $1 AND "revokedAt" IS NULL', user_id)


refresh_token_repository = RefreshTokenRepository()
