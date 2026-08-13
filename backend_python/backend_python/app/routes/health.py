from fastapi import APIRouter

from app.config.database import fetchrow

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
@router.get("/")
async def health():
    return {"ok": True, "service": "body-app-backend-python"}


@router.get("/db")
async def db_health():
    try:
        row = await fetchrow("SELECT 1 AS ok")
        return {"ok": True, "db": bool(row and row.get("ok") == 1)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
