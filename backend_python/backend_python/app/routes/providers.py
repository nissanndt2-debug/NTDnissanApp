from fastapi import APIRouter, Depends

from app.controllers.provider_controller import create_provider, delete_provider, list_providers, update_provider
from app.middleware.auth import require_auth, require_role

router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("/")
async def _list_providers(user: dict = Depends(require_auth)):
    _ = user
    return await list_providers()


@router.post("/")
async def _create_provider(body: dict, user: dict = Depends(require_role("ADMIN"))):
    return await create_provider(body)


@router.delete("/{provider_id}")
async def _delete_provider(provider_id: int, user: dict = Depends(require_role("ADMIN"))):
    return await delete_provider(provider_id)


@router.put("/{provider_id}")
async def _update_provider(provider_id: int, body: dict, user: dict = Depends(require_role("ADMIN"))):
    return await update_provider(provider_id, body)
