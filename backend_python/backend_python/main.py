from contextlib import asynccontextmanager
import asyncio
import logging
import re
import sys
import uuid

from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config.database import close_db, init_db
from app.config.environment import env
from app.middleware.auth import auth_middleware
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
from app.routes.unit_models import router as unit_models_router
from app.routes.units import router as units_router
from app.routes.uploads import router as uploads_router
from app.routes.users import router as users_router


logger = logging.getLogger("body_app_backend")


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

app.add_middleware(
	CORSMiddleware,
	allow_origins=[origin.strip() for origin in env.cors_origin.split(",")],
	allow_credentials=True,
	allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
	allow_headers=["Content-Type", "Authorization", "x-user-role", "x-user-id"],
)


@app.middleware("http")
async def security_headers_and_auth(request: Request, call_next):
	request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
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
	response.headers["X-XSS-Protection"] = "1; mode=block"
	response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
	return response


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


@app.get("/")
async def root():
	return {"ok": True, "service": "body-app-backend-python"}


@app.websocket("/ws/notifications")
async def notifications_ws(websocket: WebSocket, token: str):
	# Lightweight WS compatibility endpoint.
	import jwt

	try:
		payload = jwt.decode(token, env.jwt_secret, algorithms=["HS256"])
		user_id = int(payload["userId"])
	except Exception:
		await websocket.close(code=1008, reason="Invalid token")
		return

	await notification_hub.connect(user_id, websocket)
	try:
		await websocket.send_json({"type": "connected"})
		while True:
			await websocket.receive_text()
	except Exception:
		pass
	finally:
		await notification_hub.disconnect(user_id, websocket)
