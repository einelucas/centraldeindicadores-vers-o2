# Banco na Neon

[Neon](https://neon.tech) é um PostgreSQL serverless. O projeto usa duas
connection strings, como o Prisma recomenda.

## Criar o banco

1. Crie um projeto na Neon.
2. Em **Connection Details**, copie:
   - a string **Pooled** → `DATABASE_URL` (usada pela aplicação);
   - a string **Direct** → `DIRECT_URL` (usada pelas migrations).
3. Garanta que ambas terminem com `?sslmode=require`.

## Configurar o Prisma

O `schema.prisma` já está preparado:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled
  directUrl = env("DIRECT_URL")     // direct (migrations)
}
```

## Aplicar schema e dados

```bash
pnpm db:deploy          # aplica as migrations
pnpm db:seed            # admin + configurações
```

## Por que pooled + direct?

- **Pooled** (via PgBouncer) suporta muitas conexões curtas — ideal para
  funções serverless.
- **Direct** é exigida pelo mecanismo de migrations do Prisma, que precisa de
  uma conexão de sessão estável.

## Dicas

- Use um **branch** da Neon para ambiente de staging/testes.
- Ative _autosuspend_ para economizar em ambientes não produtivos.
- Mantenha a região da Neon próxima à das funções da Vercel.
