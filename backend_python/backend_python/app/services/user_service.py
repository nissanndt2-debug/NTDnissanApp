from passlib.context import CryptContext

from app.constants.index import ROLE_IDS, VALID_PLANTS
from app.config.database import execute, fetch, fetchrow

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

        final_role_id = _map_role_name(role_id)
        if not final_role_id:
            raise ValueError("Invalid roleId")
        if final_role_id == ROLE_IDS["CARRIER"] and not provider_id:
            raise ValueError("CARRIER role requires a providerId")
        if plant and plant not in VALID_PLANTS:
            raise ValueError(f"Plant must be {' or '.join(VALID_PLANTS)}")

        hashed = pwd_context.hash(password)
        return await fetchrow(
            'INSERT INTO "User" (email, password, name, "roleId", "providerId", plant, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW() AT TIME ZONE \'UTC\', NOW() AT TIME ZONE \'UTC\') RETURNING id, email, name, "roleId", "providerId", plant, "createdAt", "updatedAt"',
            email,
            hashed,
            name,
            final_role_id,
            provider_id,
            plant,
        )

    async def list_users(self):
        query = 'SELECT u.id, u.email, u.name, u."roleId", r.name as "roleName", u."providerId", p.name as "providerName", u.plant, u."createdAt", u."updatedAt" FROM "User" u JOIN "Role" r ON r.id = u."roleId" LEFT JOIN "Provider" p ON p.id = u."providerId" ORDER BY u."createdAt" DESC'
        return await fetch(query)

    async def update_user(self, user_id: int, data: dict):
        if not user_id:
            raise ValueError("Missing id")

        fields = []
        values = []

        if "email" in data:
            fields.append(f'email = ${len(values) + 2}')
            values.append(data["email"])
        if "name" in data:
            fields.append(f'name = ${len(values) + 2}')
            values.append(data["name"])
        if "roleId" in data:
            role_id = _map_role_name(data["roleId"])
            fields.append(f'"roleId" = ${len(values) + 2}')
            values.append(role_id)
        if "providerId" in data:
            fields.append(f'"providerId" = ${len(values) + 2}')
            values.append(data.get("providerId"))
        if "plant" in data:
            fields.append(f'plant = ${len(values) + 2}')
            values.append(data.get("plant"))
        if data.get("password"):
            fields.append(f'password = ${len(values) + 2}')
            values.append(pwd_context.hash(data["password"]))

        if fields:
            fields.append('"updatedAt" = NOW() AT TIME ZONE \'UTC\'')
            await execute(f'UPDATE "User" SET {", ".join(fields)} WHERE id = $1', user_id, *values)

        return await fetchrow(
            'SELECT u.id, u.email, u.name, u."roleId", r.name as "roleName", u."providerId", p.name as "providerName", u.plant, u."createdAt", u."updatedAt" FROM "User" u JOIN "Role" r ON r.id = u."roleId" LEFT JOIN "Provider" p ON p.id = u."providerId" WHERE u.id = $1',
            user_id,
        )

    async def delete_user(self, user_id: int):
        if not user_id:
            raise ValueError("Missing id")
        await execute('DELETE FROM "User" WHERE id = $1', user_id)


user_service = UserService()
