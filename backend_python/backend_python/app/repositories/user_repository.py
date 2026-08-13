from app.config.database import fetch, fetchrow, execute


class UserRepository:
    async def find_by_email(self, email: str):
        return await fetchrow(
            'SELECT id, email, password, name, "roleId", "providerId", plant, "createdAt", "updatedAt" FROM "User" WHERE email = $1',
            email,
        )

    async def find_by_id(self, user_id: int):
        return await fetchrow(
            'SELECT id, email, password, name, "roleId", "providerId", plant, "createdAt", "updatedAt" FROM "User" WHERE id = $1',
            user_id,
        )

    async def update_password(self, user_id: int, hashed_password: str) -> None:
        await execute('UPDATE "User" SET password = $1, "updatedAt" = NOW() AT TIME ZONE \'UTC\' WHERE id = $2', hashed_password, user_id)

    async def find_by_role_ids(self, role_ids: list[int], plant: str | None = None):
        if not role_ids:
            return []
        if plant:
            return await fetch(
                'SELECT id, email, password, name, "roleId", "providerId", plant, "createdAt", "updatedAt" FROM "User" WHERE "roleId" = ANY($1::int[]) AND (plant = $2 OR plant IS NULL)',
                role_ids,
                plant,
            )
        return await fetch(
            'SELECT id, email, password, name, "roleId", "providerId", plant, "createdAt", "updatedAt" FROM "User" WHERE "roleId" = ANY($1::int[])',
            role_ids,
        )


user_repository = UserRepository()
