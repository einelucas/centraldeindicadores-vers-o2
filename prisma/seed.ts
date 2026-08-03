/**
 * Seed principal.
 * - Cria o primeiro administrador SOMENTE se ainda não existir.
 * - A senha vem de variável de ambiente (nunca fixa no repositório).
 * - Popula AppSettings com metas/exclusões padrão migradas do HTML.
 *
 * Uso: pnpm db:seed
 */

import { PrismaClient } from "@prisma/client";
import { auth } from "../src/server/auth";

const prisma = new PrismaClient();

const DEFAULT_SETTINGS: Array<{ key: string; value: unknown }> = [
  { key: "rdo.target", value: 0.8 },
  { key: "idp.target", value: 0.9 },
  {
    key: "idp.excludedDisciplines",
    value: ["10 _ Fornecimentos", "09 _ Projetos"],
  },
  { key: "fiveS.target", value: 0.9 },
  { key: "rnc.maxPrazoDias", value: 15 },
  { key: "fiveS.excludedUnits", value: ["SP", "CSC"] },
  { key: "taxa-acidentes.target", value: 7.5 },
];

async function main() {
  // 1. Settings padrão (idempotente)
  for (const s of DEFAULT_SETTINGS) {
    await prisma.appSetting.upsert({
      where: { key: s.key },
      create: { key: s.key, value: s.value as never },
      update: {}, // não sobrescreve ajustes já feitos
    });
  }
  console.log(`✓ ${DEFAULT_SETTINGS.length} configurações garantidas.`);

  // 2. Primeiro administrador
  const name = process.env.INITIAL_ADMIN_NAME;
  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!name || !email || !password) {
    console.warn(
      "⚠ INITIAL_ADMIN_* não definidas — pulando criação do admin. " +
        "Defina no .env para criar o primeiro administrador.",
    );
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✓ Admin já existe (${email}) — nada a fazer.`);
    return;
  }

  // O cadastro público é desativado (disableSignUp) por segurança, então não
  // usamos signUpEmail aqui. Criamos o usuário e a conta de credenciais direto,
  // gerando o hash da senha pelo próprio Better Auth (mesmo algoritmo do login).
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(password);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      emailVerified: true,
      role: "ADMIN",
      active: true,
    },
  });

  await prisma.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: hash,
    },
  });
  console.log(`✓ Administrador criado: ${email}`);
  console.log("  → Troque a senha no primeiro acesso.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
