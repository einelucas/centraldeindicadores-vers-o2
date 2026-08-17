# Central de Indicadores

Aplicação web desenvolvida pelo time de Planejamento da INPASA para importar, calcular, publicar e acompanhar indicadores operacionais em um único ambiente. O sistema separa o processamento administrativo dos painéis de consulta, mantém histórico de publicações e consolida o ciclo de desempenho em um scorecard.

A identidade visual (cabeçalho, abas por ícone, hierarquia de cartões dos painéis) segue o padrão do hub corporativo de automação, para facilitar uma futura integração.

## Principais recursos

- autenticação e controle de acesso por perfil;
- importação de planilhas e arquivos CSV;
- processamento incremental e deduplicação de registros;
- cálculo por indicador, unidade e período;
- publicação versionada de resultados;
- painéis de consulta separados da área administrativa;
- histórico de snapshots publicados;
- scorecard consolidado por ciclo semestral (junho–novembro ou dezembro–maio);
- exportações em Excel e PDF;
- auditoria de operações administrativas;
- testes unitários, testes de integração e testes de interface.

## Indicadores disponíveis

1. Aprovação de RDO;
2. IDP — aderência ao cronograma por disciplina;
3. RNC — prazo e aderência de tratativa;
4. 5S;
5. Taxa de acidentes;
6. Scorecard 2026 e Painel Geral.

## Stack

| Camada         | Tecnologia                        |
| -------------- | --------------------------------- |
| Aplicação      | Next.js 15, React 19 e TypeScript |
| Interface      | shadcn/ui e lucide-react          |
| Banco de dados | PostgreSQL na Neon                |
| ORM            | Prisma 6                          |
| Autenticação   | Better Auth                       |
| Validação      | Zod                               |
| Planilhas      | SheetJS/XLSX e Papa Parse         |
| Exportação PDF | jsPDF, AutoTable e html2canvas    |
| Gráficos       | Recharts                          |
| Testes         | Vitest e Playwright               |
| Deploy         | Vercel                            |

## Estrutura do projeto

```text
src/
├── app/
│   ├── (auth)/
│   ├── (dashboard)/
│   └── api/
├── components/
├── features/
├── importers/
├── lib/
└── server/

prisma/
├── manual/
├── migrations/
├── schema.prisma
└── seed.ts

docs/
tests/
```

Cada indicador possui sua própria pasta em `src/features`, normalmente dividida em componentes, cálculos, importadores, serviços, publicações e tipos.

## Pré-requisitos

- Node.js 20 ou superior;
- pnpm 9;
- acesso a uma instância PostgreSQL compatível;
- variáveis de ambiente configuradas.

## Configuração local

```bash
pnpm install
cp .env.example .env
pnpm db:generate
pnpm dev
```

No Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

A aplicação ficará disponível em `http://localhost:3000`.

### Variáveis de ambiente

```env
DATABASE_URL="postgresql://USER:PASSWORD@POOLER_HOST/DATABASE?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@DIRECT_HOST/DATABASE?sslmode=require"
BETTER_AUTH_SECRET="CHANGE_ME"
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
INITIAL_ADMIN_NAME="Administrador"
INITIAL_ADMIN_EMAIL="admin@example.com"
INITIAL_ADMIN_PASSWORD="CHANGE_ME_WITH_AT_LEAST_8_CHARACTERS"
IMPORT_BATCH_SIZE="500"
```

Nunca versione o arquivo `.env`.

## Banco de dados

Para gerar o cliente Prisma:

```bash
pnpm db:generate
```

Para conferir a estrutura de um banco existente:

```bash
pnpm db:pull
```

O comando `db:pull` altera o `schema.prisma` local. Revise o diff antes de manter qualquer mudança. Em bancos corporativos, não execute `db:push` ou migrations sem revisar o impacto.

Para criar o primeiro administrador:

```bash
pnpm db:seed
```

## Perfis de acesso

| Perfil    | Acesso principal                                                               |
| --------- | ------------------------------------------------------------------------------ |
| `VIEWER`  | Consulta de painéis e recursos de leitura permitidos                           |
| `ANALYST` | Consulta, administração de indicadores, importações e publicações              |
| `ADMIN`   | Todos os recursos, incluindo usuários, configurações e auditoria |

As permissões são validadas também no servidor. Ocultar um botão na interface não substitui a verificação da API.

## Fluxo de trabalho dos indicadores

```text
Arquivo ou entrada manual
        ↓
Leitura e normalização
        ↓
Validação e deduplicação
        ↓
Persistência no PostgreSQL
        ↓
Cálculo administrativo
        ↓
Publicação de snapshot
        ↓
Painel do indicador
        ↓
Painel Geral e Scorecard 2026
```

Os painéis de consulta utilizam snapshots publicados. Alterações feitas na Administração não aparecem no painel até que uma nova publicação seja realizada.

## Scorecard 2026

O ciclo é semestral, travado por um seletor de Ano + Semestre (igual aos
demais painéis administrativos): junho–novembro (S2) ou dezembro–maio (S1).

- pontuação máxima do ciclo: **11.582 pontos**;
- pontuação máxima mensal: **1.930,333333 pontos**;
- regra de pontuação: tudo ou nada por indicador e por mês;
- resultado ausente: zero ponto;
- precisão mantida no cálculo e arredondamento somente na exibição.

O painel de Administração do Scorecard é somente leitura em relação aos
valores: não há edição manual de indicadores nem do histórico do ciclo. Todo
valor vem do módulo de origem publicado (ao vivo) ou do último snapshot
salvo via "Salvar snapshot".

Consulte [`docs/scorecard-2026.md`](docs/scorecard-2026.md).

## Validação do projeto

```bash
pnpm security:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

O comando completo é:

```bash
pnpm check
```

Testes de interface:

```bash
pnpm test:e2e
```

## Deploy

O projeto está preparado para deploy na Vercel. Configure as mesmas variáveis do `.env` no ambiente da Vercel e utilize as URLs públicas nas variáveis `BETTER_AUTH_URL` e `NEXT_PUBLIC_APP_URL`.

O comando de build é:

```bash
pnpm build
```

## Documentação

A documentação técnica está organizada em [`docs/README.md`](docs/README.md).

Para a eventual integração ao hub corporativo de automação (Nuxt/Vue no frontend e FastAPI no backend), consulte [`docs/migration-fastapi-nuxt.md`](docs/migration-fastapi-nuxt.md).
