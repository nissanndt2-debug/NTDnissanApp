from fastapi import APIRouter, Depends, HTTPException, status

from app.controllers.push_token_controller import register_push_token, unregister_push_token
from app.middleware.auth import require_auth

router = APIRouter(prefix="/push-tokens", tags=["push-tokens"])


@router.post("/")
async def _register_push_token(body: dict, user: dict = Depends(require_auth)):
    token = (body.get("token") or "").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Falta el campo token")
    return await register_push_token(user, token)


@router.delete("/")
async def _unregister_push_token(body: dict, user: dict = Depends(require_auth)):
    token = (body.get("token") or "").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Falta el campo token")
    return await unregister_push_token(user, token)
