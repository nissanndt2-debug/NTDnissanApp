import asyncio
import logging
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from app.config.environment import env


logger = logging.getLogger("body_app_backend")

# La app comprime a JPEG antes de subir (ver media/photo.ts en el cliente),
# pero se acepta PNG/WEBP por si la fuente cambia algun dia.
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
# 8 MB es generoso frente a los ~150-250 KB que produce la compresion del
# cliente; el limite existe para que un archivo enorme no tumbe el servidor,
# no porque se espere acercarse a el en uso normal.
MAX_PHOTO_BYTES = 8 * 1024 * 1024

# .../image/upload/[transformaciones/][v123456/]carpeta/nombre.ext -> "carpeta/nombre"
_CLOUDINARY_PUBLIC_ID_RE = re.compile(r"/image/upload/(?:[^/]+/)*?(?:v\d+/)?(?P<public_id>.+?)\.[a-zA-Z0-9]+$")


class BlobStorageService:
    """
    Fotos de evidencia de defectos.

    Subida: Cloudinary. Borrado: acepta URLs de Cloudinary Y de Vercel Blob —
    asi las fotos subidas antes de esta migracion se pueden seguir borrando
    sin una migracion de datos aparte. El nombre de la clase se dejo igual
    que antes de la migracion para no tocar los imports de `unit_service.py`.
    """

    def __init__(self) -> None:
        self._cloudinary_url = (env.cloudinary_url or "").strip()
        self._folder = env.cloudinary_folder
        self._configured_vercel_hostname = self._resolve_configured_vercel_hostname()

    def _resolve_configured_vercel_hostname(self) -> str | None:
        configured_base_url = (env.blob_public_base_url or "").strip()
        if not configured_base_url:
            return None
        try:
            parsed = urlparse(configured_base_url)
            return parsed.hostname.lower() if parsed.hostname else None
        except Exception:
            return None

    def is_configured(self) -> bool:
        return bool(self._cloudinary_url)

    def _configure_sdk(self) -> None:
        """Aplica las credenciales al SDK.

        Se valida ANTES de importar `cloudinary`: el SDK lee la variable de
        entorno al importarse y revienta ahi mismo si el formato no le gusta,
        con lo que cualquier validacion posterior nunca llega a ejecutarse y
        el operador recibe el error del SDK en vez de uno que diga que hacer.

        Y ojo con `cloudinary.config(cloudinary_url=...)`: no parsea la cadena,
        solo guarda un atributo suelto y deja cloud_name/api_key/api_secret en
        None. Por eso aqui se desarma a mano y se pasan los campos sueltos.
        """
        parsed = urlparse(self._cloudinary_url)
        if parsed.scheme != "cloudinary" or not (parsed.hostname and parsed.username and parsed.password):
            raise RuntimeError(
                "CLOUDINARY_URL mal formado: se espera "
                "cloudinary://<api_key>:<api_secret>@<cloud_name>. "
                "Si lo copiaste del panel de Cloudinary, revisa que no se haya "
                "colado el prefijo 'CLOUDINARY_URL=' dentro del valor."
            )

        import cloudinary

        cloudinary.config(
            cloud_name=parsed.hostname,
            api_key=parsed.username,
            api_secret=parsed.password,
            secure=True,
        )

    def _upload_sync(self, content: bytes, defect_local_id: str, upload_key: str) -> dict[str, str]:
        self._configure_sdk()
        import cloudinary.uploader

        result = cloudinary.uploader.upload(
            content,
            folder=f"{self._folder}/{defect_local_id}",
            public_id=upload_key,
            overwrite=True,
            unique_filename=False,
            resource_type="image",
        )
        secure_url = result.get("secure_url")
        public_id = result.get("public_id")
        if not isinstance(secure_url, str) or not secure_url.startswith("https://"):
            raise RuntimeError("Cloudinary no devolvio secure_url")
        if not isinstance(public_id, str) or not public_id:
            raise RuntimeError("Cloudinary no devolvio public_id")
        return {"url": secure_url, "publicId": public_id}

    async def upload_photo(
        self,
        content: bytes,
        content_type: str,
        defect_local_id: str = "misc",
        upload_key: str = "misc",
    ) -> dict[str, str]:
        """Sube una foto y devuelve su URL publica. `defect_local_id` solo
        organiza la carpeta, no cambia el comportamiento."""
        if not self.is_configured():
            raise RuntimeError("CLOUDINARY_URL no esta configurado")

        return await asyncio.to_thread(self._upload_sync, content, defect_local_id, upload_key)

    def is_vercel_blob_url(self, url: str) -> bool:
        try:
            parsed = urlparse(url.strip())
            hostname = (parsed.hostname or "").lower()
            if parsed.scheme not in {"http", "https"}:
                return False
            if not hostname.endswith(".blob.vercel-storage.com"):
                return False
            if self._configured_vercel_hostname and hostname != self._configured_vercel_hostname:
                return False
            return True
        except Exception:
            return False

    def is_cloudinary_url(self, url: str) -> bool:
        try:
            parsed = urlparse(url.strip())
            hostname = (parsed.hostname or "").lower()
            return parsed.scheme in {"http", "https"} and hostname == "res.cloudinary.com"
        except Exception:
            return False

    def is_managed_cloudinary_url(self, url: str) -> bool:
        """Acepta solo evidencias emitidas por este cloud y esta carpeta.

        Validar unicamente `res.cloudinary.com` permitiria adjuntar una URL
        publica de cualquier cuenta Cloudinary. No se usa para lecturas
        historicas (que pueden ser de la migracion anterior), solo para nuevas
        asociaciones de evidencia.
        """
        if not self.is_cloudinary_url(url):
            return False
        try:
            configured = urlparse(self._cloudinary_url)
            parsed = urlparse(url.strip())
            if not configured.hostname or not parsed.path.startswith(f"/{configured.hostname}/image/upload/"):
                return False
            match = _CLOUDINARY_PUBLIC_ID_RE.search(parsed.path)
            return bool(match and match.group("public_id").startswith(f"{self._folder}/"))
        except Exception:
            return False

    def normalize_urls(self, urls: list[str] | tuple[str, ...]) -> list[str]:
        unique: set[str] = set()

        for url in urls:
            if not isinstance(url, str):
                continue

            trimmed = url.strip()
            if not trimmed:
                continue

            if self.is_vercel_blob_url(trimmed) or self.is_cloudinary_url(trimmed):
                unique.add(trimmed)

        return list(unique)

    def _delete_single_vercel_url(self, url: str, token: str) -> None:
        request = Request(url=url, method="DELETE")
        request.add_header("Authorization", f"Bearer {token}")
        request.add_header("Accept", "application/json")

        try:
            with urlopen(request, timeout=20) as response:
                status_code = getattr(response, "status", response.getcode())
                if status_code >= 400:
                    raise RuntimeError(f"Failed to delete blob URL {url}. HTTP {status_code}")
        except HTTPError as exc:
            raise RuntimeError(f"Failed to delete blob URL {url}. HTTP {exc.code}") from exc
        except URLError as exc:
            raise RuntimeError(f"Failed to delete blob URL {url}") from exc

    def _delete_single_cloudinary_url(self, url: str) -> None:
        match = _CLOUDINARY_PUBLIC_ID_RE.search(urlparse(url).path)
        if not match:
            raise RuntimeError(f"Could not parse Cloudinary public_id from URL {url}")

        self._configure_sdk()
        import cloudinary.uploader

        result = cloudinary.uploader.destroy(match.group("public_id"), resource_type="image")
        if result.get("result") not in {"ok", "not found"}:
            raise RuntimeError(f"Failed to delete Cloudinary URL {url}: {result}")

    async def _delete_cloudinary_urls(self, urls: list[str]) -> bool:
        results = await asyncio.gather(
            *(asyncio.to_thread(self._delete_single_cloudinary_url, url) for url in urls),
            return_exceptions=True,
        )
        failures = [r for r in results if isinstance(r, Exception)]
        if failures:
            logger.warning("Failed to delete %s of %s Cloudinary photo(s)", len(failures), len(urls))
        return not failures

    async def delete_urls(self, urls: list[str]) -> bool:
        normalized = self.normalize_urls(urls)
        if not normalized:
            return True

        cloudinary_urls = [u for u in normalized if self.is_cloudinary_url(u)]
        vercel_urls = [u for u in normalized if self.is_vercel_blob_url(u)]

        ok = True

        if cloudinary_urls and self.is_configured():
            ok = await self._delete_cloudinary_urls(cloudinary_urls) and ok
        elif cloudinary_urls:
            logger.warning("Skipping Cloudinary delete because CLOUDINARY_URL is not configured")
            ok = False

        if vercel_urls:
            token = (env.blob_read_write_token or "").strip()
            if not token:
                logger.warning("Skipping Vercel blob delete because BLOB_READ_WRITE_TOKEN is not configured")
                ok = False
            else:
                results = await asyncio.gather(
                    *(asyncio.to_thread(self._delete_single_vercel_url, url, token) for url in vercel_urls),
                    return_exceptions=True,
                )
                failures = [r for r in results if isinstance(r, Exception)]
                if failures:
                    logger.warning("Failed to delete %s of %s Vercel blob photo(s)", len(failures), len(vercel_urls))
                    ok = False

        return ok


blob_storage_service = BlobStorageService()
