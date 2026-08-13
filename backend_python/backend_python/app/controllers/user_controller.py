from fastapi import HTTPException, status

from app.services.user_service import user_service


async def create_user(body: dict):
    try:
        return {"ok": True, "data": await user_service.create_user(body)}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


async def list_users():
    return {"ok": True, "data": await user_service.list_users()}


async def update_user(user_id: int, body: dict):
    try:
        return {"ok": True, "data": await user_service.update_user(user_id, body)}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


async def delete_user(user_id: int):
    try:
        await user_service.delete_user(user_id)
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
