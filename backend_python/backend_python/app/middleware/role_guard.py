from fastapi import HTTPException, Request, status

from app.constants.index import ROLE_IDS
from app.utils.helpers import resolve_user_role


def validate_override_permission(request: Request, body: dict | None = None) -> None:
    wants_override = bool(body and body.get("overrideExisting"))
    if not wants_override:
        return

    user = getattr(request.state, "user", None)
    if isinstance(user, dict) and user.get("roleId") == ROLE_IDS["WWS"]:
        return

    role = resolve_user_role(request)
    if role and role.upper() == "WWS":
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only WWS users can use overrideExisting")
