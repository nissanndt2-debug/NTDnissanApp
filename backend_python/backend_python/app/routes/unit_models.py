from fastapi import APIRouter, Depends, Query

from app.controllers.unit_model_controller import (
    create_unit_model,
    delete_unit_model,
    get_unit_model,
    list_unit_models,
    update_unit_model,
)
from app.middleware.auth import require_any_role, require_auth

router = APIRouter(prefix="/unit-models", tags=["unit-models"])


@router.get("/")
async def _list_unit_models(
    includeInactive: bool = Query(default=False),
    limit: int = Query(default=200, ge=1, le=1000),
    user: dict = Depends(require_auth),
):
    _ = user
    return await list_unit_models(includeInactive, limit)


@router.get("/{model_id}")
async def _get_unit_model(model_id: int, user: dict = Depends(require_auth)):
    _ = user
    return await get_unit_model(model_id)


@router.post("/")
async def _create_unit_model(body: dict, user: dict = Depends(require_any_role(["SCM", "ADMIN"]))):
    _ = user
    return await create_unit_model(body)


@router.put("/{model_id}")
async def _update_unit_model(model_id: int, body: dict, user: dict = Depends(require_any_role(["SCM", "ADMIN"]))):
    _ = user
    return await update_unit_model(model_id, body)


@router.delete("/{model_id}")
async def _delete_unit_model(model_id: int, user: dict = Depends(require_any_role(["SCM", "ADMIN"]))):
    _ = user
    return await delete_unit_model(model_id)
