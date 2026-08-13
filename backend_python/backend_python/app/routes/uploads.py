import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.middleware.auth import require_auth
from app.services.blob_storage_service import (
    ALLOWED_CONTENT_TYPES,
    MAX_PHOTO_BYTES,
    blob_storage_service,
)

logger = logging.getLogger("body_app_backend")

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("/photo")
async def upload_photo(
    file: UploadFile = File(...),
    defectLocalId: str = Form(default="misc"),
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

    try:
        url = await blob_storage_service.upload_photo(content, content_type, defectLocalId)
    except Exception as exc:
        # Un fallo aqui es casi siempre de configuracion (CLOUDINARY_URL mal
        # copiado, credenciales revocadas), no del archivo que se subio. Dejarlo
        # caer al manejador generico devuelve "Internal server error" y obliga a
        # ir a buscar el log del hosting para saber que paso; devolver la causa
        # convierte media hora de rastreo en leer la respuesta.
        logger.exception("Fallo la subida de foto a Cloudinary")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"El almacenamiento de fotos rechazo la subida: {type(exc).__name__}: {exc}",
        ) from exc

    return {"ok": True, "data": {"url": url}}
