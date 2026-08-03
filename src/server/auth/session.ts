/**
 * Helpers de sessão para Route Handlers.
 * Resolvem o usuário autenticado e aplicam autorização por perfil.
 */

import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { prisma } from "@/server/database/prisma";
import { assertCan, type Permission, type Role } from "@/server/permissions";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
}

/** Retorna o usuário autenticado, ou null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  // Confirma no banco o role/active atual (fonte de verdade).
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  if (!dbUser || !dbUser.active) return null;

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
    active: dbUser.active,
  };
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Não autenticado");
    this.name = "UnauthorizedError";
  }
}

/** Exige autenticação; lança UnauthorizedError se ausente. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Exige autenticação + permissão. Lança se faltar qualquer uma. */
export async function requirePermission(
  permission: Permission,
): Promise<CurrentUser> {
  const user = await requireUser();
  assertCan(user.role, permission);
  return user;
}
