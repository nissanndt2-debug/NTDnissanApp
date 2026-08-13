from fastapi import APIRouter, Depends

from app.controllers.user_controller import create_user, delete_user, list_users, update_user
from app.middleware.auth import require_auth, require_role

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/")
async def _list_users(user: dict = Depends(require_role("ADMIN"))):
    return await list_users()


@router.post("/")
async def _create_user(body: dict, user: dict = Depends(require_role("ADMIN"))):
    return await create_user(body)


@router.put("/{user_id}")
async def _update_user(user_id: int, body: dict, user: dict = Depends(require_role("ADMIN"))):
    return await update_user(user_id, body)


@router.delete("/{user_id}")
async def _delete_user(user_id: int, user: dict = Depends(require_role("ADMIN"))):
    return await delete_user(user_id)
