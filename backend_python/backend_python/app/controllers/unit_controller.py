from fastapi import HTTPException, status

from app.constants.index import ROLE_IDS, VALID_GRADES, VALID_PLANTS, VALID_SCM_DECISIONS
from app.services.unit_service import unit_service
from app.services.blob_storage_service import blob_storage_service
from app.utils.helpers import get_carrier_provider_id, get_user_plant_filter
from app.utils.unit_access import actor_id, ensure_unit_access, require_roles


# El cliente puede sugerir una transicion para su UX, pero el flujo se aplica
# aqui. De esta forma una llamada manual a la API no puede saltar reparacion,
# garantia o aceptacion.
STATUS_TRANSITIONS: dict[str, dict[str, set[str]]] = {
    "REPORTED": {"SENT": {"WWS"}, "WTY_PENDING": {"WWS"}},
    "SENT": {"DELIVERED": {"WWS"}},
    "DELIVERED": {"RECEIVED": {"BODY"}},
    "RECEIVED": {"IN_REPAIR": {"BODY"}, "UNAVAILABLE": {"BODY"}},
    "IN_REPAIR": {"RELEASED": {"BODY"}, "UNAVAILABLE": {"BODY"}},
    "RELEASED": {"WWS_RELEASED": {"WWS"}},
    "WTY_PENDING": {"WTY_RELEASED": {"WTY", "SCM_QUALITY"}, "SENT": {"WTY", "SCM_QUALITY"}},
    "WTY_RELEASED": {"WWS_RELEASED": {"WWS"}},
    "WWS_RELEASED": {"ACCEPTED": {"CARRIER"}, "REJECTED": {"CARRIER"}},
    "UNAVAILABLE": {"IN_REPAIR": {"BODY"}, "ARCHIVED": {"SCM"}},
}


async def _authorized_unit(user: dict, unit_id: int) -> dict:
    return ensure_unit_access(user, await unit_service.get_unit(unit_id))


def _optional_text(value: object, field_name: str, max_length: int = 2000) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} invalido")
    cleaned = value.strip()
    if len(cleaned) > max_length:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} excede {max_length} caracteres")
    return cleaned or None


def _optional_hours(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="estimatedRepairHours invalido")
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="estimatedRepairHours invalido") from exc
    if not 0 < parsed <= 240:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="estimatedRepairHours debe estar entre 0 y 240")
    return parsed


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
    provider_id = get_carrier_provider_id(user)
    return {"ok": True, "data": await unit_service.get_defect_stats(filter_today, plant, provider_id)}


async def create_unit(user: dict, body: dict):
    require_roles(user, {"CARRIER", "WWS"})
    vin = _optional_text(body.get("vin"), "VIN", 17)
    market = _optional_text(body.get("market"), "market", 80)
    lane = _optional_text(body.get("lane"), "lane", 80)
    provider_id = body.get("providerId")
    plant = body.get("plant")
    if not vin or len(vin) != 17 or not market or not lane:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing required fields")

    final_provider_id = provider_id
    if user.get("roleId") == ROLE_IDS["CARRIER"]:
        try:
            final_provider_id = int(user["providerId"])
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cuenta Carrier sin proveedor asignado") from exc

    final_plant = user.get("plant")
    if user.get("roleId") == ROLE_IDS["ADMIN"]:
        final_plant = plant or final_plant
    if final_plant not in VALID_PLANTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Planta invalida")

    try:
        unit = await unit_service.create_unit(
            {
                "vin": vin,
                "market": market,
                "lane": lane,
                "registeredById": actor_id(user),
                "providerId": final_provider_id,
                "plant": final_plant,
            },
            user.get("roleId"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return {"ok": True, "data": unit}


async def update_unit_status(user: dict, unit_id: int, body: dict):
    unit = await _authorized_unit(user, unit_id)
    new_status = body.get("newStatus")
    if not isinstance(new_status, str):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="newStatus invalido")
    allowed = STATUS_TRANSITIONS.get(str(unit.get("statusName")), {}).get(new_status)
    if not allowed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Transicion de estado no permitida")
    require_roles(user, allowed)
    is_available = body.get("isAvailableToday")
    if is_available is not None and not isinstance(is_available, bool):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="isAvailableToday invalido")
    updated = await unit_service.update_unit_status(
        unit_id,
        new_status,
        actor_id(user),
        _optional_hours(body.get("estimatedRepairHours")),
        is_available,
        _optional_text(body.get("note"), "note"),
        _optional_text(body.get("wtyComment"), "wtyComment"),
    )
    return {"ok": True, "data": updated}


async def update_unit_priority(user: dict, unit_id: int, body: dict):
    require_roles(user, {"SCM"})
    await _authorized_unit(user, unit_id)
    rank = body.get("rank")
    if rank is not None and (isinstance(rank, bool) or not isinstance(rank, int) or not 1 <= rank <= 10_000):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="rank invalido")
    unit = await unit_service.update_unit_priority(unit_id, _optional_text(body.get("note"), "note"), rank, actor_id(user))
    return {"ok": True, "data": unit}


async def update_priority_order(user: dict, body: dict):
    require_roles(user, {"SCM"})
    unit_ids = body.get("unitIds")
    if not isinstance(unit_ids, list) or not unit_ids or len(unit_ids) > 500:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unitIds invalido")
    try:
        normalized_ids = [int(x) for x in unit_ids]
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unitIds invalido") from exc
    if any(value <= 0 for value in normalized_ids) or len(set(normalized_ids)) != len(normalized_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unitIds invalido")
    for candidate_id in normalized_ids:
        await _authorized_unit(user, candidate_id)
    data = await unit_service.reorder_unit_priority(normalized_ids, actor_id(user))
    return {"ok": True, "data": data}


async def add_defect_to_unit(user: dict, unit_id: int, body: dict):
    require_roles(user, {"CARRIER", "WWS"})
    await _authorized_unit(user, unit_id)
    if body.get("photoUrls"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Adjunta fotos con el endpoint de evidencia")
    defect_type = _optional_text(body.get("defectType"), "defectType", 120)
    zone = _optional_text(body.get("zone"), "zone", 120)
    if not defect_type or not zone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="defectType y zone son obligatorios")
    if body.get("grade") not in VALID_GRADES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid grade. Use {'|'.join(VALID_GRADES)}")
    unit = await unit_service.add_defect_to_unit(
        unit_id,
        defect_type,
        zone,
        body.get("grade"),
        actor_id(user),
        _optional_text(body.get("description"), "description"),
        [],
        {
            "isFromWws": bool(body.get("isFromWws")),
            "overrideExisting": bool(body.get("overrideExisting")),
            "wwsVersion": body.get("wwsVersion"),
        },
    )
    return {"ok": True, "data": unit}


async def attach_defect_photo(user: dict, unit_id: int, defect_id: int, body: dict):
    require_roles(user, {"CARRIER", "WWS"})
    await _authorized_unit(user, unit_id)
    photo_url = (body.get("url") or "").strip()
    if not photo_url.startswith("https://") or not blob_storage_service.is_managed_cloudinary_url(photo_url):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La evidencia debe ser una URL segura emitida por Cloudinary",
        )

    unit = await unit_service.attach_defect_photo(unit_id, defect_id, photo_url)
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Defecto no encontrado para esta unidad")
    return {"ok": True, "data": unit}


async def delete_defect_photo(user: dict, unit_id: int, defect_id: int):
    require_roles(user, {"SCM"})
    await _authorized_unit(user, unit_id)
    if not unit_id or not defect_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing unitId or defectId")

    unit = await unit_service.delete_defect_photo(unit_id, defect_id)
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")

    return {"ok": True, "data": unit}


async def update_defect_grade(user: dict, unit_id: int, defect_id: int, body: dict):
    require_roles(user, {"WWS"})
    await _authorized_unit(user, unit_id)
    grade = body.get("grade")
    if grade not in VALID_GRADES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid grade. Use {'|'.join(VALID_GRADES)}")
    unit = await unit_service.update_defect_grade(unit_id, defect_id, grade, actor_id(user))
    return {"ok": True, "data": unit}


async def get_today_units(user: dict):
    provider_id = get_carrier_provider_id(user)
    plant = get_user_plant_filter(user)
    return {"ok": True, "data": await unit_service.get_today_units(provider_id, plant)}


async def set_scm_decision(user: dict, unit_id: int, body: dict):
    require_roles(user, {"SCM"})
    await _authorized_unit(user, unit_id)
    decision = body.get("decision")
    if decision not in VALID_SCM_DECISIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid decision. Use {'|'.join(VALID_SCM_DECISIONS)}")
    unit = await unit_service.set_scm_decision(unit_id, decision, _optional_text(body.get("note"), "note"), actor_id(user))
    return {"ok": True, "data": unit}


async def get_status_stats(user: dict | None):
    plant = get_user_plant_filter(user)
    provider_id = get_carrier_provider_id(user)
    return {"ok": True, "data": await unit_service.get_status_stats(plant, provider_id)}


async def update_estimated_repair_time(user: dict, unit_id: int, body: dict):
    require_roles(user, {"BODY"})
    await _authorized_unit(user, unit_id)
    hours = _optional_hours(body.get("estimatedRepairHours"))
    if hours is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="estimatedRepairHours es obligatorio")
    unit = await unit_service.update_estimated_repair_time(unit_id, hours, actor_id(user))
    return {"ok": True, "data": unit}


async def get_units_in_repair(user: dict | None, include_archived: bool = False):
    provider_id = get_carrier_provider_id(user)
    plant = get_user_plant_filter(user)
    return {"ok": True, "data": await unit_service.get_units_in_repair(provider_id, plant, include_archived)}


async def get_unit_by_id(user: dict, unit_id: int):
    await _authorized_unit(user, unit_id)
    unit = await unit_service.get_unit_with_defects(unit_id)
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")
    return {"ok": True, "data": unit}


async def archive_unit(user: dict, unit_id: int, body: dict):
    require_roles(user, {"SCM"})
    await _authorized_unit(user, unit_id)
    unit = await unit_service.archive_unit(unit_id, actor_id(user))
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
