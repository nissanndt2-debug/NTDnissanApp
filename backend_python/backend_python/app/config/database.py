from typing import Any
import re
import asyncio
import os

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.config.environment import env


def _normalize_query(query: str) -> str:
    # The migrated codebase uses PostgreSQL $1/$2 placeholders.
    # Psycopg expects %s placeholders, so normalize before execution.
    return re.sub(r"\$\d+", "%s", query)


_pool: ConnectionPool | None = None


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

    _pool = ConnectionPool(
        conninfo=env.database_url,
        min_size=min_size,
        max_size=max_size,
        kwargs={"row_factory": dict_row},
        open=False,
    )
    _pool.open(wait=False)
    await asyncio.to_thread(_pool.wait)


async def close_db() -> None:
    global _pool
    if _pool is None:
        return
    await asyncio.to_thread(_pool.close)
    _pool = None


def _connect_sync():
    if _pool is not None:
        return _pool.connection()
    return psycopg.connect(env.database_url, row_factory=dict_row)


def _fetch_sync(query: str, args: tuple[Any, ...]) -> list[dict[str, Any]]:
    with _connect_sync() as conn:
        with conn.cursor() as cur:
            cur.execute(_normalize_query(query), args)
            rows = cur.fetchall()
            return [dict(row) for row in rows]


def _fetchrow_sync(query: str, args: tuple[Any, ...]) -> dict[str, Any] | None:
    with _connect_sync() as conn:
        with conn.cursor() as cur:
            cur.execute(_normalize_query(query), args)
            row = cur.fetchone()
            return dict(row) if row else None


def _execute_sync(query: str, args: tuple[Any, ...]) -> str:
    with _connect_sync() as conn:
        with conn.cursor() as cur:
            cur.execute(_normalize_query(query), args)
            conn.commit()
            return cur.statusmessage


async def fetch(query: str, *args: Any) -> list[dict[str, Any]]:
    return await asyncio.to_thread(_fetch_sync, query, args)


async def fetchrow(query: str, *args: Any) -> dict[str, Any] | None:
    return await asyncio.to_thread(_fetchrow_sync, query, args)


async def execute(query: str, *args: Any) -> str:
    return await asyncio.to_thread(_execute_sync, query, args)
