from fastapi import HTTPException, status

from app.services.provider_service import provider_service


async def list_providers():
    return {"ok": True, "data": await provider_service.list_providers()}


async def create_provider(body: dict):
    try:
        result = await provider_service.create_provider(body)
        return {"ok": True, "data": result}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


async def delete_provider(provider_id: int):
    try:
        await provider_service.delete_provider(provider_id)
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
