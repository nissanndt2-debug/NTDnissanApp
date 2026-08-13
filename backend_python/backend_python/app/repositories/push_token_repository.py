from app.config.database import execute, fetch


class PushTokenRepository:
    async def upsert(self, user_id: int, token: str) -> None:
        # OJO: `database._normalize_query` convierte cada "$N" a "%s" con una
        # sustitucion de texto (no entiende placeholders con nombre), asi que
        # reusar "$1" dos veces produce dos "%s" independientes en el SQL
        # final. Hay que pasar user_id dos veces, en el orden en que aparece.
        await execute(
            '''
            INSERT INTO "PushToken" ("userId", token)
            VALUES ($1, $2)
            ON CONFLICT (token)
            DO UPDATE SET "userId" = $3, "updatedAt" = NOW() AT TIME ZONE 'UTC'
            ''',
            user_id,
            token,
            user_id,
        )

    async def delete(self, user_id: int, token: str) -> None:
        await execute('DELETE FROM "PushToken" WHERE "userId" = $1 AND token = $2', user_id, token)

    async def delete_tokens(self, tokens: list[str]) -> None:
        """Limpieza tras un envio: Expo marca DeviceNotRegistered cuando el
        usuario desinstalo la app o revoco los permisos. Guardar ese token
        solo produce reintentos que van a fallar siempre igual."""
        if not tokens:
            return
        await execute('DELETE FROM "PushToken" WHERE token = ANY($1::text[])', tokens)

    async def find_by_user_ids(self, user_ids: list[int]) -> list[dict]:
        if not user_ids:
            return []
        return await fetch(
            'SELECT "userId", token FROM "PushToken" WHERE "userId" = ANY($1::int[])',
            user_ids,
        )


push_token_repository = PushTokenRepository()
