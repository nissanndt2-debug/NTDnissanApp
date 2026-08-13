from fastapi import APIRouter, Depends, Query, Request

from app.controllers import unit_controller
from app.controllers import unit_deletion_request_controller
from app.middleware.auth import require_any_role, require_auth
from app.middleware.role_guard import validate_override_permission

router = APIRouter(prefix="/units", tags=["units"])


@router.get("/")
async def list_units(
    user: dict = Depends(require_auth),
    limit: int = Query(default=50, ge=1, le=100),
    status: str | None = None,
):
    return await unit_controller.list_units(user, limit, status)


@router.get("/stats/defects")
async def get_defect_stats(user: dict = Depends(require_auth), filter: str | None = None):
    return await unit_controller.get_defect_stats(user, filter == "today")


@router.get("/stats/by-status")
async def get_status_stats(user: dict = Depends(require_auth)):
    return await unit_controller.get_status_stats(user)


@router.get("/in-repair")
async def get_units_in_repair(
    user: dict = Depends(require_auth),
    include_archived: bool = Query(default=False, alias="includeArchived"),
):
    return await unit_controller.get_units_in_repair(user, include_archived)


@router.get("/today")
async def get_today_units(user: dict = Depends(require_auth)):
    return await unit_controller.get_today_units(user)


@router.get("/archivable")
async def get_archivable_units(user: dict = Depends(require_auth)):
    return await unit_controller.get_archivable_units(user)


@router.get("/deletion-requests")
async def list_deletion_requests(
    status: str | None = None,
    user: dict = Depends(require_any_role(["SCM", "ADMIN"])),
):
    return await unit_deletion_request_controller.list_unit_deletion_requests(user, status)


@router.put("/deletion-requests/{request_id}/decision")
async def decide_deletion_request(
    request_id: int,
    body: dict,
    user: dict = Depends(require_any_role(["SCM", "ADMIN"])),
):
    return await unit_deletion_request_controller.decide_unit_deletion_request(user, request_id, body)


@router.post("/maintenance/reset-daily-queue")
async def reset_daily_queue_partial(user: dict = Depends(require_auth)):
    return await unit_controller.reset_daily_queue_partial(user)


@router.get("/{unit_id}")
async def get_unit_by_id(unit_id: int, user: dict = Depends(require_auth)):
    return await unit_controller.get_unit_by_id(user, unit_id)


@router.post("/")
async def create_unit(body: dict, user: dict = Depends(require_auth)):
    return await unit_controller.create_unit(user, body)


@router.post("/{unit_id}/deletion-requests")
async def request_unit_deletion(
    unit_id: int,
    body: dict,
    user: dict = Depends(require_any_role(["CARRIER", "WWS"])),
):
    return await unit_deletion_request_controller.request_unit_deletion(user, unit_id, body)


@router.put("/{unit_id}/status")
async def update_unit_status(unit_id: int, body: dict, user: dict = Depends(require_auth)):
    return await unit_controller.update_unit_status(user, unit_id, body)


@router.put("/{unit_id}/priority")
async def update_unit_priority(unit_id: int, body: dict, user: dict = Depends(require_auth)):
    return await unit_controller.update_unit_priority(user, unit_id, body)


@router.put("/{unit_id}/estimated-time")
async def update_estimated_repair_time(unit_id: int, body: dict):
    return await unit_controller.update_estimated_repair_time(unit_id, body)


@router.put("/{unit_id}/scm-decision")
async def set_scm_decision(
    unit_id: int,
    body: dict,
    user: dict = Depends(require_any_role(["SCM", "ADMIN"])),
):
    return await unit_controller.set_scm_decision(user, unit_id, body)


@router.put("/{unit_id}/archive")
async def archive_unit(
    unit_id: int,
    body: dict,
    user: dict = Depends(require_any_role(["SCM", "ADMIN"])),
):
    return await unit_controller.archive_unit(user, unit_id, body)


@router.post("/{unit_id}/defects")
async def add_defect_to_unit(unit_id: int, body: dict, request: Request, user: dict = Depends(require_auth)):
    validate_override_permission(request, body)
    return await unit_controller.add_defect_to_unit(user, unit_id, body)


@router.put("/{unit_id}/defects/{defect_id}")
async def update_defect_grade(unit_id: int, defect_id: int, body: dict, user: dict = Depends(require_auth)):
    return await unit_controller.update_defect_grade(user, unit_id, defect_id, body)


@router.post("/{unit_id}/defects/{defect_id}/photos")
async def attach_defect_photo(
    unit_id: int,
    defect_id: int,
    body: dict,
    user: dict = Depends(require_auth),
):
    return await unit_controller.attach_defect_photo(user, unit_id, defect_id, body)


@router.delete("/{unit_id}/defects/{defect_id}/photo")
async def delete_defect_photo(
    unit_id: int,
    defect_id: int,
    user: dict = Depends(require_any_role(["SCM", "ADMIN"])),
):
    return await unit_controller.delete_defect_photo(user, unit_id, defect_id)


@router.put("/priority/order")
async def update_priority_order(body: dict, user: dict = Depends(require_auth)):
    return await unit_controller.update_priority_order(user, body)
