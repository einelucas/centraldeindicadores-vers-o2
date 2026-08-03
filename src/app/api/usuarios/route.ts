import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { auth } from "@/server/auth";
import { handleApiError } from "@/server/http";
import { recordAudit } from "@/server/audit";

/** GET /api/usuarios — lista usuários (somente admin). */
export async function GET() {
  try {
    await requirePermission("users:manage");
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        authProvider: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ items: users });
  } catch (err) {
    return handleApiError(err);
  }
}

const createUserSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "Senha deve ter ao menos 8 caracteres"),
  role: z.enum(["VIEWER", "ANALYST", "ADMIN"]).default("VIEWER"),
});

/** POST /api/usuarios — cria um usuário (somente admin). */
export async function POST(req: NextRequest) {
  try {
    const admin = await requirePermission("users:manage");
    const body = await req.json();
    const data = createUserSchema.parse(body);

    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Já existe um usuário com este e-mail" },
        { status: 409 },
      );
    }

    // Cria via Better Auth (gera hash seguro), depois aplica o perfil.
    // O cadastro público é desativado (disableSignUp), então criamos o usuário
    // e a conta de credenciais direto, gerando o hash pelo próprio Better Auth.
    const ctx = await auth.$context;
    const hash = await ctx.password.hash(data.password);

    const created = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        role: data.role,
        active: true,
        emailVerified: true,
        accounts: {
          create: {
            accountId: "",
            providerId: "credential",
            password: hash,
          },
        },
      },
      select: { id: true, name: true, email: true, role: true, active: true },
    });

    // Better Auth espera accountId igual ao id do usuário para credenciais.
    await prisma.account.updateMany({
      where: { userId: created.id, providerId: "credential" },
      data: { accountId: created.id },
    });
    await recordAudit({
      userId: admin.id,
      action: "user.create",
      entity: "User",
      entityId: created.id,
      newData: { email: created.email, role: created.role },
    });

    return NextResponse.json({ user: created }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
