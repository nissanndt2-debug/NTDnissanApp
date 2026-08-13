"""Controles de acceso por unidad.

La interfaz puede ocultar acciones, pero toda decision de acceso debe ocurrir
en el backend porque los identificadores de unidad llegan desde el cliente.
"""

from fastapi import HTTPException, status

from app.constants.index import ROLE_IDS


def actor_id(user: dict) -> int:
    """Obtiene el actor desde el JWT; nunca desde el cuerpo de la solicitud."""
    value = user.get("userId")
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesion sin identidad valida",
        ) from exc
    if parsed <= 0:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesion sin identidad valida")
    return parsed


def role_id(user: dict) -> int:
    try:
        return int(user.get("roleId"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Rol no valido") from exc


def require_roles(user: dict, allowed_roles: set[str]) -> None:
    if role_id(user) == ROLE_IDS["ADMIN"]:
        return
    allowed_ids = {ROLE_IDS[name] for name in allowed_roles}
    if role_id(user) not in allowed_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para realizar esta accion",
        )


def ensure_unit_access(user: dict, unit: dict | None) -> dict:
    """Verifica el aislamiento por planta y, para Carrier, por proveedor."""
    if not unit:
        # No revelar si una unidad de otra planta existe.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unidad no encontrada")

    current_role = role_id(user)
    if current_role == ROLE_IDS["ADMIN"]:
        return unit

    unit_plant = unit.get("plant")
    user_plant = user.get("plant")
    if not isinstance(user_plant, str) or not user_plant or unit_plant != user_plant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unidad no encontrada")

    if current_role == ROLE_IDS["CARRIER"]:
        try:
            provider_id = int(user.get("providerId"))
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cuenta Carrier sin proveedor asignado") from exc
        if unit.get("providerId") != provider_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unidad no encontrada")

    return unit
