from app.config.database import execute, fetch, fetchrow


class UnitDeletionRequestRepository:
    async def find_pending_by_unit_id(self, unit_id: int):
        return await fetchrow(
            '''
            SELECT id, "unitId", "requestedById", reason, status, "decisionNote", "decidedById", "requestedAt", "decidedAt", "createdAt", "updatedAt"
            FROM "UnitDeletionRequest"
            WHERE "unitId" = $1 AND status = 'PENDING'
            LIMIT 1
            ''',
            unit_id,
        )

    async def create(self, unit_id: int, requested_by_id: int, reason: str):
        return await fetchrow(
            '''
            INSERT INTO "UnitDeletionRequest" ("unitId", "requestedById", reason, status, "requestedAt", "createdAt", "updatedAt")
            VALUES ($1, $2, $3, 'PENDING', NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC')
            RETURNING id, "unitId", "requestedById", reason, status, "decisionNote", "decidedById", "requestedAt", "decidedAt", "createdAt", "updatedAt"
            ''',
            unit_id,
            requested_by_id,
            reason,
        )

    async def list_by_status(self, status: str, plant: str | None = None):
        query = '''
            SELECT
                r.id,
                r."unitId",
                r."requestedById",
                r.reason,
                r.status,
                r."decisionNote",
                r."decidedById",
                r."requestedAt",
                r."decidedAt",
                u.vin,
                u.market,
                u.lane,
                u.plant,
                req.name as "requestedByName",
                dec.name as "decidedByName"
            FROM "UnitDeletionRequest" r
            JOIN "Unit" u ON u.id = r."unitId"
            LEFT JOIN "User" req ON req.id = r."requestedById"
            LEFT JOIN "User" dec ON dec.id = r."decidedById"
            WHERE r.status = $1
        '''
        args: list[object] = [status]
        if plant:
            args.append(plant)
            query += f' AND u.plant = ${len(args)}'
        query += ' ORDER BY r."requestedAt" ASC'
        return await fetch(query, *args)

    async def find_by_id(self, request_id: int):
        return await fetchrow(
            '''
            SELECT
                r.id,
                r."unitId",
                r."requestedById",
                r.reason,
                r.status,
                r."decisionNote",
                r."decidedById",
                r."requestedAt",
                r."decidedAt",
                u.vin,
                u.market,
                u.lane,
                u."providerId",
                u.plant
            FROM "UnitDeletionRequest" r
            JOIN "Unit" u ON u.id = r."unitId"
            WHERE r.id = $1
            LIMIT 1
            ''',
            request_id,
        )

    async def reject(self, request_id: int, decision_note: str | None, decided_by_id: int):
        row = await fetchrow(
            '''
            UPDATE "UnitDeletionRequest"
            SET
                status = 'REJECTED',
                "decisionNote" = $1,
                "decidedById" = $2,
                "decidedAt" = NOW() AT TIME ZONE 'UTC',
                "updatedAt" = NOW() AT TIME ZONE 'UTC'
            WHERE id = $3 AND status = 'PENDING'
            RETURNING id, "unitId", "requestedById", reason, status, "decisionNote", "decidedById", "requestedAt", "decidedAt", "createdAt", "updatedAt"
            ''',
            decision_note,
            decided_by_id,
            request_id,
        )
        if not row:
            raise ValueError("Request is not pending or does not exist")
        return row

    async def approve_and_delete_unit(self, request_id: int, decided_by_id: int):
        row = await fetchrow(
            '''
            WITH updated_request AS (
                UPDATE "UnitDeletionRequest" r
                SET
                    status = 'APPROVED',
                    "decidedById" = $1,
                                        "decidedAt" = NOW() AT TIME ZONE 'UTC',
                                        "updatedAt" = NOW() AT TIME ZONE 'UTC'
                WHERE r.id = $2
                  AND r.status = 'PENDING'
                RETURNING r.id, r."unitId", r."requestedById", r.reason, r.status
            ),
            request_unit AS (
                SELECT
                    ur.id,
                    ur."unitId",
                    ur."requestedById",
                    ur.reason,
                    ur.status,
                    u.vin,
                    u.market,
                    u.lane,
                    u."providerId",
                    u.plant
                FROM updated_request ur
                JOIN "Unit" u ON u.id = ur."unitId"
            ),
            deleted_unit AS (
                DELETE FROM "Unit" u
                USING updated_request ur
                WHERE u.id = ur."unitId"
            )
            SELECT * FROM request_unit
            ''',
            decided_by_id,
            request_id,
        )

        if not row:
            existing = await fetchrow('SELECT id FROM "UnitDeletionRequest" WHERE id = $1', request_id)
            if not existing:
                raise ValueError("Deletion request not found")
            raise ValueError("Request is not pending")

        return row


unit_deletion_request_repository = UnitDeletionRequestRepository()
