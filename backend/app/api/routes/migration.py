from fastapi import APIRouter

from app.schemas.migration import MigrationStatusResponse, ModuleMigrationStatus

router = APIRouter(prefix="/migration", tags=["migration"])


@router.get("/modules", response_model=MigrationStatusResponse)
async def migration_modules() -> MigrationStatusResponse:
    return MigrationStatusResponse(
        strategy="migração incremental com execução paralela ao Next.js",
        database_strategy="reutilizar o PostgreSQL atual sem alterar o schema na fase inicial",
        modules=[
            ModuleMigrationStatus(key="platform", label="Base FastAPI + Nuxt", state="foundation", order=0),
            ModuleMigrationStatus(key="scorecard", label="Scorecard 2026", state="pending", order=1),
            ModuleMigrationStatus(key="rdo", label="Aprovação de RDO", state="pending", order=2),
            ModuleMigrationStatus(key="idp", label="IDP — aderência ao cronograma", state="pending", order=3),
            ModuleMigrationStatus(key="rnc", label="RNC", state="pending", order=4),
            ModuleMigrationStatus(key="cinco-s", label="5S", state="pending", order=5),
            ModuleMigrationStatus(key="taxa-acidentes", label="Taxa de acidentes", state="pending", order=6),
        ],
    )
