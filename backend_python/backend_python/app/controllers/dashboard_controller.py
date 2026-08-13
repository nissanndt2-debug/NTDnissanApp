from app.config.database import fetch
from app.constants.index import MAX_DEFECT_CHART_ITEMS
from app.utils.helpers import get_user_plant_filter


async def get_weekly_units_by_provider(user: dict | None = None):
    plant = get_user_plant_filter(user)
    query = """
    WITH date_range AS (
        SELECT ((NOW() AT TIME ZONE 'America/Mexico_City')::date - s) as day FROM generate_series(0, 6) s
    )
    SELECT TO_CHAR(dr.day, 'YYYY-MM-DD') as date, p.name as provider, COUNT(u.id)::int as count
    FROM date_range dr
    LEFT JOIN "Unit" u ON ((u."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date = dr.day
    LEFT JOIN "Provider" p ON p.id = u."providerId"
    WHERE p.name IS NOT NULL
    """
    args: list[object] = []
    if plant:
        args.append(plant)
        query += f' AND u.plant = ${len(args)}'
    query += """
    GROUP BY dr.day, p.name
    ORDER BY dr.day, provider
    """
    return {"ok": True, "data": await fetch(query, *args)}


async def get_monthly_units_timeline(user: dict | None = None):
    plant = get_user_plant_filter(user)
    query = """
    WITH date_range AS (
        SELECT ((NOW() AT TIME ZONE 'America/Mexico_City')::date - s) as day FROM generate_series(0, 29) s
    )
    SELECT TO_CHAR(dr.day, 'YYYY-MM-DD') as date, COUNT(u.id)::int as count
    FROM date_range dr
    LEFT JOIN "Unit" u ON ((u."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date = dr.day
    """
    args: list[object] = []
    if plant:
        args.append(plant)
        query += f' AND u.plant = ${len(args)}'
    query += """
    GROUP BY dr.day
    ORDER BY dr.day
    """
    return {"ok": True, "data": await fetch(query, *args)}


async def get_defects_by_model(user: dict | None = None):
    plant = get_user_plant_filter(user)
    query = """
    SELECT SUBSTRING(u.vin, 5, 2) AS model_code, dg.code AS grade, COUNT(ud.id)::int AS count
    FROM "UnitDefect" ud
    JOIN "Unit" u ON u.id = ud."unitId"
    JOIN "DefectGrade" dg ON dg.id = ud."gradeId"
    WHERE ud."isActive" = TRUE
    """
    args: list[object] = []
    if plant:
        args.append(plant)
        query += f' AND u.plant = ${len(args)}'
    query += """
    GROUP BY SUBSTRING(u.vin, 5, 2), dg.code
    ORDER BY model_code, grade
    """
    return {"ok": True, "data": await fetch(query, *args)}


async def get_repair_time_by_provider(user: dict | None = None):
    """Carga acumulada: conserva los datos históricos aunque ya no estén en el pull local."""
    plant = get_user_plant_filter(user)
    query = """
    SELECT COALESCE(p.name, 'Sin proveedor') AS provider,
           COALESCE(SUM(u."estimatedRepairHours"), 0)::float AS hours,
           COUNT(u.id)::int AS units
    FROM "Unit" u
    LEFT JOIN "Provider" p ON p.id = u."providerId"
    WHERE u."estimatedRepairHours" IS NOT NULL
    """
    args: list[object] = []
    if plant:
        args.append(plant)
        query += f' AND u.plant = ${len(args)}'
    query += """
    GROUP BY p.name
    ORDER BY hours DESC, units DESC, provider ASC
    LIMIT 5
    """
    return {"ok": True, "data": await fetch(query, *args)}


async def get_repair_time_by_model(user: dict | None = None):
    """Agrupa horas por código de modelo derivado del VIN, con nombre si está catalogado."""
    plant = get_user_plant_filter(user)
    query = """
    SELECT SUBSTRING(u.vin, 5, 2) AS model_code,
           MAX(m.name) AS model_name,
           COALESCE(SUM(u."estimatedRepairHours"), 0)::float AS hours,
           COUNT(u.id)::int AS units
    FROM "Unit" u
    LEFT JOIN "UnitModel" m ON m.code = SUBSTRING(u.vin, 5, 2)
    WHERE u."estimatedRepairHours" IS NOT NULL
    """
    args: list[object] = []
    if plant:
        args.append(plant)
        query += f' AND u.plant = ${len(args)}'
    query += """
    GROUP BY SUBSTRING(u.vin, 5, 2)
    ORDER BY hours DESC, units DESC, model_code ASC
    LIMIT 8
    """
    return {"ok": True, "data": await fetch(query, *args)}


async def get_defects_by_type(user: dict | None = None, grade: str | None = None):
    plant = get_user_plant_filter(user)
    query = """
    SELECT ud."defectType" AS type, dg.code AS grade, COUNT(ud.id)::int AS count
    FROM "UnitDefect" ud
    JOIN "Unit" u ON u.id = ud."unitId"
    JOIN "DefectGrade" dg ON dg.id = ud."gradeId"
    WHERE ud."isActive" = TRUE
    """
    args: list[object] = []
    if grade:
        args.append(grade.upper())
        query += f' AND dg.code = ${len(args)}'
    if plant:
        args.append(plant)
        query += f' AND u.plant = ${len(args)}'

    args.append(MAX_DEFECT_CHART_ITEMS)
    query += f'''
    GROUP BY ud."defectType", dg.code
    ORDER BY count DESC
    LIMIT ${len(args)}
    '''
    rows = await fetch(query, *args)
    return {"ok": True, "data": rows}
