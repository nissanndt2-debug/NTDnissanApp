import re

from fastapi import APIRouter, Depends, HTTPException, status

from app.controllers.push_token_controller import register_push_token, unregister_push_token
from app.middleware.auth import require_auth

router = APIRouter(prefix="/push-tokens", tags=["push-tokens"])


def _valid_push_token(token: str) -> bool:
    return bool(re.fullmatch(r"(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,255}\]", token))


@router.post("/")
async def _register_push_token(body: dict, user: dict = Depends(require_auth)):
    token = (body.get("token") or "").strip()
    if not _valid_push_token(token):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token push invalido")
    return await register_push_token(user, token)


@router.delete("/")
async def _unregister_push_token(body: dict, user: dict = Depends(require_auth)):
    token = (body.get("token") or "").strip()
    if not _valid_push_token(token):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token push invalido")
    return await unregister_push_token(user, token)
