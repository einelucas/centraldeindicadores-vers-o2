/**
 * Matriz de permissões por perfil (VIEWER / ANALYST / ADMIN).
 * A autorização é sempre verificada no servidor.
 */

export type Role = "VIEWER" | "ANALYST" | "ADMIN";

export type Permission =
  | "indicators:read"
  | "indicators:export"
  | "indicators:edit"
  | "indicators:publish"
  | "import:run"
  | "import:read"
  | "users:manage"
  | "audit:read"
  | "settings:manage";

const MATRIX: Record<Role, Permission[]> = {
  VIEWER: ["indicators:read", "indicators:export"],
  ANALYST: [
    "indicators:read",
    "indicators:export",
    "import:run",
    "import:read",
  ],
  ADMIN: [
    "indicators:read",
    "indicators:export",
    "indicators:edit",
    "indicators:publish",
    "import:run",
    "import:read",
    "users:manage",
    "audit:read",
    "settings:manage",
  ],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...MATRIX[role]];
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Permissão negada: ${permission}`);
    this.name = "ForbiddenError";
  }
}

/** Lança ForbiddenError se o perfil não tiver a permissão. */
export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}
