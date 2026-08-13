from fastapi import Request

from app.constants.index import ROLE_IDS


def get_carrier_provider_id(user: dict | None) -> int | None:
    if not user:
        return None
    if user.get("roleId") == ROLE_IDS["CARRIER"]:
        if user.get("providerId"):
            return int(user["providerId"])
        # Fail closed: una cuenta Carrier incompleta nunca lista datos de todos
        # los proveedores simplemente porque no trae providerId en su JWT.
        return -1
    return None


def get_user_plant_filter(user: dict | None) -> str | None:
    if not user:
        return None
    if user.get("roleId") == ROLE_IDS["ADMIN"]:
        return None
    plant = user.get("plant")
    # Las consultas interpretan None como "sin filtro". Para cuentas no
    # administrativas sin planta, usamos un valor que nunca coincide.
    return plant if isinstance(plant, str) and plant else "__UNASSIGNED_PLANT__"


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
    ]
    for value in candidates:
        if isinstance(value, str):
            return value
    return None
