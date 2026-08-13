import re

from passlib.context import CryptContext

from app.constants.index import MIN_PASSWORD_LENGTH, ROLE_IDS, VALID_PLANTS
from app.config.database import execute, fetch, fetchrow
from app.realtime.notification_hub import notification_hub

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _map_role_name(role):
    if isinstance(role, int):
        return role
    if isinstance(role, str):
        upper = role.upper()
        if upper in ROLE_IDS:
            return ROLE_IDS[upper]
        if role.isdigit():
            return int(role)
    return None


def _validate_user_data(data: dict, existing: dict | None = None) -> dict:
    """Valida en servidor los campos administrativos antes de persistirlos."""
    merged = dict(existing or {})
    for key in ("email", "name", "roleId", "providerId", "plant"):
        if key in data:
            merged[key] = data[key]

    email = merged.get("email")
    name = merged.get("name")
    if not isinstance(email, str) or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email.strip()) or len(email) > 254:
        raise ValueError("Email invalido")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 120:
        raise ValueError("Nombre invalido")

    role_id = _map_role_name(merged.get("roleId"))
    if role_id not in set(ROLE_IDS.values()):
        raise ValueError("roleId invalido")
    merged["roleId"] = role_id

    plant = merged.get("plant")
    if role_id != ROLE_IDS["ADMIN"] and plant not in VALID_PLANTS:
        raise ValueError(f"Los usuarios no ADMIN requieren planta: {' o '.join(VALID_PLANTS)}")
    if plant is not None and plant not in VALID_PLANTS:
        raise ValueError(f"Plant must be {' or '.join(VALID_PLANTS)}")

    provider_id = merged.get("providerId")
    if provider_id is not None:
        if isinstance(provider_id, bool):
            raise ValueError("providerId invalido")
        try:
            provider_id = int(provider_id)
        except (TypeError, ValueError) as exc:
            raise ValueError("providerId invalido") from exc
        if provider_id <= 0:
            raise ValueError("providerId invalido")
    if role_id == ROLE_IDS["CARRIER"] and provider_id is None:
        raise ValueError("CARRIER role requires a providerId")
    merged["providerId"] = provider_id
    merged["email"] = email.strip().lower()
    merged["name"] = name.strip()
    return merged


def _validate_password(password: object) -> str:
    if not isinstance(password, str) or len(password) < MIN_PASSWORD_LENGTH or len(password.encode("utf-8")) > 72:
        raise ValueError(f"La contraseña debe tener entre {MIN_PASSWORD_LENGTH} y 72 bytes")
    return password


class UserService:
    async def create_user(self, data: dict):
        email = data.get("email")
        password = data.get("password")
        name = data.get("name")
        role_id = data.get("roleId")
        provider_id = data.get("providerId")
        plant = data.get("plant")

        if not email or not password or not name or role_id is None:
            raise ValueError("Missing required fields: email, password, name, roleId")

        validated = _validate_user_data(data)
        hashed = pwd_context.hash(_validate_password(password))
        created = await fetchrow(
            'INSERT INTO "User" (email, password, name, "roleId", "providerId", plant, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW() AT TIME ZONE \'UTC\', NOW() AT TIME ZONE \'UTC\') RETURNING id, email, name, "roleId", "providerId", plant, "createdAt", "updatedAt"',
            validated["email"],
            hashed,
            validated["name"],
            validated["roleId"],
            validated["providerId"],
            validated["plant"],
        )
        await notification_hub.broadcast_reference_update("users")
        return created

    async def list_users(self):
        query = 'SELECT u.id, u.email, u.name, u."roleId", r.name as "roleName", u."providerId", p.name as "providerName", u.plant, u."createdAt", u."updatedAt" FROM "User" u JOIN "Role" r ON r.id = u."roleId" LEFT JOIN "Provider" p ON p.id = u."providerId" ORDER BY u."createdAt" DESC'
        return await fetch(query)

    async def update_user(self, user_id: int, data: dict):
        if not user_id:
            raise ValueError("Missing id")

        existing = await fetchrow(
            'SELECT id, email, name, "roleId", "providerId", plant FROM "User" WHERE id = $1',
            user_id,
        )
        if not existing:
            raise ValueError("Usuario no encontrado")
        validated = _validate_user_data(data, existing)

        fields = []
        values = []

        if "email" in data:
            fields.append(f'email = ${len(values) + 2}')
            values.append(validated["email"])
        if "name" in data:
            fields.append(f'name = ${len(values) + 2}')
            values.append(validated["name"])
        if "roleId" in data:
            fields.append(f'"roleId" = ${len(values) + 2}')
            values.append(validated["roleId"])
        if "providerId" in data:
            fields.append(f'"providerId" = ${len(values) + 2}')
            values.append(validated["providerId"])
        if "plant" in data:
            fields.append(f'plant = ${len(values) + 2}')
            values.append(validated["plant"])
        if data.get("password"):
            fields.append(f'password = ${len(values) + 2}')
            values.append(pwd_context.hash(_validate_password(data["password"])))

        if fields:
            fields.append('"updatedAt" = NOW() AT TIME ZONE \'UTC\'')
            await execute(f'UPDATE "User" SET {", ".join(fields)} WHERE id = $1', user_id, *values)

        updated = await fetchrow(
            'SELECT u.id, u.email, u.name, u."roleId", r.name as "roleName", u."providerId", p.name as "providerName", u.plant, u."createdAt", u."updatedAt" FROM "User" u JOIN "Role" r ON r.id = u."roleId" LEFT JOIN "Provider" p ON p.id = u."providerId" WHERE u.id = $1',
            user_id,
        )
        await notification_hub.broadcast_reference_update("users")
        return updated

    async def delete_user(self, user_id: int):
        if not user_id:
            raise ValueError("Missing id")
        await execute('DELETE FROM "User" WHERE id = $1', user_id)
        await notification_hub.broadcast_reference_update("users")


user_service = UserService()
