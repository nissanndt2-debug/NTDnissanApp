from collections import defaultdict
import asyncio
from datetime import date, datetime
from typing import Any
import uuid

from fastapi import WebSocket

from app.config.environment import env
from app.constants.index import ROLE_IDS

import logging


logger = logging.getLogger("body_app_backend")


class NotificationHub:
    def __init__(self) -> None:
        self._clients: dict[int, set[WebSocket]] = defaultdict(set)
        self._scopes: dict[WebSocket, tuple[int, int, str | None]] = {}
        self._send_locks: dict[WebSocket, asyncio.Lock] = {}

    def _debug(self, message: str, *args: object) -> None:
        if env.realtime_debug:
            logger.info("[realtime] " + message, *args)

    async def connect(
        self,
        user_id: int,
        websocket: WebSocket,
        role_id: int | None = None,
        plant: str | None = None,
        subprotocol: str | None = None,
    ) -> None:
        await websocket.accept(subprotocol=subprotocol)
        self._clients[user_id].add(websocket)
        self._scopes[websocket] = (user_id, int(role_id or 0), plant)
        self._send_locks[websocket] = asyncio.Lock()
        self._debug("websocket connected user=%s plant=%s", user_id, plant)

    async def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        clients = self._clients.get(user_id)
        if not clients:
            return
        clients.discard(websocket)
        if not clients:
            self._clients.pop(user_id, None)
        self._scopes.pop(websocket, None)
        self._send_locks.pop(websocket, None)
        self._debug("websocket disconnected user=%s", user_id)

    async def _send(self, websocket: WebSocket, payload: dict[str, Any]) -> bool:
        lock = self._send_locks.get(websocket)
        if lock is None:
            return False
        try:
            async with lock:
                await websocket.send_json(payload)
            return True
        except Exception:
            return False

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
            tasks = [self._send(ws, {"type": "notification", "payload": payload}) for ws in sockets]
            if not tasks:
                continue

            results = await asyncio.gather(*tasks, return_exceptions=True)
            for socket, result in zip(sockets, results):
                if result is not True:
                    await self.disconnect(user_id, socket)

    async def broadcast_unit_update(self, payload: dict[str, Any]) -> None:
        """Envia cambios de unidades al unico canal WebSocket del cliente.

        El cliente vuelve a leer su fuente de verdad despues de recibirlo; el
        evento solo contiene metadatos no sensibles y se filtra por planta.
        """
        payload_plant = payload.get("plant")
        recipients: list[tuple[int, WebSocket]] = []
        for websocket, (user_id, role_id, plant) in list(self._scopes.items()):
            if (
                payload_plant
                and role_id != ROLE_IDS["ADMIN"]
                and plant
                and plant != payload_plant
            ):
                continue
            recipients.append((user_id, websocket))

        self._debug(
            "unit event=%s unit=%s recipients=%s",
            payload.get("event"),
            payload.get("unitId"),
            len(recipients),
        )
        results = await asyncio.gather(
            *(self._send(socket, {"type": "unit-update", "payload": payload}) for _, socket in recipients),
            return_exceptions=True,
        )
        for (user_id, socket), result in zip(recipients, results):
            if result is not True:
                await self.disconnect(user_id, socket)

    async def broadcast_reference_update(self, resource: str) -> None:
        """Actualiza catalogos administrativos en las sesiones ADMIN."""
        payload = {"eventId": str(uuid.uuid4()), "resource": resource}
        recipients = [
            (user_id, websocket)
            for websocket, (user_id, role_id, _) in list(self._scopes.items())
            if role_id == ROLE_IDS["ADMIN"]
        ]
        results = await asyncio.gather(
            *(self._send(socket, {"type": "reference-update", "payload": payload}) for _, socket in recipients),
            return_exceptions=True,
        )
        for (user_id, socket), result in zip(recipients, results):
            if result is not True:
                await self.disconnect(user_id, socket)


notification_hub = NotificationHub()
