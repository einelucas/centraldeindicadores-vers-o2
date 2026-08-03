/** Helpers de resposta HTTP e tratamento de erros para Route Handlers. */
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "@/server/auth/session";
import { ForbiddenError } from "@/server/permissions";

/** Converte erros conhecidos em respostas seguras (sem stack trace ao usuário). */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Dados inválidos", issues: err.issues },
      { status: 422 },
    );
  }
  // Log técnico fica no servidor; usuário recebe mensagem genérica.
  console.error("[API] erro não tratado:", err);
  return NextResponse.json(
    { error: "Erro interno ao processar a requisição" },
    { status: 500 },
  );
}
