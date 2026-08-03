import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";
import { recordAudit } from "@/server/audit";

const updateUserSchema = z
  .object({
    role: z.enum(["VIEWER", "ANALYST", "ADMIN"]).optional(),
    active: z.boolean().optional(),
    name: z.string().min(1).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Informe ao menos um campo para atualizar",
  });

/** PATCH /api/usuarios/[id] — atualiza perfil, nome ou status (somente admin). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requirePermission("users:manage");
    const { id } = await params;
    const body = await req.json();
    const data = updateUserSchema.parse(body);

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 },
      );
    }

    // Trava de segurança: um admin não pode desativar nem rebaixar a si mesmo
    // (evita perder o último acesso administrativo por engano).
    if (target.id === admin.id) {
      if (data.active === false || (data.role && data.role !== "ADMIN")) {
        return NextResponse.json(
          { error: "Você não pode rebaixar ou desativar a própria conta" },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, active: true },
    });

    await recordAudit({
      userId: admin.id,
      action: "user.update",
      entity: "User",
      entityId: id,
      previousData: {
        role: target.role,
        active: target.active,
        name: target.name,
      },
      newData: data,
    });

    return NextResponse.json({ user: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
