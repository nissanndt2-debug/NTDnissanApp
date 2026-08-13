from app.repositories.notification_repository import notification_repository


async def list_notifications(user: dict, is_read: bool | None = None, limit: int = 50, offset: int = 0):
    data = await notification_repository.list_by_user(user["userId"], is_read, limit, offset)
    return {"ok": True, "data": data}


async def mark_notification_read(user: dict, notification_id: int):
    await notification_repository.mark_read(user["userId"], notification_id)
    return {"ok": True}


async def mark_all_notifications_read(user: dict):
    await notification_repository.mark_all_read(user["userId"])
    return {"ok": True}


async def delete_notification(user: dict, notification_id: int):
    await notification_repository.delete_by_id(user["userId"], notification_id)
    return {"ok": True}
