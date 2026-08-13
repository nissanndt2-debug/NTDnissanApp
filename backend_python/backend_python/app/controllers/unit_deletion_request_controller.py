from fastapi import HTTPException, status

from app.services.unit_deletion_request_service import unit_deletion_request_service
from app.utils.helpers import get_user_plant_filter
from app.utils.unit_access import actor_id, ensure_unit_access
from app.repositories.unit_deletion_request_repository import unit_deletion_request_repository
from app.repositories.unit_repository import unit_repository


async def request_unit_deletion(user: dict, unit_id: int, body: dict):
    reason = (body.get("reason") or "").strip()
    if not unit_id or not reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing unitId or reason")

    ensure_unit_access(user, await unit_repository.find_by_id(unit_id))

    try:
        data = await unit_deletion_request_service.request_deletion(unit_id, actor_id(user), reason)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return {"ok": True, "data": data}


async def list_unit_deletion_requests(user: dict, status_filter: str | None = None):
    status_value = status_filter or "PENDING"
    plant = get_user_plant_filter(user)
    try:
        data = await unit_deletion_request_service.list_requests(status_value, plant)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return {"ok": True, "data": data}


async def decide_unit_deletion_request(user: dict, request_id: int, body: dict):
    decision = (body.get("decision") or "").upper()
    decision_note = (body.get("decisionNote") or "").strip() or None

    if not request_id or not decision:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing requestId or decision")

    if decision not in {"APPROVE", "REJECT"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid decision. Use APPROVE or REJECT.")

    request = await unit_deletion_request_repository.find_by_id(request_id)
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deletion request not found")
    ensure_unit_access(user, {"plant": request.get("plant"), "providerId": request.get("providerId")})

    try:
        data = await unit_deletion_request_service.decide_request(request_id, decision, decision_note, actor_id(user))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return {"ok": True, "data": data}
