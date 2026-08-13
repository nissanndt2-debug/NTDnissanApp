import logging

from fastapi import HTTPException, Request, status

from app.middleware.rate_limit import record_login_result
from app.services.auth_service import auth_service


logger = logging.getLogger("body_app_backend")


class AuthController:
    async def login(self, request: Request, credentials: dict):
        if not credentials.get("email") or not credentials.get("password"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email y contraseña son requeridos")
        try:
            result = await auth_service.login(credentials)
            record_login_result(request, True)
            return {"ok": True, "data": result}
        except ValueError as exc:
            record_login_result(request, False)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales invalidas") from exc
        except Exception as exc:
            record_login_result(request, False)
            logger.exception("Login failed")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="No se pudo iniciar sesion") from exc

    async def refresh(self, refresh_token: str):
        if not refresh_token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token no proporcionado")
        try:
            result = await auth_service.refresh(refresh_token)
            return {"ok": True, "data": result}
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token invalido o expirado") from exc

    async def verify_token(self, token: str):
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token no proporcionado")
        try:
            decoded = await auth_service.verify_token(token)
            return {"ok": True, "valid": True, "data": decoded}
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalido o expirado") from exc

    async def me(self, token: str):
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token no proporcionado")
        user = await auth_service.get_user_from_token(token)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
        user.pop("password", None)
        return {"ok": True, "data": user}

    async def logout(self, user_id: int):
        await auth_service.logout(user_id)
        return {"ok": True, "message": "Logout exitoso"}

    async def change_password(self, user_id: int, current_password: str, new_password: str):
        if not current_password or not new_password:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Se requiere contraseña actual y nueva")
        try:
            await auth_service.change_password(user_id, current_password, new_password)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        return {"ok": True, "message": "Contraseña actualizada"}


auth_controller = AuthController()
