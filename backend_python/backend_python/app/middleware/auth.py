import jwt
from fastapi import Depends, HTTPException, Request, status

from app.constants.index import ROLE_IDS
from app.config.environment import env
from app.utils.helpers import get_token_from_header


async def auth_middleware(request: Request) -> None:
    token = get_token_from_header(request)
    if not token:
        return
    try:
        payload = jwt.decode(token, env.jwt_secret, algorithms=["HS256"])
        request.state.user = {
            "userId": payload.get("userId"),
            "email": payload.get("email"),
            "roleId": payload.get("roleId"),
            "providerId": payload.get("providerId"),
            "plant": payload.get("plant"),
        }
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc


async def require_auth(request: Request) -> dict:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return user


def require_role(role_name: str):
    async def _role_guard(user: dict = Depends(require_auth)) -> dict:
        role_name_upper = role_name.upper()

        role = user.get("role") or user.get("roleName")
        if isinstance(role, str) and role.upper() == role_name_upper:
            return user

        role_id = user.get("roleId")
        if isinstance(role_id, int) and ROLE_IDS.get(role_name_upper) == role_id:
            return user

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Requires role {role_name}")

    return _role_guard


def require_any_role(role_names: list[str]):
    normalized = [name.upper() for name in role_names]

    async def _roles_guard(user: dict = Depends(require_auth)) -> dict:
        role = user.get("role") or user.get("roleName")
        if isinstance(role, str) and role.upper() in normalized:
            return user

        role_id = user.get("roleId")
        if isinstance(role_id, int):
            for role_name in normalized:
                if ROLE_IDS.get(role_name) == role_id:
                    return user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires one of roles: {', '.join(role_names)}",
        )

    return _roles_guard
