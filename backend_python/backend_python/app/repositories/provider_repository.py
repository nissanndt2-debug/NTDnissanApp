from app.config.database import execute, fetch, fetchrow


class ProviderRepository:
    async def find_all(self):
        return await fetch('SELECT id, name, code, "createdAt", "updatedAt" FROM "Provider" ORDER BY name')

    async def create(self, name: str, code: str | None = None):
        return await fetchrow(
            'INSERT INTO "Provider" (name, code, "createdAt", "updatedAt") VALUES ($1, $2, NOW() AT TIME ZONE \'UTC\', NOW() AT TIME ZONE \'UTC\') RETURNING id, name, code, "createdAt", "updatedAt"',
            name,
            code,
        )

    async def delete(self, provider_id: int) -> None:
        await execute('DELETE FROM "Provider" WHERE id = $1', provider_id)


provider_repository = ProviderRepository()
