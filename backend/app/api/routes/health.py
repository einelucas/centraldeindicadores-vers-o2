from fastapi import APIRouter

from app.core.config import get_settings
from app.db.session import check_database_connection
from app.schemas.health import DatabaseHealthResponse, HealthResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", response_model=HealthResponse)
async def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        environment=settings.environment,
    )


@router.get("/database", response_model=DatabaseHealthResponse)
async def database_health() -> DatabaseHealthResponse:
    configured = get_settings().database_url is not None
    connected, detail = await check_database_connection()

    if connected:
        return DatabaseHealthResponse(status="ok", detail=detail)
    if not configured:
        return DatabaseHealthResponse(status="not_configured", detail=detail)
    return DatabaseHealthResponse(status="unavailable", detail=detail)
