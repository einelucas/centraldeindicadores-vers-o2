# Deploy na Vercel

## Pré-requisitos

- Repositório no GitHub.
- Banco PostgreSQL na Neon (ver `neon.md`).

## Passo a passo

1. **Importar o projeto** na Vercel e conectar o repositório GitHub.
2. **Framework**: Next.js (detectado automaticamente).
3. **Variáveis de ambiente** (Project Settings → Environment Variables):

   | Variável               | Observação                                  |
   | ---------------------- | ------------------------------------------- |
   | `DATABASE_URL`         | string **pooled** da Neon                   |
   | `DIRECT_URL`           | string **direct** da Neon (migrations)      |
   | `BETTER_AUTH_SECRET`   | `openssl rand -base64 32`                   |
   | `BETTER_AUTH_URL`      | URL de produção (ex.: `https://app.vercel.app`) |
   | `NEXT_PUBLIC_APP_URL`  | mesma URL de produção                       |
   | `INITIAL_ADMIN_*`      | opcional, apenas se for rodar o seed        |
   | `IMPORT_BATCH_SIZE`    | opcional (padrão 500)                       |

4. **Build**: o comando padrão `pnpm build` roda `prisma generate && next build`.
   O `postinstall`/generate baixa o engine do Prisma automaticamente.
5. **Migrations**: aplique o schema no banco de produção com
   `pnpm db:deploy` (localmente apontando para a Neon, ou como passo de deploy).
6. **Seed** (uma vez): `pnpm db:seed` para criar o admin e as configurações.

## Notas

- As páginas do dashboard são dinâmicas (`force-dynamic`) porque dependem de
  sessão e banco — não há prerender estático que exija DB no build.
- Prefira a connection string **pooled** para a aplicação e a **direct** apenas
  para migrations (exigência do Prisma + Neon).
- Defina a região da função Vercel próxima à região da Neon para reduzir
  latência.

## Verificação pós-deploy

1. Acesse a URL e faça login com o admin.
2. Vá em Dashboard → RDO e importe uma planilha.
3. Reimporte a mesma planilha: tudo deve constar como _ignorado_.
