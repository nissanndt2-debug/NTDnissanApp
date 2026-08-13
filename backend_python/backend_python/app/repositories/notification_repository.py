from app.config.database import execute, fetch, fetchrow


class NotificationRepository:
    async def create_many(self, notifications: list[dict]):
        if not notifications:
            return []

        args: list[object] = []
        values_sql: list[str] = []
        for notification in notifications:
            args.extend(
                [
                    notification["userId"],
                    notification["unitId"],
                    notification["type"],
                    notification.get("message"),
                ]
            )
            base = len(args) - 3
            values_sql.append(f'(${base}, ${base + 1}, ${base + 2}, ${base + 3})')

        return await fetch(
            f'INSERT INTO "Notification" ("userId", "unitId", type, message) VALUES {", ".join(values_sql)} RETURNING id, "userId", "unitId", type, message, "isRead", "createdAt"',
            *args,
        )

    async def list_by_user(self, user_id: int, is_read: bool | None = None, limit: int = 50, offset: int = 0):
        if is_read is None:
            return await fetch(
                'SELECT id, "userId", "unitId", type, message, "isRead", "createdAt" FROM "Notification" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT $2 OFFSET $3',
                user_id,
                limit,
                offset,
            )
        return await fetch(
            'SELECT id, "userId", "unitId", type, message, "isRead", "createdAt" FROM "Notification" WHERE "userId" = $1 AND "isRead" = $2 ORDER BY "createdAt" DESC LIMIT $3 OFFSET $4',
            user_id,
            is_read,
            limit,
            offset,
        )

    async def mark_read(self, user_id: int, notification_id: int) -> None:
        await execute('UPDATE "Notification" SET "isRead" = TRUE WHERE id = $1 AND "userId" = $2', notification_id, user_id)

    async def mark_all_read(self, user_id: int) -> None:
        await execute('UPDATE "Notification" SET "isRead" = TRUE WHERE "userId" = $1 AND "isRead" = FALSE', user_id)

    async def delete_by_id(self, user_id: int, notification_id: int) -> None:
        await execute('DELETE FROM "Notification" WHERE id = $1 AND "userId" = $2', notification_id, user_id)

    async def cleanup_stale_keep_recent(self, keep_recent_per_user: int, max_age_hours: int) -> int:
        rows = await fetch(
            '''
            WITH ranked AS (
                SELECT
                    id,
                    "userId",
                    "createdAt",
                    ROW_NUMBER() OVER (
                        PARTITION BY "userId"
                        ORDER BY "createdAt" DESC, id DESC
                    ) AS rank
                FROM "Notification"
            ),
            to_delete AS (
                SELECT id
                FROM ranked
                WHERE rank > $1
                AND "createdAt" < ((NOW() AT TIME ZONE 'UTC') - make_interval(hours => $2::int))
            )
            DELETE FROM "Notification" n
            USING to_delete d
            WHERE n.id = d.id
            RETURNING n.id
            ''',
            keep_recent_per_user,
            max_age_hours,
        )
        return len(rows)


notification_repository = NotificationRepository()
