/**
 * Validação das variáveis de ambiente com Zod.
 * A aplicação falha cedo, com mensagem clara, se algo obrigatório faltar.
 */

import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL deve ser uma URL PostgreSQL válida"),
  DIRECT_URL: z.string().url().optional(),
  BETTER_AUTH_SECRET: z
    .string()
    .min(16, "BETTER_AUTH_SECRET deve ter pelo menos 16 caracteres"),
  BETTER_AUTH_URL: z.string().url(),
  IMPORT_BATCH_SIZE: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 500))
    .pipe(z.number().int().positive()),
  // Usadas apenas pelo seed; opcionais em runtime da app.
  INITIAL_ADMIN_NAME: z.string().optional(),
  INITIAL_ADMIN_EMAIL: z.string().email().optional(),
  INITIAL_ADMIN_PASSWORD: z.string().optional(),
});

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

function parseEnv() {
  const parsedServer = serverSchema.safeParse(process.env);
  const parsedPublic = publicSchema.safeParse(process.env);

  if (!parsedServer.success || !parsedPublic.success) {
    const issues = [
      ...(parsedServer.success ? [] : parsedServer.error.issues),
      ...(parsedPublic.success ? [] : parsedPublic.error.issues),
    ]
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Variáveis de ambiente inválidas ou ausentes:\n${issues}\n` +
        `Confira o arquivo .env.example.`,
    );
  }

  return { ...parsedServer.data, ...parsedPublic.data };
}

// Em runtime de servidor validamos; no client apenas as NEXT_PUBLIC_ existem.
export const env =
  typeof window === "undefined"
    ? parseEnv()
    : ({
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "",
      } as ReturnType<typeof parseEnv>);
