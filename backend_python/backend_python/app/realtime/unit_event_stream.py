import asyncio
import json
import uuid
from collections.abc import AsyncIterator

from app.constants.index import SSE_KEEPALIVE_MS
from app.realtime.notification_hub import notification_hub


class UnitEventStream:
    def __init__(self) -> None:
        self._subscribers: set[tuple[asyncio.Queue[str], str | None]] = set()

    async def subscribe(self, user_plant: str | None = None) -> AsyncIterator[str]:
        queue: asyncio.Queue[str] = asyncio.Queue()
        subscriber = (queue, user_plant)
        self._subscribers.add(subscriber)
        try:
            yield "event: connected\ndata: {\"ok\": true}\n\n"
            while True:
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=SSE_KEEPALIVE_MS / 1000)
                    yield payload
                except asyncio.TimeoutError:
                    yield ":keep-alive\n\n"
        finally:
            self._subscribers.discard(subscriber)

    async def broadcast(self, payload: dict) -> None:
        event_payload = {**payload, "eventId": payload.get("eventId") or str(uuid.uuid4())}
        message = f"event: unit-update\\ndata: {json.dumps(event_payload)}\\n\\n"
        payload_plant = event_payload.get("plant")
        for queue, subscriber_plant in list(self._subscribers):
            if payload_plant and subscriber_plant and payload_plant != subscriber_plant:
                continue
            await queue.put(message)
        # SSE se conserva para consumidores externos ya existentes. La app
        # usa el WebSocket configurado, para no depender de dos conexiones.
        await notification_hub.broadcast_unit_update(event_payload)


unit_event_stream = UnitEventStream()
