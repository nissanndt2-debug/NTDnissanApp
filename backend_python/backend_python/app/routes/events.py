from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.constants.index import ROLE_IDS
from app.middleware.auth import require_auth
from app.realtime.unit_event_stream import unit_event_stream

router = APIRouter(prefix="/events", tags=["events"])


@router.get("/units")
async def unit_events(request: Request, user: dict = Depends(require_auth)):
    user_plant = None

    role_id = user.get("roleId")
    if isinstance(role_id, str) and role_id.isdigit():
        role_id = int(role_id)
    user_plant = None if role_id == ROLE_IDS["ADMIN"] else user.get("plant")

    async def generator():
        async for event in unit_event_stream.subscribe(user_plant):
            yield event

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
