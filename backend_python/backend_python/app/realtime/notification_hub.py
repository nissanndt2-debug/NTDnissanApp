from collections import defaultdict
import asyncio
from datetime import date, datetime
from typing import Any

from fastapi import WebSocket


class NotificationHub:
    def __init__(self) -> None:
        self._clients: dict[int, set[WebSocket]] = defaultdict(set)

    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients[user_id].add(websocket)

    async def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        clients = self._clients.get(user_id)
        if not clients:
            return
        clients.discard(websocket)
        if not clients:
            self._clients.pop(user_id, None)

    async def broadcast_notifications(self, notifications: list[dict]) -> None:
        def _serialize_notification(notification: dict[str, Any]) -> dict[str, Any]:
            serialized: dict[str, Any] = {}
            for key, value in notification.items():
                if isinstance(value, (datetime, date)):
                    serialized[key] = value.isoformat()
                else:
                    serialized[key] = value
            return serialized

        by_user: dict[int, list[dict]] = defaultdict(list)
        for notification in notifications:
            serialized_notification = _serialize_notification(notification)
            by_user[int(serialized_notification["userId"])].append(serialized_notification)

        for user_id, payload in by_user.items():
            sockets = list(self._clients.get(user_id, set()))
            tasks = [ws.send_json({"type": "notification", "payload": payload}) for ws in sockets]
            if not tasks:
                continue

            results = await asyncio.gather(*tasks, return_exceptions=True)
            for socket, result in zip(sockets, results):
                if isinstance(result, Exception):
                    await self.disconnect(user_id, socket)


notification_hub = NotificationHub()
