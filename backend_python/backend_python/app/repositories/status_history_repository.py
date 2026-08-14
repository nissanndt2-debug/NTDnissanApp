from app.config.database import fetch
from app.constants.index import MAX_LOG_PAGE_SIZE

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
                # SOLUCIÓN 2: Dejamos createdAt libre y le aplicamos la zona horaria al input string
                # El input '2026-08-13 00:00:00' se asume México, y se convierte a UTC para comparar con la BD
                date_conditions.append(
                    f'e."createdAt" >= (${param_index}::timestamp AT TIME ZONE \'America/Mexico_City\' AT TIME ZONE \'UTC\')'
                )
                params.append(f"{filters['startDate']} 00:00:00")
                param_index += 1
            if filters.get("endDate"):
                date_conditions.append(
                    f'e."createdAt" <= (${param_index}::timestamp AT TIME ZONE \'America/Mexico_City\' AT TIME ZONE \'UTC\')'
                )
                params.append(f"{filters['endDate']} 23:59:59")
                param_index += 1
            reported_date_filter = f"AND {' AND '.join(date_conditions)}"

        sort = "alpha" if filters.get("sort") == "alpha" else "date"
        order = filters.get("order") if filters.get("order") in ("asc", "desc") else "desc"
        order_by = f'u.vin {order.upper()}, e."createdAt" DESC' if sort == "alpha" else f'e."createdAt" {order.upper()}'
        limit = max(1, min(int(filters.get("limit") or 200), MAX_LOG_PAGE_SIZE))
        where_sql = f"AND {' AND '.join(where)}" if where else ""

        query = f"""
        WITH filtered_units AS (
          SELECT DISTINCT u.id as "unitId"
          FROM "UnitEvent" e
          JOIN "Unit" u ON u.id = e."unitId"
          WHERE e."eventType" = 'STATUS_CHANGE'
            -- SOLUCIÓN 1: Uso del operador GIN (@>)
            AND (e."eventData" @> '{{"newStatus": "REPORTED"}}' OR e."eventData" @> '{{"newStatus": "SENT"}}')
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
          e."eventData"->>'destination' as "noteDestination",
          e."eventType" as "eventType",
          cb.name as "changedByName",
          registeredBy.name as "registeredByName"
        FROM "UnitEvent" e
        JOIN "Unit" u ON u.id = e."unitId"
        JOIN "User" cb ON cb.id = e."performedById"
        JOIN "User" registeredBy ON registeredBy.id = u."registeredById"
        WHERE e."eventType" IN ('STATUS_CHANGE', 'PRIORITY_UPDATED', 'SCM_DECISION')
          AND e."unitId" IN (SELECT "unitId" FROM filtered_units)
        ORDER BY {order_by}
        LIMIT {limit}
        """

        return await fetch(query, *params)

status_history_repository = StatusHistoryRepository()