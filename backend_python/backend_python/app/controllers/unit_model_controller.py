from fastapi import HTTPException, status

from app.services.unit_model_service import unit_model_service


async def list_unit_models(include_inactive: bool = False, limit: int = 200):
    return {"ok": True, "data": await unit_model_service.list_models(include_inactive, limit)}


async def get_unit_model(model_id: int):
    model = await unit_model_service.get_model(model_id)
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    return {"ok": True, "data": model}


async def create_unit_model(body: dict):
    try:
        model = await unit_model_service.create_model(body)
        return {"ok": True, "data": model}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


async def update_unit_model(model_id: int, body: dict):
    try:
        model = await unit_model_service.update_model(model_id, body)
        return {"ok": True, "data": model}
    except ValueError as exc:
        detail = str(exc)
        status_code = status.HTTP_404_NOT_FOUND if "not found" in detail.lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=detail) from exc


async def delete_unit_model(model_id: int):
    try:
        model = await unit_model_service.delete_model(model_id)
        return {"ok": True, "data": model}
    except ValueError as exc:
        detail = str(exc)
        status_code = status.HTTP_404_NOT_FOUND if "not found" in detail.lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=detail) from exc
