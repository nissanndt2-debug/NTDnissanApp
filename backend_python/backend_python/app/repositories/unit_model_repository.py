from app.config.database import fetch, fetchrow


class UnitModelRepository:
    async def find_all(self, include_inactive: bool = False, limit: int = 200):
        query = 'SELECT id, code, name, "isActive", "createdAt", "updatedAt" FROM "UnitModel"'
        args: list[object] = []

        if not include_inactive:
            query += ' WHERE "isActive" = TRUE'

        args.append(limit)
        query += f' ORDER BY code ASC LIMIT ${len(args)}'
        return await fetch(query, *args)

    async def find_by_id(self, model_id: int):
        return await fetchrow(
            'SELECT id, code, name, "isActive", "createdAt", "updatedAt" FROM "UnitModel" WHERE id = $1',
            model_id,
        )

    async def find_by_code(self, code: str):
        return await fetchrow(
            'SELECT id, code, name, "isActive", "createdAt", "updatedAt" FROM "UnitModel" WHERE code = $1',
            code,
        )

    async def create(self, code: str, name: str, is_active: bool = True):
        return await fetchrow(
            'INSERT INTO "UnitModel" (code, name, "isActive", "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW() AT TIME ZONE \'UTC\', NOW() AT TIME ZONE \'UTC\') RETURNING id, code, name, "isActive", "createdAt", "updatedAt"',
            code,
            name,
            is_active,
        )

    async def update(self, model_id: int, code: str | None = None, name: str | None = None, is_active: bool | None = None):
        set_parts = ['"updatedAt" = NOW() AT TIME ZONE \'UTC\'']
        args: list[object] = []

        if code is not None:
            args.append(code)
            set_parts.append(f'code = ${len(args)}')

        if name is not None:
            args.append(name)
            set_parts.append(f'name = ${len(args)}')

        if is_active is not None:
            args.append(is_active)
            set_parts.append(f'"isActive" = ${len(args)}')

        args.append(model_id)
        return await fetchrow(
            f'UPDATE "UnitModel" SET {", ".join(set_parts)} WHERE id = ${len(args)} RETURNING id, code, name, "isActive", "createdAt", "updatedAt"',
            *args,
        )


unit_model_repository = UnitModelRepository()
