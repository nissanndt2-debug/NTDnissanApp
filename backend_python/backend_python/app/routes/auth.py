from fastapi import APIRouter, Depends, Request

from app.controllers.auth_controller import auth_controller
from app.middleware.auth import require_auth
from app.middleware.rate_limit import check_failed_logins
from app.utils.helpers import get_token_from_header

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
async def login(request: Request, body: dict):
    check_failed_logins(request)
    return await auth_controller.login(request, body)


@router.post("/refresh")
async def refresh(request: Request, body: dict):
    refresh_token = body.get("refreshToken") or get_token_from_header(request)
    return await auth_controller.refresh(refresh_token)


@router.post("/verify")
async def verify(request: Request):
    return await auth_controller.verify_token(get_token_from_header(request))


@router.get("/me")
async def me(request: Request):
    return await auth_controller.me(get_token_from_header(request))


@router.post("/logout")
async def logout(user: dict = Depends(require_auth)):
    return await auth_controller.logout(int(user["userId"]))


@router.post("/change-password")
async def change_password(body: dict, user: dict = Depends(require_auth)):
    return await auth_controller.change_password(int(user["userId"]), body.get("currentPassword"), body.get("newPassword"))
