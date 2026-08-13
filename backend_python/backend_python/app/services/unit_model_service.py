from app.repositories.unit_model_repository import unit_model_repository


class UnitModelService:
    async def list_models(self, include_inactive: bool = False, limit: int = 200):
        return await unit_model_repository.find_all(include_inactive, limit)

    async def get_model(self, model_id: int):
        return await unit_model_repository.find_by_id(model_id)

    async def create_model(self, data: dict):
        code = str(data.get("code") or "").strip().upper()
        name = str(data.get("name") or "").strip()
        is_active = bool(data.get("isActive", True))

        if not code:
            raise ValueError("Missing model code")
        if not name:
            raise ValueError("Missing model name")

        existing = await unit_model_repository.find_by_code(code)
        if existing:
            raise ValueError(f"Model code {code} already exists")

        return await unit_model_repository.create(code, name, is_active)

    async def update_model(self, model_id: int, data: dict):
        existing = await unit_model_repository.find_by_id(model_id)
        if not existing:
            raise ValueError("Model not found")

        code: str | None = None
        name: str | None = None
        is_active: bool | None = None

        if "code" in data:
            code = str(data.get("code") or "").strip().upper()
            if not code:
                raise ValueError("Model code cannot be empty")
            by_code = await unit_model_repository.find_by_code(code)
            if by_code and by_code["id"] != model_id:
                raise ValueError(f"Model code {code} already exists")

        if "name" in data:
            name = str(data.get("name") or "").strip()
            if not name:
                raise ValueError("Model name cannot be empty")

        if "isActive" in data:
            is_active = bool(data.get("isActive"))

        return await unit_model_repository.update(model_id, code, name, is_active)

    async def delete_model(self, model_id: int):
        existing = await unit_model_repository.find_by_id(model_id)
        if not existing:
            raise ValueError("Model not found")

        return await unit_model_repository.update(model_id, is_active=False)


unit_model_service = UnitModelService()
