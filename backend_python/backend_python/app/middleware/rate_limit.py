import time
from collections import defaultdict

from fastapi import HTTPException, Request, status

_failed_attempts: dict[str, dict[str, float]] = defaultdict(lambda: {"count": 0, "reset": 0})
FAILED_ATTEMPT_WINDOW = 15 * 60
MAX_FAILED_ATTEMPTS = 5

_api_attempts: dict[str, dict[str, float]] = defaultdict(lambda: {"count": 0, "reset": 0})
API_WINDOW_SECONDS = 60
API_MAX_REQUESTS = 100


def check_failed_logins(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    state = _failed_attempts[ip]
    if state["reset"] and now > state["reset"]:
        _failed_attempts[ip] = {"count": 0, "reset": 0}
        state = _failed_attempts[ip]

    if state["count"] >= MAX_FAILED_ATTEMPTS and now < state["reset"]:
        minutes = int((state["reset"] - now) / 60) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Demasiados intentos de login fallidos. Intenta de nuevo en {minutes} minutos.",
        )


def record_login_result(request: Request, ok: bool) -> None:
    ip = request.client.host if request.client else "unknown"
    if ok:
        _failed_attempts.pop(ip, None)
        return

    now = time.time()
    state = _failed_attempts[ip]
    state["count"] += 1
    state["reset"] = now + FAILED_ATTEMPT_WINDOW


def check_api_rate_limit(request: Request, *, is_development: bool) -> None:
    # Match Node behavior: skip global rate limiting in development.
    if is_development:
        return

    ip = request.client.host if request.client else "unknown"
    now = time.time()
    state = _api_attempts[ip]

    if state["reset"] and now > state["reset"]:
        _api_attempts[ip] = {"count": 0, "reset": 0}
        state = _api_attempts[ip]

    if not state["reset"]:
        state["reset"] = now + API_WINDOW_SECONDS

    state["count"] += 1

    if state["count"] > API_MAX_REQUESTS and now < state["reset"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests, please try again later.",
        )
