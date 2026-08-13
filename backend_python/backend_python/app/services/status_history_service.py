from app.repositories.status_history_repository import status_history_repository


class StatusHistoryService:
    async def search(self, filters: dict):
        return await status_history_repository.search(filters)


status_history_service = StatusHistoryService()
