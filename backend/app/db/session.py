from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine | None:
    global _engine, _session_factory

    settings = get_settings()
    database_url = settings.async_database_url
    if not database_url:
        return None

    if _engine is None:
        _engine = create_async_engine(
            database_url,
            pool_pre_ping=True,
            pool_recycle=300,
            connect_args={"statement_cache_size": 0},
        )
        _session_factory = async_sessionmaker(
            bind=_engine,
            expire_on_commit=False,
            autoflush=False,
        )

    return _engine


async def get_db_session() -> AsyncIterator[AsyncSession]:
    get_engine()
    if _session_factory is None:
        raise RuntimeError("DATABASE_URL não configurada.")

    async with _session_factory() as session:
        yield session


async def check_database_connection() -> tuple[bool, str]:
    engine = get_engine()
    if engine is None:
        return False, "DATABASE_URL não configurada"

    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        return True, "conexão estabelecida"
    except Exception as exc:  # resposta de diagnóstico, sem expor credenciais
        return False, exc.__class__.__name__


async def dispose_engine() -> None:
    global _engine, _session_factory

    if _engine is not None:
        await _engine.dispose()

    _engine = None
    _session_factory = None
