from contextlib import asynccontextmanager
import asyncio
import logging
import re
import sys
import uuid
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config.database import close_db, init_db
from app.config.environment import env
from app.middleware.auth import auth_middleware, authenticate_access_token
from app.middleware.rate_limit import check_api_rate_limit
from app.realtime.notification_hub import notification_hub
from app.services.notification_service import notification_service
from app.routes.auth import router as auth_router
from app.routes.dashboard import router as dashboard_router
from app.routes.events import router as events_router
from app.routes.health import router as health_router
from app.routes.logs import router as logs_router
from app.routes.notifications import router as notifications_router
from app.routes.providers import router as providers_router
from app.routes.push_tokens import router as push_tokens_router
from app.routes.unit_models import router as unit_models_router
from app.routes.units import router as units_router
from app.routes.uploads import router as uploads_router
from app.routes.users import router as users_router


logger = logging.getLogger("body_app_backend")
MAX_JSON_REQUEST_BYTES = 1 * 1024 * 1024
MAX_UPLOAD_REQUEST_BYTES = 9 * 1024 * 1024
WS_TOKEN_PROTOCOL_PREFIX = "bodyapp.jwt."


def _sanitize_error_detail(value: object) -> str:
	message = str(value or "")
	replacements = [
		(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*", "Bearer [REDACTED]"),
		(r"(?i)(authorization\s*[:=]\s*)([^,\s]+)", r"\1[REDACTED]"),
		(r"(?i)(password\s*[:=]\s*)([^,\s]+)", r"\1[REDACTED]"),
		(r"(?i)(token\s*[:=]\s*)([^,\s]+)", r"\1[REDACTED]"),
		(r"(?i)(jwt_secret\s*[:=]\s*)([^,\s]+)", r"\1[REDACTED]"),
		(r"(?i)(database_url\s*[:=]\s*)([^,\s]+)", r"\1[REDACTED]"),
	]
	for pattern, repl in replacements:
		message = re.sub(pattern, repl, message)
	return message


def _cors_origins() -> list[str]:
	origins = [origin.strip().rstrip("/") for origin in env.cors_origin.split(",") if origin.strip()]
	if env.node_env.lower() != "production":
		return origins
	if not origins or "*" in origins:
		raise RuntimeError("CORS_ORIGIN debe contener origenes HTTPS explicitos en produccion")
	for origin in origins:
		parsed = urlparse(origin)
		if parsed.scheme != "https" or not parsed.netloc or parsed.path not in {"", "/"}:
			raise RuntimeError("CORS_ORIGIN contiene un origen de produccion invalido")
	return origins


def _websocket_token(websocket: WebSocket) -> tuple[str | None, str | None]:
	"""Lee el JWT del subprotocolo, nunca de la URL que suelen registrar proxies."""
	for offered in websocket.headers.get("sec-websocket-protocol", "").split(","):
		candidate = offered.strip()
		if candidate.startswith(WS_TOKEN_PROTOCOL_PREFIX):
			token = candidate[len(WS_TOKEN_PROTOCOL_PREFIX) :]
			if token:
				return token, candidate
	return None, None


if sys.platform.startswith("win"):
	asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


@asynccontextmanager
async def lifespan(_app: FastAPI):
	cleanup_stop_event = asyncio.Event()
	cleanup_task: asyncio.Task[None] | None = None
	try:
		await init_db()
		cleanup_task = asyncio.create_task(notification_service.run_periodic_cleanup(cleanup_stop_event))
	except Exception as exc:
		if env.node_env.lower() == "production":
			logger.error("Database initialization failed in production: %s", _sanitize_error_detail(exc))
			raise
		logger.warning(
			"Database initialization failed in non-production; continuing startup: %s",
			_sanitize_error_detail(exc),
		)
	yield
	cleanup_stop_event.set()
	if cleanup_task is not None:
		cleanup_task.cancel()
		try:
			await cleanup_task
		except asyncio.CancelledError:
			pass
	await close_db()


app = FastAPI(title="body-app-backend-python", lifespan=lifespan)


@app.middleware("http")
async def security_headers_and_auth(request: Request, call_next):
	request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
	content_length = request.headers.get("content-length")
	if content_length and request.method in {"POST", "PUT", "PATCH"}:
		try:
			declared_size = int(content_length)
		except ValueError:
			return JSONResponse(status_code=400, content={"ok": False, "error": "Invalid Content-Length", "requestId": request_id})
		max_size = MAX_UPLOAD_REQUEST_BYTES if request.url.path == "/uploads/photo" else MAX_JSON_REQUEST_BYTES
		if declared_size < 0 or declared_size > max_size:
			return JSONResponse(status_code=413, content={"ok": False, "error": "Request body too large", "requestId": request_id})
	try:
		check_api_rate_limit(request, is_development=env.node_env == "development")
	except HTTPException as exc:
		logger.warning(
			"Request blocked requestId=%s method=%s path=%s detail=%s",
			request_id,
			request.method,
			request.url.path,
			_sanitize_error_detail(exc.detail),
		)
		return JSONResponse(
			status_code=exc.status_code,
			content={"ok": False, "error": str(exc.detail), "requestId": request_id},
		)

	try:
		await auth_middleware(request)
	except HTTPException as exc:
		logger.warning(
			"Auth failed requestId=%s method=%s path=%s detail=%s",
			request_id,
			request.method,
			request.url.path,
			_sanitize_error_detail(exc.detail),
		)
		return JSONResponse(
			status_code=exc.status_code,
			content={"ok": False, "error": str(exc.detail), "requestId": request_id},
		)
	except Exception as exc:
		logger.warning(
			"Auth failed requestId=%s method=%s path=%s detail=%s",
			request_id,
			request.method,
			request.url.path,
			_sanitize_error_detail(exc),
		)
		return JSONResponse(
			status_code=401,
			content={"ok": False, "error": "Unauthorized", "requestId": request_id},
		)

	try:
		response = await call_next(request)
	except Exception as exc:
		logger.error(
			"Unhandled error requestId=%s method=%s path=%s detail=%s",
			request_id,
			request.method,
			request.url.path,
			_sanitize_error_detail(exc),
		)
		return JSONResponse(
			status_code=500,
			content={"ok": False, "error": "Internal server error", "requestId": request_id},
		)

	response.headers["X-Request-Id"] = request_id
	response.headers["X-Content-Type-Options"] = "nosniff"
	response.headers["X-Frame-Options"] = "DENY"
	response.headers["X-XSS-Protection"] = "0"
	response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
	response.headers["Content-Security-Policy"] = "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
	response.headers["Permissions-Policy"] = "camera=(), geolocation=(), microphone=(), payment=(), usb=()"
	if env.node_env.lower() == "production":
		response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
	return response


# Se registra DESPUES del middleware de arriba a proposito: en Starlette, el
# ultimo middleware registrado queda como la capa mas externa. Si CORSMiddleware
# se registrara antes, security_headers_and_auth quedaria por fuera, y sus
# respuestas cortadas en seco (401 de token vencido, 429 de rate limit) saldrian
# sin cabecera Access-Control-Allow-Origin — el navegador las bloquea antes de
# que el codigo de la app llegue a leer el 401, y en la consola solo se ve un
# error de CORS que no menciona para nada el token.
app.add_middleware(
	CORSMiddleware,
	allow_origins=_cors_origins(),
	# En desarrollo Expo puede abrirse desde la IP LAN de la PC y cambiar de
	# puerto. Sin este patrón el navegador bloquea el multipart antes de que la
	# app alcance a mostrar el error real de Cloudinary. Producción sigue usando
	# exclusivamente la lista explícita de CORS_ORIGIN.
	allow_origin_regex=(
		r"^https?://(?:localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})(?::\d+)?$"
		if env.node_env.lower() == "development"
		else None
	),
	allow_credentials=True,
	allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
	allow_headers=["Content-Type", "Authorization"],
)


app.include_router(auth_router)
app.include_router(health_router)
app.include_router(units_router)
app.include_router(logs_router)
app.include_router(providers_router)
app.include_router(users_router)
app.include_router(unit_models_router)
app.include_router(dashboard_router)
app.include_router(notifications_router)
app.include_router(events_router)
app.include_router(uploads_router)
app.include_router(push_tokens_router)


@app.get("/")
async def root():
	return {"ok": True, "service": "body-app-backend-python"}


@app.websocket("/ws/notifications")
async def notifications_ws(websocket: WebSocket):
	# Los tokens no viajan en query strings: suelen terminar en historiales,
	# logs de proxies y herramientas de analitica.
	token, selected_protocol = _websocket_token(websocket)
	if not token:
		await websocket.close(code=1008, reason="Authentication required")
		return
	try:
		user = await authenticate_access_token(token)
		user_id = int(user["userId"])
		role_id = int(user.get("roleId") or 0)
		plant = user.get("plant")
	except Exception:
		await websocket.close(code=1008, reason="Invalid token")
		return

	await notification_hub.connect(user_id, websocket, role_id, plant, selected_protocol)
	try:
		await websocket.send_json({"type": "connected"})
		while True:
			await websocket.receive_text()
	except Exception:
		pass
	finally:
		await notification_hub.disconnect(user_id, websocket)
