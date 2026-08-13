import logging
import re
import uuid
from collections import defaultdict
from io import BytesIO
import time

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError

from app.middleware.auth import require_auth
from app.services.blob_storage_service import (
    ALLOWED_CONTENT_TYPES,
    MAX_PHOTO_BYTES,
    blob_storage_service,
)

logger = logging.getLogger("body_app_backend")

router = APIRouter(prefix="/uploads", tags=["uploads"])

MAX_PHOTO_PIXELS = 20_000_000
PHOTO_WINDOW_SECONDS = 5 * 60
MAX_PHOTO_UPLOADS_PER_WINDOW = 60
_photo_attempts: dict[int, list[float]] = defaultdict(list)


def _check_upload_rate_limit(user_id: int) -> None:
    """Limite local por usuario; el gateway debe complementar esto en HA."""
    now = time.monotonic()
    attempts = [item for item in _photo_attempts[user_id] if now - item < PHOTO_WINDOW_SECONDS]
    if len(attempts) >= MAX_PHOTO_UPLOADS_PER_WINDOW:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Demasiadas cargas de fotos. Intenta de nuevo en unos minutos.")
    attempts.append(now)
    _photo_attempts[user_id] = attempts


def _validate_image(content: bytes, declared_content_type: str) -> None:
    """Verifica bytes reales, formato y dimensiones antes de enviarlos al CDN."""
    expected_formats = {
        "image/jpeg": "JPEG",
        "image/png": "PNG",
        "image/webp": "WEBP",
    }
    try:
        with Image.open(BytesIO(content)) as image:
            image.verify()
        with Image.open(BytesIO(content)) as image:
            if image.format != expected_formats[declared_content_type]:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El contenido no coincide con el tipo de imagen declarado")
            width, height = image.size
            if width < 1 or height < 1 or width * height > MAX_PHOTO_PIXELS:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La imagen excede las dimensiones permitidas")
            image.load()
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo no es una imagen valida") from exc


@router.post("/photo")
async def upload_photo(
    file: UploadFile = File(...),
    defectLocalId: str = Form(default="misc"),
    uploadKey: str = Form(default=""),
    user: dict = Depends(require_auth),
):
    """
    Sube la evidencia fotografica de un defecto. El campo se llama `file`
    porque asi lo manda el cliente (ver `apiUploadPhoto` en
    TestApp/src/api/client.ts) — cambiar el nombre aqui rompe la app sin
    avisar en ningun tipo de TypeScript, porque el body es FormData.
    """
    if not blob_storage_service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Almacenamiento de fotos no configurado (CLOUDINARY_URL)",
        )

    try:
        user_id = int(user["userId"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesion sin identidad valida") from exc
    _check_upload_rate_limit(user_id)

    content_type = file.content_type or ""
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo de archivo no permitido: {content_type or 'desconocido'}",
        )

    content = await file.read()
    if len(content) > MAX_PHOTO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"La foto excede el tamano maximo ({MAX_PHOTO_BYTES // (1024 * 1024)} MB)",
        )
    if len(content) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archivo vacio")
    _validate_image(content, content_type)

    # La clave estable hace idempotente la subida si la red se corta después de
    # que Cloudinary recibe el archivo pero antes de que la app lea la respuesta.
    stable_key = uploadKey.strip() or f"legacy-{uuid.uuid4().hex}"
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,120}", stable_key):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="uploadKey invalido")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,120}", defectLocalId):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="defectLocalId invalido")

    try:
        uploaded = await blob_storage_service.upload_photo(
            content,
            content_type,
            defectLocalId,
            stable_key,
        )
    except Exception as exc:
        logger.exception("Fallo la subida de foto a Cloudinary")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo almacenar la foto. Intenta de nuevo o contacta a soporte.",
        ) from exc

    return {"ok": True, "data": uploaded}
