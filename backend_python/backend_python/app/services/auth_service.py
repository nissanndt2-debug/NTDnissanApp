from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from app.config.environment import env
from app.constants.index import MIN_PASSWORD_LENGTH
from app.repositories.refresh_token_repository import refresh_token_repository
from app.repositories.user_repository import user_repository

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _parse_expiration(expires_in: str) -> timedelta:
    amount = int(expires_in[:-1])
    unit = expires_in[-1]
    if unit == "s":
        return timedelta(seconds=amount)
    if unit == "m":
        return timedelta(minutes=amount)
    if unit == "h":
        return timedelta(hours=amount)
    if unit == "d":
        return timedelta(days=amount)
    raise ValueError("Invalid expiration format")


class AuthService:
    def _generate_access_token(self, user: dict) -> str:
        payload = {
            "userId": user["id"],
            "email": user["email"],
            "roleId": user["roleId"],
            "providerId": user.get("providerId"),
            "plant": user.get("plant"),
            "exp": datetime.now(timezone.utc) + _parse_expiration(env.jwt_expires_in),
        }
        return jwt.encode(payload, env.jwt_secret, algorithm="HS256")

    def _generate_refresh_token(self) -> str:
        payload = {
            "type": "refresh",
            "exp": datetime.now(timezone.utc) + _parse_expiration(env.refresh_token_expires_in),
        }
        return jwt.encode(payload, env.jwt_secret, algorithm="HS256")

    async def login(self, credentials: dict):
        email = credentials.get("email")
        password = credentials.get("password")
        user = await user_repository.find_by_email(email)
        if not user:
            raise ValueError("Credenciales invalidas")

        if not pwd_context.verify(password, user["password"]):
            raise ValueError("Credenciales invalidas")

        token = self._generate_access_token(user)
        refresh_token = self._generate_refresh_token()
        expires_at = datetime.now(timezone.utc) + _parse_expiration(env.refresh_token_expires_in)
        await refresh_token_repository.create(user["id"], refresh_token, expires_at)

        return {
            "user": {
                "id": user["id"],
                "email": user["email"],
                "name": user["name"],
                "roleId": user["roleId"],
                "providerId": user.get("providerId"),
                "plant": user.get("plant"),
            },
            "token": token,
            "refreshToken": refresh_token,
        }

    async def refresh(self, refresh_token: str):
        token_data = await refresh_token_repository.find_by_token(refresh_token)
        if not token_data:
            raise ValueError("Refresh token invalido")
        if token_data.get("revokedAt"):
            raise ValueError("Refresh token fue revocado")
        if token_data["expiresAt"] < datetime.now(timezone.utc):
            raise ValueError("Refresh token expirado")

        user = await user_repository.find_by_id(token_data["userId"])
        if not user:
            raise ValueError("Usuario no encontrado")

        new_access = self._generate_access_token(user)
        new_refresh = self._generate_refresh_token()
        expires_at = datetime.now(timezone.utc) + _parse_expiration(env.refresh_token_expires_in)

        await refresh_token_repository.revoke(refresh_token)
        await refresh_token_repository.create(user["id"], new_refresh, expires_at)

        return {"token": new_access, "refreshToken": new_refresh}

    async def verify_token(self, token: str):
        return jwt.decode(token, env.jwt_secret, algorithms=["HS256"])

    async def get_user_from_token(self, token: str):
        decoded = await self.verify_token(token)
        return await user_repository.find_by_id(decoded["userId"])

    async def logout(self, user_id: int):
        await refresh_token_repository.revoke_by_user_id(user_id)

    async def change_password(self, user_id: int, current_password: str, new_password: str):
        if len(new_password) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"La nueva contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres")

        user = await user_repository.find_by_id(user_id)
        if not user:
            raise ValueError("Usuario no encontrado")
        if not pwd_context.verify(current_password, user["password"]):
            raise ValueError("Contraseña actual incorrecta")
        if pwd_context.verify(new_password, user["password"]):
            raise ValueError("La nueva contraseña no puede ser igual a la anterior")

        await user_repository.update_password(user_id, pwd_context.hash(new_password))
        await refresh_token_repository.revoke_by_user_id(user_id)


auth_service = AuthService()
