from typing import Any
import re
import os

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.config.environment import env

def _normalize_query(query: str) -> str:
    return re.sub(r"\$\d+", "%s", query)

_pool: AsyncConnectionPool | None = None

def _pool_size_from_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        value = int(raw)
        return value if value > 0 else default
    except ValueError:
        return default

async def init_db() -> None:
    global _pool
    if _pool is not None:
        return

    min_size = _pool_size_from_env("DB_POOL_MIN_SIZE", 4)
    max_size = _pool_size_from_env("DB_POOL_MAX_SIZE", 20)
    if max_size < min_size:
        max_size = min_size

    # 1. Cambiamos a AsyncConnectionPool
    _pool = AsyncConnectionPool(
        conninfo=env.database_url,
        min_size=min_size,
        max_size=max_size,
        kwargs={"row_factory": dict_row},
        open=False,
    )
    # 2. Apertura asíncrona nativa
    await _pool.open()

async def close_db() -> None:
    global _pool
    if _pool is None:
        return
    await _pool.close()
    _pool = None

# 3. Métodos 100% asíncronos sin usar to_thread
async def fetch(query: str, *args: Any) -> list[dict[str, Any]]:
    if _pool is None:
        raise RuntimeError("El pool de BD no está inicializado")
    
    async with _pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(_normalize_query(query), args)
            rows = await cur.fetchall()
            return [dict(row) for row in rows]

async def fetchrow(query: str, *args: Any) -> dict[str, Any] | None:
    if _pool is None:
        raise RuntimeError("El pool de BD no está inicializado")
        
    async with _pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(_normalize_query(query), args)
            row = await cur.fetchone()
            return dict(row) if row else None

async def execute(query: str, *args: Any) -> str:
    if _pool is None:
        raise RuntimeError("El pool de BD no está inicializado")
        
    async with _pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(_normalize_query(query), args)
            await conn.commit()
            return cur.statusmessage