import json
from datetime import datetime, timedelta, timezone

from app.config.database import execute, fetch, fetchrow
from app.constants.index import TIMEZONE


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class UnitRepository:
    async def find_all(self, limit: int = 50, provider_id: int | None = None, plant: str | None = None):
        query = """
        SELECT
            u.id, u.vin, u.market, u.lane, u."statusId", u."providerId", u.plant,
            u."isAvailableToday", u."registeredById", u."estimatedRepairHours",
            u."estimatedCompletionDate", u."priorityNote", u."priorityRank",
            u."priorityAssignedById", u."priorityAssignedAt", u."createdAt", u."updatedAt", u."wtyComment",
            s.name as "statusName"
        FROM "Unit" u
        JOIN "UnitStatus" s ON s.id = u."statusId"
        WHERE 1=1
        """
        args: list[object] = []
        if provider_id is not None:
            args.append(provider_id)
            query += f' AND u."providerId" = ${len(args)}'
        if plant is not None:
            args.append(plant)
            query += f' AND u.plant = ${len(args)}'
        args.append(limit)
        query += f' ORDER BY u."createdAt" DESC LIMIT ${len(args)}'
        return await fetch(query, *args)

    async def find_by_id(self, unit_id: int):
        return await fetchrow(
            """
            SELECT
                u.id, u.vin, u.market, u.lane, u."statusId", u."providerId", u.plant,
                u."isAvailableToday", u."registeredById", u."estimatedRepairHours",
                u."estimatedCompletionDate", u."priorityNote", u."priorityRank",
                u."priorityAssignedById", u."priorityAssignedAt", u."createdAt", u."updatedAt", u."wtyComment",
                s.name as "statusName"
            FROM "Unit" u
            JOIN "UnitStatus" s ON s.id = u."statusId"
            WHERE u.id = $1
            """,
            unit_id,
        )

    async def find_by_vin(self, vin: str, plant: str | None = None):
        if plant:
            return await fetchrow(
                """
                SELECT u.*, s.name as "statusName"
                FROM "Unit" u
                JOIN "UnitStatus" s ON s.id = u."statusId"
                WHERE u.vin = $1 AND u.plant = $2
                """,
                vin,
                plant,
            )
        return await fetchrow(
            """
            SELECT u.*, s.name as "statusName"
            FROM "Unit" u
            JOIN "UnitStatus" s ON s.id = u."statusId"
            WHERE u.vin = $1
            """,
            vin,
        )

    async def find_by_status_name(self, name: str, limit: int = 50, provider_id: int | None = None, plant: str | None = None):
        query = """
            SELECT
                u.id, u.vin, u.market, u.lane, u."statusId", u."providerId", u.plant,
                u."isAvailableToday", u."registeredById", u."estimatedRepairHours",
                u."estimatedCompletionDate", u."priorityNote", u."priorityRank",
                u."priorityAssignedById", u."priorityAssignedAt", u."createdAt", u."updatedAt", u."wtyComment",
                s.name as "statusName",
                d.id as "defectId", d."defectType", d.zone, d."gradeId", dg.code as grade,
                d.description, d."isResolved", d."photoUrls"
            FROM "Unit" u
            JOIN "UnitStatus" s ON s.id = u."statusId"
            LEFT JOIN "UnitDefect" d ON d."unitId" = u.id AND d."isActive" = TRUE
            LEFT JOIN "DefectGrade" dg ON dg.id = d."gradeId"
            WHERE s.name = $1
        """
        args: list[object] = [name]
        if provider_id is not None:
            args.append(provider_id)
            query += f' AND u."providerId" = ${len(args)}'
        if plant is not None:
            args.append(plant)
            query += f' AND u.plant = ${len(args)}'
        args.append(limit)
        query += f' ORDER BY u."createdAt" DESC LIMIT ${len(args)}'

        rows = await fetch(query, *args)
        units: dict[int, dict] = {}
        for row in rows:
            unit_id = int(row["id"])
            if unit_id not in units:
                units[unit_id] = {
                    "id": row["id"],
                    "vin": row["vin"],
                    "market": row["market"],
                    "lane": row["lane"],
                    "statusId": row["statusId"],
                    "providerId": row["providerId"],
                    "plant": row.get("plant"),
                    "statusName": row["statusName"],
                    "isAvailableToday": row["isAvailableToday"],
                    "registeredById": row["registeredById"],
                    "estimatedRepairHours": row["estimatedRepairHours"],
                    "estimatedCompletionDate": row["estimatedCompletionDate"],
                    "priorityNote": row["priorityNote"],
                    "priorityRank": row["priorityRank"],
                    "priorityAssignedById": row["priorityAssignedById"],
                    "priorityAssignedAt": row["priorityAssignedAt"],
                    "createdAt": row["createdAt"],
                    "updatedAt": row["updatedAt"],
                    "defects": [],
                }
            if row.get("defectId"):
                units[unit_id]["defects"].append(
                    {
                        "id": row["defectId"],
                        "type": row["defectType"],
                        "zone": row["zone"],
                        "grade": row["grade"],
                        "description": row["description"],
                        "isResolved": row["isResolved"],
                        "photoUrls": row["photoUrls"] if isinstance(row.get("photoUrls"), list) else [],
                    }
                )
        return list(units.values())

    async def update_priority(self, unit_id: int, note: str | None, rank: int | None, assigned_by_id: int):
        final_rank = rank
        if not final_rank:
            row = await fetchrow('SELECT COALESCE(MAX("priorityRank"), 0) as max_rank FROM "Unit" WHERE "priorityRank" IS NOT NULL')
            final_rank = int((row or {}).get("max_rank") or 0) + 1

        await execute(
            'UPDATE "Unit" SET "priorityNote" = $1, "priorityRank" = $2, "priorityAssignedById" = $3, "priorityAssignedAt" = NOW() AT TIME ZONE \'UTC\', "updatedAt" = NOW() AT TIME ZONE \'UTC\' WHERE id = $4',
            note,
            final_rank,
            assigned_by_id,
            unit_id,
        )

    async def reorder_priority(self, unit_ids: list[int], assigned_by_id: int):
        if not unit_ids:
            return

        args: list[object] = [assigned_by_id]
        values_sql: list[str] = []
        for idx, unit_id in enumerate(unit_ids, start=1):
            args.append(unit_id)
            unit_pos = len(args)
            args.append(idx)
            rank_pos = len(args)
            values_sql.append(f'(${unit_pos}, ${rank_pos})')

        await execute(
            f'''
            UPDATE "Unit" u
            SET
                "priorityRank" = v.rank,
                "priorityAssignedById" = $1,
                "priorityAssignedAt" = NOW() AT TIME ZONE 'UTC',
                "updatedAt" = NOW() AT TIME ZONE 'UTC'
            FROM (VALUES {", ".join(values_sql)}) AS v(id, rank)
            WHERE u.id = v.id
            ''',
            *args,
        )

    async def update_status(self, unit_id: int, new_status_name: str, changed_by_id: int, estimated_repair_hours=None, is_available_today=None, note=None, wty_comment=None):
        status = await fetchrow('SELECT id FROM "UnitStatus" WHERE name = $1', new_status_name)
        if not status:
            raise ValueError("Invalid status")
        new_status_id = status["id"]
        prev = await fetchrow('SELECT "statusId" FROM "Unit" WHERE id = $1', unit_id)
        previous_status_id = prev.get("statusId") if prev else None

        # When a unit enters IN_REPAIR, compute an estimated completion datetime.
        # Base time is the latest completion in queue; if none, use current time.
        effective_repair_hours = estimated_repair_hours
        if new_status_name == "IN_REPAIR" and effective_repair_hours is None:
            unit_row = await fetchrow('SELECT "estimatedRepairHours" FROM "Unit" WHERE id = $1', unit_id)
            effective_repair_hours = unit_row.get("estimatedRepairHours") if unit_row else None

        estimated_completion_date = None
        if new_status_name == "IN_REPAIR" and effective_repair_hours is not None:
            queue_last = await fetchrow(
                '''
                SELECT u."estimatedCompletionDate"
                FROM "Unit" u
                JOIN "UnitStatus" s ON s.id = u."statusId"
                WHERE s.name = 'IN_REPAIR'
                  AND u."estimatedRepairHours" IS NOT NULL
                  AND ((u."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date = (NOW() AT TIME ZONE 'America/Mexico_City')::date
                  AND u.id != $1
                ORDER BY u."estimatedCompletionDate" DESC NULLS LAST
                LIMIT 1
                ''',
                unit_id,
            )
            start_date = (queue_last or {}).get("estimatedCompletionDate") or _utc_now_naive()
            estimated_completion_date = start_date + timedelta(hours=float(effective_repair_hours))

        set_parts = ['"statusId" = $1', '"updatedAt" = NOW() AT TIME ZONE \'UTC\'']
        args: list[object] = [new_status_id]

        if estimated_repair_hours is not None:
            args.append(estimated_repair_hours)
            set_parts.append(f'"estimatedRepairHours" = ${len(args)}')
        if estimated_completion_date is not None:
            args.append(estimated_completion_date)
            set_parts.append(f'"estimatedCompletionDate" = ${len(args)}')
        if is_available_today is not None:
            args.append(is_available_today)
            set_parts.append(f'"isAvailableToday" = ${len(args)}')
        if wty_comment is not None:
            args.append(wty_comment)
            set_parts.append(f'"wtyComment" = ${len(args)}')
        if new_status_name in ("IN_REPAIR", "RELEASED", "WWS_RELEASED", "ACCEPTED", "REJECTED"):
            set_parts.append('"priorityRank" = NULL')
        if new_status_name == "REJECTED" and note:
            args.append(note)
            set_parts.append(f'"rejectionNote" = ${len(args)}')

        args.append(unit_id)
        await execute(f'UPDATE "Unit" SET {", ".join(set_parts)} WHERE id = ${len(args)}', *args)

        if new_status_name in ("RELEASED", "WWS_RELEASED"):
            await execute(
                'UPDATE "UnitDefect" SET "isResolved" = TRUE, "updatedAt" = NOW() AT TIME ZONE \'UTC\' WHERE "unitId" = $1 AND "isActive" = TRUE AND "isResolved" = FALSE',
                unit_id,
            )
        if new_status_name == "REJECTED":
            await execute(
                'UPDATE "UnitDefect" SET "isResolved" = FALSE, "updatedAt" = NOW() AT TIME ZONE \'UTC\' WHERE "unitId" = $1 AND "isActive" = TRUE',
                unit_id,
            )

        prev_name_row = await fetchrow('SELECT name FROM "UnitStatus" WHERE id = $1', previous_status_id) if previous_status_id else None
        new_name_row = await fetchrow('SELECT name FROM "UnitStatus" WHERE id = $1', new_status_id)

        event_data: dict[str, object] = {
            "previousStatus": (prev_name_row or {}).get("name"),
            "newStatus": (new_name_row or {}).get("name"),
            "previousStatusId": previous_status_id,
            "newStatusId": new_status_id,
        }
        if estimated_repair_hours is not None:
            event_data["estimatedRepairHours"] = estimated_repair_hours
        elif new_status_name == "IN_REPAIR" and effective_repair_hours is not None:
            event_data["estimatedRepairHours"] = float(effective_repair_hours)
        if estimated_completion_date is not None:
            event_data["estimatedCompletionDate"] = estimated_completion_date.isoformat()
        if is_available_today is not None:
            event_data["isAvailableToday"] = is_available_today
        if note:
            event_data["note"] = note

        await execute(
            'INSERT INTO "UnitEvent" ("unitId", "eventType", "eventData", "performedById", "createdAt") VALUES ($1, $2, $3::jsonb, $4, NOW() AT TIME ZONE \'UTC\')',
            unit_id,
            "STATUS_CHANGE",
            json.dumps(event_data),
            changed_by_id,
        )

    async def create(self, unit: dict, initial_status: str = "REPORTED"):
        status = await fetchrow('SELECT id FROM "UnitStatus" WHERE name = $1', initial_status)
        if not status:
            raise ValueError(f"Status {initial_status} no encontrado en la base de datos")
        status_id = status["id"]

        row = await fetchrow(
            'INSERT INTO "Unit" (vin, market, lane, "registeredById", "providerId", plant, "statusId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() AT TIME ZONE \'UTC\', NOW() AT TIME ZONE \'UTC\') RETURNING id',
            unit["vin"],
            unit["market"],
            unit["lane"],
            unit["registeredById"],
            unit.get("providerId"),
            unit.get("plant"),
            status_id,
        )
        unit_id = int(row["id"])

        status_name = await fetchrow('SELECT name FROM "UnitStatus" WHERE id = $1', status_id)
        event_data = {
            "previousStatus": None,
            "newStatus": (status_name or {}).get("name") or initial_status,
            "previousStatusId": None,
            "newStatusId": status_id,
            "initialRegistration": True,
        }
        await execute(
            'INSERT INTO "UnitEvent" ("unitId", "eventType", "eventData", "performedById", "createdAt") VALUES ($1, $2, $3::jsonb, $4, NOW() AT TIME ZONE \'UTC\')',
            unit_id,
            "STATUS_CHANGE",
            json.dumps(event_data),
            unit["registeredById"],
        )
        return unit_id

    async def create_defect(
        self,
        unit_id: int,
        defect_type: str,
        zone: str,
        grade_code: str,
        description: str | None,
        registered_by_id: int,
        photo_urls: list[str] | None = None,
        options: dict | None = None,
    ):
        grade = await fetchrow('SELECT id FROM "DefectGrade" WHERE code = $1', grade_code)
        if not grade:
            raise ValueError("Invalid grade code")
        grade_id = grade["id"]

        is_from_wws = bool((options or {}).get("isFromWws"))
        override_existing = bool((options or {}).get("overrideExisting"))
        wws_version = (options or {}).get("wwsVersion")
        normalized_photo_urls = [url.strip() for url in (photo_urls or []) if isinstance(url, str) and url.strip()]

        existing = await fetch(
            'SELECT id, "gradeId" FROM "UnitDefect" WHERE "unitId" = $1 AND "defectType" = $2 AND zone = $3 AND "isActive" = TRUE',
            unit_id,
            defect_type,
            zone,
        )
        if existing:
            existing_row = existing[0]
            if existing_row.get("gradeId") == grade_id:
                return existing_row["id"]
            if is_from_wws and override_existing:
                await execute(
                    'UPDATE "UnitDefect" SET "isActive" = FALSE, "overriddenByWws" = TRUE, "wwsVersion" = $1, "updatedAt" = NOW() AT TIME ZONE \'UTC\' WHERE id = $2',
                    wws_version,
                    existing_row["id"],
                )

        row = await fetchrow(
            'INSERT INTO "UnitDefect" ("unitId", "defectType", zone, "gradeId", description, "registeredById", "isActive", "wwsVersion", "photoUrls", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, NOW() AT TIME ZONE \'UTC\', NOW() AT TIME ZONE \'UTC\') RETURNING id',
            unit_id,
            defect_type,
            zone,
            grade_id,
            description,
            registered_by_id,
            wws_version,
            normalized_photo_urls,
        )
        return row["id"] if row else None

    async def update_defect_grade(self, defect_id: int, new_grade: str, updated_by_id: int):
        grade = await fetchrow('SELECT id FROM "DefectGrade" WHERE code = $1', new_grade)
        if not grade:
            raise ValueError("Invalid grade code")
        await execute(
            'UPDATE "UnitDefect" SET "gradeId" = $1, "updatedAt" = NOW() AT TIME ZONE \'UTC\' WHERE id = $2',
            grade["id"],
            defect_id,
        )

    async def find_by_id_with_defects(self, unit_id: int):
        unit = await self.find_by_id(unit_id)
        if not unit:
            return None

        rows = await fetch(
            'SELECT d.id, d."defectType", d.zone, g.code as grade, d.description, d."isResolved", d."photoUrls" FROM "UnitDefect" d JOIN "DefectGrade" g ON g.id = d."gradeId" WHERE d."unitId" = $1 AND d."isActive" = TRUE',
            unit_id,
        )

        unit["defects"] = [
            {
                "id": row["id"],
                "type": row["defectType"],
                "zone": row["zone"],
                "grade": row["grade"],
                "description": row["description"],
                "isResolved": row["isResolved"],
                "photoUrls": row["photoUrls"] if isinstance(row.get("photoUrls"), list) else [],
            }
            for row in rows
        ]

        return unit

    async def get_unit_photo_urls(self, unit_id: int) -> list[str]:
        rows = await fetch(
            'SELECT "photoUrls" FROM "UnitDefect" WHERE "unitId" = $1 AND "photoUrls" IS NOT NULL AND array_length("photoUrls", 1) > 0',
            unit_id,
        )

        urls: list[str] = []
        for row in rows:
            photo_urls = row.get("photoUrls")
            if isinstance(photo_urls, list):
                urls.extend(url for url in photo_urls if isinstance(url, str) and url.strip())

        return urls

    async def get_defect_photo_urls(self, unit_id: int, defect_id: int) -> list[str]:
        row = await fetchrow(
            'SELECT "photoUrls" FROM "UnitDefect" WHERE id = $1 AND "unitId" = $2 LIMIT 1',
            defect_id,
            unit_id,
        )

        photo_urls = row.get("photoUrls") if row else None
        if not isinstance(photo_urls, list):
            return []

        return [url for url in photo_urls if isinstance(url, str) and url.strip()]

    async def clear_defect_photo_urls(self, unit_id: int, defect_id: int) -> None:
        await execute(
            'UPDATE "UnitDefect" SET "photoUrls" = ARRAY[]::TEXT[], "updatedAt" = NOW() AT TIME ZONE \'UTC\' WHERE id = $1 AND "unitId" = $2',
            defect_id,
            unit_id,
        )

    async def clear_unit_photo_urls(self, unit_id: int) -> None:
        await execute(
            'UPDATE "UnitDefect" SET "photoUrls" = ARRAY[]::TEXT[], "updatedAt" = NOW() AT TIME ZONE \'UTC\' WHERE "unitId" = $1 AND "photoUrls" IS NOT NULL AND array_length("photoUrls", 1) > 0',
            unit_id,
        )

    async def get_defect_stats(self, today_only: bool = False, plant: str | None = None):
        query = """
            SELECT dg.code, COUNT(ud.id)::int as count
            FROM "UnitDefect" ud
            JOIN "DefectGrade" dg ON dg.id = ud."gradeId"
            JOIN "Unit" u ON u.id = ud."unitId"
            WHERE ud."isActive" = TRUE
        """
        args: list[object] = []
        if today_only:
            query += ' AND ((u."createdAt" AT TIME ZONE \'UTC\') AT TIME ZONE \'America/Mexico_City\')::date = (NOW() AT TIME ZONE \'America/Mexico_City\')::date'
        if plant:
            args.append(plant)
            query += f' AND u.plant = ${len(args)}'
        query += ' GROUP BY dg.code'

        rows = await fetch(query, *args)
        stats = {"v1": 0, "v2": 0, "v3": 0}
        for row in rows:
            if row["code"] == "V1":
                stats["v1"] = row["count"]
            elif row["code"] == "V2":
                stats["v2"] = row["count"]
            elif row["code"] == "V3":
                stats["v3"] = row["count"]
        return stats

    async def get_today_units(self, provider_id: int | None = None, plant: str | None = None):
        def _build_query(include_deletion_request: bool) -> str:
            deletion_columns = (
                '''
                dr.id as "deletionRequestId",
                dr.status as "deletionRequestStatus",
                dr.reason as "deletionRequestReason",
                dr."decisionNote" as "deletionRequestDecisionNote",
                dr."requestedAt" as "deletionRequestedAt",
                dr."decidedAt" as "deletionDecidedAt",
                req_usr.name as "deletionRequestedBy",
                dec_usr.name as "deletionDecidedBy",
                '''
                if include_deletion_request
                else '''
                NULL::INT as "deletionRequestId",
                NULL::VARCHAR as "deletionRequestStatus",
                NULL::VARCHAR as "deletionRequestReason",
                NULL::VARCHAR as "deletionRequestDecisionNote",
                NULL::TIMESTAMP as "deletionRequestedAt",
                NULL::TIMESTAMP as "deletionDecidedAt",
                NULL::VARCHAR as "deletionRequestedBy",
                NULL::VARCHAR as "deletionDecidedBy",
                '''
            )

            deletion_joins = (
                '''
            LEFT JOIN LATERAL (
                SELECT id, status, reason, "decisionNote", "requestedAt", "decidedAt", "requestedById", "decidedById"
                FROM "UnitDeletionRequest"
                WHERE "unitId" = u.id
                ORDER BY "requestedAt" DESC
                LIMIT 1
            ) dr ON TRUE
            LEFT JOIN "User" req_usr ON req_usr.id = dr."requestedById"
            LEFT JOIN "User" dec_usr ON dec_usr.id = dr."decidedById"
                '''
                if include_deletion_request
                else ""
            )

            defect_join = '''
            LEFT JOIN LATERAL (
                SELECT
                    CASE
                        WHEN POSITION(' - ' IN d."defectType") > 0 THEN BTRIM(SPLIT_PART(d."defectType", ' - ', 1))
                        ELSE NULL
                    END as "defectCode",
                    CASE
                        WHEN POSITION('|' IN d."defectType") > 0 THEN BTRIM(SPLIT_PART(d."defectType", '|', 2))
                        WHEN POSITION(' - ' IN d."defectType") > 0 THEN BTRIM(SPLIT_PART(d."defectType", ' - ', 2))
                        WHEN d.description IS NOT NULL AND d.description <> '' THEN d.description
                        ELSE d."defectType"
                    END as "defectSummary",
                    COUNT(*) OVER()::int as "activeDefectCount"
                FROM "UnitDefect" d
                LEFT JOIN "DefectGrade" dg ON dg.id = d."gradeId"
                WHERE d."unitId" = u.id
                  AND d."isActive" = TRUE
                ORDER BY
                    CASE dg.code
                        WHEN 'V1' THEN 1
                        WHEN 'V2' THEN 2
                        WHEN 'V3' THEN 3
                        ELSE 4
                    END,
                    d."createdAt" ASC
                LIMIT 1
            ) defect_info ON TRUE
            '''

            return f'''
            SELECT
                u.id, u.vin, u.market, u.lane, u."statusId", u."providerId",
                u."isAvailableToday", u."registeredById", u."estimatedRepairHours",
                u."estimatedCompletionDate", u."priorityNote", u."priorityRank",
                u."scmDecision", u."scmDecisionNote",
                u."scmDecisionAt" as "scmDecisionAt",
                u."scmDecisionById",
                {deletion_columns}
                u."createdAt" as "createdAt",
                u."updatedAt" as "updatedAt",
                last_status."createdAt" as "statusUpdatedAt",
                s.name as "statusName",
                usr.name as "registeredBy",
                usr."providerId" as "registeredByProviderId",
                scm.name as "scmDecidedBy",
                defect_info."defectCode",
                defect_info."defectSummary",
                                COALESCE(defect_info."activeDefectCount", 0) as "activeDefectCount",
                                EXISTS (
                                        SELECT 1
                                        FROM "UnitDefect" d_photo
                                        WHERE d_photo."unitId" = u.id
                                            AND d_photo."isActive" = TRUE
                                            AND d_photo."photoUrls" IS NOT NULL
                                            AND array_length(d_photo."photoUrls", 1) > 0
                                ) as "hasDefectPhotos"
            FROM "Unit" u
            JOIN "UnitStatus" s ON s.id = u."statusId"
            LEFT JOIN "User" usr ON usr.id = u."registeredById"
            LEFT JOIN "User" scm ON scm.id = u."scmDecisionById"
            {deletion_joins}
            {defect_join}
            LEFT JOIN LATERAL (
                SELECT "createdAt"
                FROM "UnitEvent"
                WHERE "unitId" = u.id AND "eventType" = 'STATUS_CHANGE'
                ORDER BY "createdAt" DESC
                LIMIT 1
            ) last_status ON TRUE
            WHERE ((u."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date = (NOW() AT TIME ZONE 'America/Mexico_City')::date
            '''

        args: list[object] = []

        try:
            query = _build_query(include_deletion_request=True)
            if provider_id is not None:
                args.append(provider_id)
                query += f' AND u."providerId" = ${len(args)}'
            if plant is not None:
                args.append(plant)
                query += f' AND u.plant = ${len(args)}'
            query += ' ORDER BY u."createdAt" DESC'
            return await fetch(query, *args)
        except Exception as exc:
            if 'UnitDeletionRequest' not in str(exc):
                raise

            # Backward-compatible fallback when DB migration for UnitDeletionRequest has not been applied yet.
            args = []
            query = _build_query(include_deletion_request=False)
            if provider_id is not None:
                args.append(provider_id)
                query += f' AND u."providerId" = ${len(args)}'
            if plant is not None:
                args.append(plant)
                query += f' AND u.plant = ${len(args)}'
            query += ' ORDER BY u."createdAt" DESC'
            return await fetch(query, *args)

    async def set_scm_decision(self, unit_id: int, decision: str, note: str | None, decided_by_id: int):
        await execute(
            'UPDATE "Unit" SET "scmDecision" = $1, "scmDecisionNote" = $2, "scmDecisionAt" = NOW() AT TIME ZONE \'UTC\', "scmDecisionById" = $3, "updatedAt" = NOW() AT TIME ZONE \'UTC\' WHERE id = $4',
            decision,
            note,
            decided_by_id,
            unit_id,
        )

    async def get_status_stats(self, plant: str | None = None):
        query = 'SELECT s.name as "statusName", COUNT(u.id)::int as count FROM "UnitStatus" s LEFT JOIN "Unit" u ON u."statusId" = s.id'
        args: list[object] = []
        if plant is not None:
            args.append(plant)
            query += f' AND u.plant = ${len(args)}'
        query += ' GROUP BY s.name HAVING COUNT(u.id) > 0 ORDER BY s.name'
        rows = await fetch(query, *args)
        return {row["statusName"]: row["count"] for row in rows}

    async def create_note_event(self, unit_id: int, event_type: str, note: str, performed_by_id: int):
        event_data = {"note": note, "timestamp": _utc_now_iso()}
        await execute(
            'INSERT INTO "UnitEvent" ("unitId", "eventType", "eventData", "performedById", "createdAt") VALUES ($1, $2, $3::jsonb, $4, NOW() AT TIME ZONE \'UTC\')',
            unit_id,
            event_type,
            json.dumps(event_data),
            performed_by_id,
        )

    async def update_estimated_repair_time(self, unit_id: int, estimated_repair_hours: float, updated_by_id: int):
        unit = await self.find_by_id(unit_id)
        if not unit:
            raise ValueError("Unit not found")

        if unit.get("statusName") == "IN_REPAIR":
            queue = await fetchrow(
                'SELECT MAX(u."estimatedCompletionDate") as latest FROM "Unit" u JOIN "UnitStatus" s ON s.id = u."statusId" WHERE s.name = \'IN_REPAIR\' AND u."estimatedRepairHours" IS NOT NULL AND ((u."createdAt" AT TIME ZONE \'UTC\') AT TIME ZONE \'America/Mexico_City\')::date = (NOW() AT TIME ZONE \'America/Mexico_City\')::date AND u.id != $1',
                unit_id,
            )
            latest = (queue or {}).get("latest")
            start_date = latest or unit.get("updatedAt") or _utc_now_naive()
            estimated_completion_date = start_date + timedelta(hours=estimated_repair_hours)
        else:
            estimated_completion_date = await self.calculate_estimated_completion_date(estimated_repair_hours)

        await execute(
            'UPDATE "Unit" SET "estimatedRepairHours" = $1, "estimatedCompletionDate" = $2, "updatedAt" = NOW() AT TIME ZONE \'UTC\' WHERE id = $3',
            estimated_repair_hours,
            estimated_completion_date,
            unit_id,
        )

        event_data = {
            "estimatedRepairHours": estimated_repair_hours,
            "estimatedCompletionDate": estimated_completion_date.isoformat(),
            "updatedById": updated_by_id,
        }
        await execute(
            'INSERT INTO "UnitEvent" ("unitId", "eventType", "eventData", "performedById", "createdAt") VALUES ($1, $2, $3::jsonb, $4, NOW() AT TIME ZONE \'UTC\')',
            unit_id,
            "REPAIR_TIME_UPDATED",
            json.dumps(event_data),
            updated_by_id,
        )

    async def calculate_estimated_completion_date(self, new_estimated_hours: float):
        row = await fetchrow(
            'SELECT MAX(u."estimatedCompletionDate") as latest FROM "Unit" u JOIN "UnitStatus" s ON s.id = u."statusId" WHERE s.name = \'IN_REPAIR\' AND u."estimatedRepairHours" IS NOT NULL AND ((u."createdAt" AT TIME ZONE \'UTC\') AT TIME ZONE \'America/Mexico_City\')::date = (NOW() AT TIME ZONE \'America/Mexico_City\')::date'
        )
        latest = (row or {}).get("latest")
        start = latest or _utc_now_naive()
        return start + timedelta(hours=new_estimated_hours)

    async def get_units_in_repair(self, provider_id: int | None = None, plant: str | None = None, include_archived: bool = False):
        query = """
            SELECT
                u.id, u.vin, u."estimatedRepairHours", u."estimatedCompletionDate",
                u."updatedAt", u."providerId", p.name as "providerName"
            FROM "Unit" u
            JOIN "UnitStatus" s ON s.id = u."statusId"
            LEFT JOIN "Provider" p ON p.id = u."providerId"
            WHERE u."estimatedRepairHours" IS NOT NULL
        """

        if include_archived:
            query += " AND s.name IN ('IN_REPAIR', 'ARCHIVED')"
        else:
            query += """
              AND s.name = 'IN_REPAIR'
                            AND ((u."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date = (NOW() AT TIME ZONE 'America/Mexico_City')::date
            """

        args: list[object] = []
        if provider_id is not None:
            args.append(provider_id)
            query += f' AND u."providerId" = ${len(args)}'
        if plant is not None:
            args.append(plant)
            query += f' AND u.plant = ${len(args)}'
        query += ' ORDER BY p.name ASC NULLS LAST, u."updatedAt" ASC'
        return await fetch(query, *args)

    async def reset_daily_queue_partial(self, executed_by_id: int | None = None):
        # Keep history intact; only mark old-day units as not available for the current day.
        row = await fetchrow(
            '''
            WITH updated AS (
                UPDATE "Unit"
                SET
                    "isAvailableToday" = FALSE,
                                        "updatedAt" = NOW() AT TIME ZONE 'UTC'
                WHERE COALESCE("isAvailableToday", FALSE) = TRUE
                                    AND (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date <> (NOW() AT TIME ZONE 'America/Mexico_City')::date
                RETURNING id
            )
            SELECT COUNT(*)::int AS count FROM updated
            '''
        )

        updated_count = int((row or {}).get("count") or 0)

        return {
            "updatedCount": updated_count,
            "timezone": TIMEZONE,
            "criteria": "createdAt",
            "executedById": executed_by_id,
            "executedAt": _utc_now_iso(),
        }

    async def archive_unit(self, unit_id: int, archived_by_id: int):
        status = await fetchrow("SELECT id FROM \"UnitStatus\" WHERE name = 'ARCHIVED'")
        if not status:
            raise ValueError("ARCHIVED status not found")
        previous = await fetchrow('SELECT "statusId" FROM "Unit" WHERE id = $1', unit_id)
        previous_status_id = previous.get("statusId") if previous else None

        await execute(
            'UPDATE "Unit" SET "statusId" = $1, "archivedAt" = NOW() AT TIME ZONE \'UTC\', "archivedById" = $2, "priorityRank" = NULL, "updatedAt" = NOW() AT TIME ZONE \'UTC\' WHERE id = $3',
            status["id"],
            archived_by_id,
            unit_id,
        )

        prev_name = await fetchrow('SELECT name FROM "UnitStatus" WHERE id = $1', previous_status_id) if previous_status_id else None
        event_data = {
            "previousStatus": (prev_name or {}).get("name"),
            "newStatus": "ARCHIVED",
            "previousStatusId": previous_status_id,
            "newStatusId": status["id"],
            "note": "Unit archived after SCM decision",
        }
        await execute(
            'INSERT INTO "UnitEvent" ("unitId", "eventType", "eventData", "performedById", "createdAt") VALUES ($1, $2, $3::jsonb, $4, NOW() AT TIME ZONE \'UTC\')',
            unit_id,
            "STATUS_CHANGE",
            json.dumps(event_data),
            archived_by_id,
        )

    async def get_archivable_units(self, plant: str | None = None):
        query = """
            SELECT
                u.id, u.vin, u.market, u.lane, u."scmDecision", u."scmDecisionNote",
                u."scmDecisionAt", u."isAvailableToday", s.name as "statusName",
                usr.name as "registeredBy"
            FROM "Unit" u
            JOIN "UnitStatus" s ON s.id = u."statusId"
            LEFT JOIN "User" usr ON usr.id = u."registeredById"
            WHERE s.name = 'UNAVAILABLE'
              AND u."scmDecision" IS NOT NULL
        """
        args: list[object] = []
        if plant is not None:
            args.append(plant)
            query += f' AND u.plant = ${len(args)}'
        query += ' ORDER BY u."scmDecisionAt" ASC NULLS LAST'
        return await fetch(query, *args)

    async def get_registered_by_provider_id(self, unit_id: int):
        row = await fetchrow('SELECT "providerId" FROM "Unit" WHERE id = $1', unit_id)
        return row.get("providerId") if row else None


unit_repository = UnitRepository()
