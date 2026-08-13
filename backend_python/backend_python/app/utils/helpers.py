from fastapi import Request

from app.constants.index import ROLE_IDS


def get_carrier_provider_id(user: dict | None) -> int | None:
    if not user:
        return None
    if user.get("roleId") == ROLE_IDS["CARRIER"] and user.get("providerId"):
        return int(user["providerId"])
    return None


def get_user_plant_filter(user: dict | None) -> str | None:
    if not user:
        return None
    return None if user.get("roleId") == ROLE_IDS["ADMIN"] else user.get("plant")


def get_token_from_header(request: Request) -> str | None:
    auth = request.headers.get("authorization")
    if not auth:
        return None
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


def resolve_user_role(request: Request) -> str | None:
    user = getattr(request.state, "user", None)
    candidates = [
        user.get("roleName") if isinstance(user, dict) else None,
        user.get("role") if isinstance(user, dict) else None,
        request.headers.get("x-user-role"),
    ]
    for value in candidates:
        if isinstance(value, str):
            return value
    return None
