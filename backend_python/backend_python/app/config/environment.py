import os
from dataclasses import dataclass

from dotenv import load_dotenv


load_dotenv()
load_dotenv('.env.local', override=True)


def _required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ValueError(f"Missing required env var {name}")
    return value


def _jwt_secret() -> str:
    secret = _required("JWT_SECRET")
    if os.getenv("NODE_ENV", "development").lower() == "production" and len(secret.encode("utf-8")) < 32:
        raise ValueError("JWT_SECRET debe tener al menos 32 bytes en produccion")
    return secret


@dataclass
class Env:
    node_env: str
    port: int
    use_https: bool
    jwt_secret: str
    jwt_expires_in: str
    refresh_token_expires_in: str
    cors_origin: str
    database_url: str
    blob_public_base_url: str | None
    blob_read_write_token: str | None
    cloudinary_url: str | None
    cloudinary_folder: str
    expo_access_token: str | None
    realtime_debug: bool


env = Env(
    node_env=os.getenv("NODE_ENV", "development"),
    port=int(os.getenv("PORT", "3001")),
    use_https=os.getenv("USE_HTTPS", "false").lower() == "true",
    jwt_secret=_jwt_secret(),
    jwt_expires_in=os.getenv("JWT_EXPIRES_IN", "15m"),
    refresh_token_expires_in=os.getenv("REFRESH_TOKEN_EXPIRES_IN", "30d"),
    cors_origin=os.getenv("CORS_ORIGIN", "http://localhost:3000"),
    database_url=_required("DATABASE_URL"),
    blob_public_base_url=os.getenv("BLOB_PUBLIC_BASE_URL"),
    blob_read_write_token=os.getenv("BLOB_READ_WRITE_TOKEN"),
    # Fotos de evidencia. Sin esta variable el endpoint de subida responde
    # 501 de forma explicita en vez de fallar a medias.
    cloudinary_url=os.getenv("CLOUDINARY_URL"),
    cloudinary_folder=os.getenv("CLOUDINARY_FOLDER", "defect-photos"),
    # Opcional: sin esto las notificaciones push funcionan igual, solo sin la
    # capa extra de Expo contra suplantacion. Ver EXPO_ACCESS_TOKEN en Expo
    # Dashboard -> Account settings -> Access tokens.
    expo_access_token=os.getenv("EXPO_ACCESS_TOKEN"),
    # Registra ciclos WebSocket y eventos de unidad sin incluir tokens.
    realtime_debug=os.getenv("REALTIME_DEBUG", "false").lower() == "true",
)
