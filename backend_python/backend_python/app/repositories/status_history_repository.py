from app.config.database import fetch


class StatusHistoryRepository:
    async def search(self, filters: dict | None = None):
        filters = filters or {}

        where: list[str] = []
        params: list[object] = []
        param_index = 1

        if filters.get("registeredById"):
            where.append(f'u."registeredById" = ${param_index}')
            params.append(filters["registeredById"])
            param_index += 1
        if filters.get("market"):
            where.append(f'u.market = ${param_index}')
            params.append(filters["market"])
            param_index += 1
        if filters.get("vin"):
            where.append(f'u.vin ILIKE ${param_index}')
            params.append(f"%{filters['vin']}%")
            param_index += 1
        if filters.get("providerId"):
            where.append(f'u."providerId" = ${param_index}')
            params.append(filters["providerId"])
            param_index += 1
        if filters.get("plant"):
            where.append(f'u.plant = ${param_index}')
            params.append(filters["plant"])
            param_index += 1

        reported_date_filter = ""
        if filters.get("startDate") or filters.get("endDate"):
            date_conditions: list[str] = []
            if filters.get("startDate"):
                date_conditions.append(
                    f'e."createdAt" AT TIME ZONE \'UTC\' AT TIME ZONE \'America/Mexico_City\' >= ${param_index}::timestamp'
                )
                params.append(f"{filters['startDate']} 00:00:00")
                param_index += 1
            if filters.get("endDate"):
                date_conditions.append(
                    f'e."createdAt" AT TIME ZONE \'UTC\' AT TIME ZONE \'America/Mexico_City\' <= ${param_index}::timestamp'
                )
                params.append(f"{filters['endDate']} 23:59:59")
                param_index += 1
            reported_date_filter = f"AND {' AND '.join(date_conditions)}"

        sort = "alpha" if filters.get("sort") == "alpha" else "date"
        order = filters.get("order") if filters.get("order") in ("asc", "desc") else "desc"
        order_by = f'u.vin {order.upper()}, e."createdAt" DESC' if sort == "alpha" else f'e."createdAt" {order.upper()}'
        limit = int(filters.get("limit") or 200)
        where_sql = f"AND {' AND '.join(where)}" if where else ""

        # Parity with TS: fetch all status history rows for units initially REPORTED or SENT in filtered range.
        query = f"""
        WITH filtered_units AS (
          SELECT DISTINCT u.id as "unitId"
          FROM "UnitEvent" e
          JOIN "Unit" u ON u.id = e."unitId"
          WHERE e."eventType" = 'STATUS_CHANGE'
            AND e."eventData"->>'newStatus' IN ('REPORTED', 'SENT')
            {reported_date_filter}
            {where_sql}
        )
        SELECT
          e.id as "historyId",
                    e."createdAt" as "changedAt",
          u.id as "unitId", u.vin, u.market, u.lane, u."registeredById", u."providerId",
          e."eventData"->>'previousStatus' as "previousStatus",
          e."eventData"->>'newStatus' as "newStatus",
          e."eventData"->>'note' as "note",
          cb.name as "changedByName",
          registeredBy.name as "registeredByName"
        FROM "UnitEvent" e
        JOIN "Unit" u ON u.id = e."unitId"
        JOIN "User" cb ON cb.id = e."performedById"
        JOIN "User" registeredBy ON registeredBy.id = u."registeredById"
        WHERE e."eventType" = 'STATUS_CHANGE'
          AND e."unitId" IN (SELECT "unitId" FROM filtered_units)
        ORDER BY {order_by}
        LIMIT {limit}
        """

        return await fetch(query, *params)


status_history_repository = StatusHistoryRepository()
