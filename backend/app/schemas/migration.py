from typing import Literal

from pydantic import BaseModel


MigrationState = Literal["foundation", "pending", "in_progress", "completed"]


class ModuleMigrationStatus(BaseModel):
    key: str
    label: str
    state: MigrationState
    order: int


class MigrationStatusResponse(BaseModel):
    strategy: str
    database_strategy: str
    modules: list[ModuleMigrationStatus]
