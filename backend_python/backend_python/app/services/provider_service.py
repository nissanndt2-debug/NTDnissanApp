from app.repositories.provider_repository import provider_repository
from app.realtime.notification_hub import notification_hub


class ProviderService:
    async def list_providers(self):
        return await provider_repository.find_all()

    async def create_provider(self, data: dict):
        name = data.get("name")
        code = data.get("code")
        if not name:
            raise ValueError("Missing provider name")
        created = await provider_repository.create(name, code)
        await notification_hub.broadcast_reference_update("providers")
        return created

    async def delete_provider(self, provider_id: int):
        if not provider_id:
            raise ValueError("Missing provider id")
        await provider_repository.delete(provider_id)
        await notification_hub.broadcast_reference_update("providers")

    async def update_provider(self, provider_id: int, data: dict):
        name = str(data.get("name") or "").strip()
        code = str(data.get("code") or "").strip() or None
        if not provider_id:
            raise ValueError("Missing provider id")
        if not name:
            raise ValueError("Missing provider name")
        updated = await provider_repository.update(provider_id, name, code)
        if not updated:
            raise ValueError("Provider not found")
        await notification_hub.broadcast_reference_update("providers")
        return updated


provider_service = ProviderService()
