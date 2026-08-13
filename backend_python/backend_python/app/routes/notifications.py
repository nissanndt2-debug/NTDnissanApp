from fastapi import APIRouter, Depends

from app.controllers.notification_controller import (
    delete_notification,
    list_notifications,
    mark_all_notifications_read,
    mark_notification_read,
)
from app.middleware.auth import require_auth

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/")
async def _list_notifications(user: dict = Depends(require_auth), isRead: bool | None = None, limit: int = 50, offset: int = 0):
    return await list_notifications(user, isRead, limit, offset)


@router.put("/{notification_id}/read")
async def _mark_notification_read(notification_id: int, user: dict = Depends(require_auth)):
    return await mark_notification_read(user, notification_id)


@router.post("/read-all")
async def _mark_all_notifications_read(user: dict = Depends(require_auth)):
    return await mark_all_notifications_read(user)


@router.delete("/{notification_id}")
async def _delete_notification(notification_id: int, user: dict = Depends(require_auth)):
    return await delete_notification(user, notification_id)
