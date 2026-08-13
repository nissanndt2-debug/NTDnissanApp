import jwt

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from app.config.environment import env
from app.constants.index import ROLE_IDS
from app.realtime.unit_event_stream import unit_event_stream

router = APIRouter(prefix="/events", tags=["events"])


@router.get("/units")
async def unit_events(request: Request, token: str | None = Query(default=None)):
    user = getattr(request.state, "user", None)
    user_plant = None

    if isinstance(user, dict):
        role_id = user.get("roleId")
        if isinstance(role_id, str) and role_id.isdigit():
            role_id = int(role_id)
        user_plant = None if role_id == ROLE_IDS["ADMIN"] else user.get("plant")
    else:
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authentication token")

        try:
            payload = jwt.decode(token, env.jwt_secret, algorithms=["HS256"])
        except jwt.PyJWTError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

        role_id = payload.get("roleId")
        if isinstance(role_id, str) and role_id.isdigit():
            role_id = int(role_id)
        user_plant = None if role_id == ROLE_IDS["ADMIN"] else payload.get("plant")

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
