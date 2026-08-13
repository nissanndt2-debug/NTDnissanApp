from fastapi import HTTPException, status

from app.constants.index import ROLE_IDS, VALID_GRADES, VALID_SCM_DECISIONS
from app.services.unit_service import unit_service
from app.utils.helpers import get_carrier_provider_id, get_user_plant_filter


async def list_units(user: dict | None, limit: int | None = None, status_name: str | None = None):
    provider_id = get_carrier_provider_id(user)
    plant = get_user_plant_filter(user)
    data = await (
        unit_service.list_units_by_status(status_name, limit, provider_id, plant)
        if status_name
        else unit_service.list_units(limit, provider_id, plant)
    )
    return {"ok": True, "data": data}


async def get_defect_stats(user: dict | None, filter_today: bool = False):
    plant = get_user_plant_filter(user)
    return {"ok": True, "data": await unit_service.get_defect_stats(filter_today, plant)}


async def create_unit(user: dict | None, body: dict):
    vin = body.get("vin")
    market = body.get("market")
    lane = body.get("lane")
    registered_by_id = body.get("registeredById")
    provider_id = body.get("providerId")
    plant = body.get("plant")
    if not vin or not market or not lane or not registered_by_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing required fields")

    final_provider_id = provider_id
    if not final_provider_id and user and user.get("roleId") == ROLE_IDS["CARRIER"] and user.get("providerId"):
        final_provider_id = user.get("providerId")

    final_plant = plant
    if not final_plant and user and user.get("plant"):
        final_plant = user.get("plant")

    try:
        unit = await unit_service.create_unit(
            {
                "vin": vin,
                "market": market,
                "lane": lane,
                "registeredById": int(registered_by_id),
                "providerId": final_provider_id,
                "plant": final_plant,
            },
            user.get("roleId") if user else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return {"ok": True, "data": unit}


async def update_unit_status(unit_id: int, body: dict):
    new_status = body.get("newStatus")
    changed_by_id = body.get("changedById")
    if not unit_id or not new_status or not changed_by_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing id, newStatus or changedById")
    unit = await unit_service.update_unit_status(unit_id, new_status, int(changed_by_id), body.get("estimatedRepairHours"), body.get("isAvailableToday"), body.get("note"), body.get("wtyComment"))
    return {"ok": True, "data": unit}


async def update_unit_priority(unit_id: int, body: dict):
    assigned_by_id = body.get("assignedById")
    if not unit_id or not assigned_by_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing id or assignedById")
    unit = await unit_service.update_unit_priority(unit_id, body.get("note"), body.get("rank"), int(assigned_by_id))
    return {"ok": True, "data": unit}


async def update_priority_order(body: dict):
    unit_ids = body.get("unitIds")
    assigned_by_id = body.get("assignedById")
    if not isinstance(unit_ids, list) or not unit_ids or not assigned_by_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing unitIds or assignedById")
    data = await unit_service.reorder_unit_priority([int(x) for x in unit_ids], int(assigned_by_id))
    return {"ok": True, "data": data}


async def add_defect_to_unit(unit_id: int, body: dict):
    photo_urls = [url.strip() for url in (body.get("photoUrls") or []) if isinstance(url, str) and url.strip()]
    if body.get("grade") not in VALID_GRADES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid grade. Use {'|'.join(VALID_GRADES)}")
    unit = await unit_service.add_defect_to_unit(
        unit_id,
        body.get("defectType"),
        body.get("zone"),
        body.get("grade"),
        int(body.get("registeredById")),
        body.get("description"),
        photo_urls,
        {
            "isFromWws": bool(body.get("isFromWws")),
            "overrideExisting": bool(body.get("overrideExisting")),
            "wwsVersion": body.get("wwsVersion"),
        },
    )
    return {"ok": True, "data": unit}


async def delete_defect_photo(unit_id: int, defect_id: int):
    if not unit_id or not defect_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing unitId or defectId")

    unit = await unit_service.delete_defect_photo(unit_id, defect_id)
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")

    return {"ok": True, "data": unit}


async def update_defect_grade(unit_id: int, defect_id: int, body: dict):
    grade = body.get("grade")
    if grade not in VALID_GRADES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid grade. Use {'|'.join(VALID_GRADES)}")
    unit = await unit_service.update_defect_grade(unit_id, defect_id, grade, int(body.get("updatedById")))
    return {"ok": True, "data": unit}


async def get_today_units(user: dict):
    provider_id = get_carrier_provider_id(user)
    plant = get_user_plant_filter(user)
    return {"ok": True, "data": await unit_service.get_today_units(provider_id, plant)}


async def set_scm_decision(unit_id: int, body: dict):
    decision = body.get("decision")
    if decision not in VALID_SCM_DECISIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid decision. Use {'|'.join(VALID_SCM_DECISIONS)}")
    unit = await unit_service.set_scm_decision(unit_id, decision, body.get("note"), int(body.get("decidedById")))
    return {"ok": True, "data": unit}


async def get_status_stats(user: dict | None):
    plant = get_user_plant_filter(user)
    return {"ok": True, "data": await unit_service.get_status_stats(plant)}


async def update_estimated_repair_time(unit_id: int, body: dict):
    unit = await unit_service.update_estimated_repair_time(unit_id, float(body.get("estimatedRepairHours")), int(body.get("updatedById")))
    return {"ok": True, "data": unit}


async def get_units_in_repair(user: dict | None, include_archived: bool = False):
    provider_id = get_carrier_provider_id(user)
    plant = get_user_plant_filter(user)
    return {"ok": True, "data": await unit_service.get_units_in_repair(provider_id, plant, include_archived)}


async def get_unit_by_id(unit_id: int):
    unit = await unit_service.get_unit_with_defects(unit_id)
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")
    return {"ok": True, "data": unit}


async def archive_unit(unit_id: int, body: dict):
    unit = await unit_service.archive_unit(unit_id, int(body.get("archivedById")))
    return {"ok": True, "data": unit}


async def get_archivable_units(user: dict | None):
    plant = get_user_plant_filter(user)
    return {"ok": True, "data": await unit_service.get_archivable_units(plant)}


async def reset_daily_queue_partial(user: dict):
    role_id = user.get("roleId") if isinstance(user, dict) else None
    allowed_roles = {ROLE_IDS["ADMIN"], ROLE_IDS["SCM"], ROLE_IDS["BODY"]}
    if role_id not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only ADMIN, SCM, or BODY can execute daily queue reset",
        )

    executed_by_id = None
    if isinstance(user, dict):
        executed_by_id = user.get("userId") or user.get("id")
    return {"ok": True, "data": await unit_service.reset_daily_queue_partial(executed_by_id)}
