from app.repositories.provider_repository import provider_repository


class ProviderService:
    async def list_providers(self):
        return await provider_repository.find_all()

    async def create_provider(self, data: dict):
        name = data.get("name")
        code = data.get("code")
        if not name:
            raise ValueError("Missing provider name")
        return await provider_repository.create(name, code)

    async def delete_provider(self, provider_id: int):
        if not provider_id:
            raise ValueError("Missing provider id")
        await provider_repository.delete(provider_id)


provider_service = ProviderService()
