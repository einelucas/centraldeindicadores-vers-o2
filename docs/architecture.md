# Arquitetura

## Visão geral

A Central de Indicadores é uma aplicação Next.js (App Router) que substitui um
HTML monolítico onde todo o estado vivia no navegador. A nova arquitetura move a
lógica para camadas bem definidas e persiste os dados em PostgreSQL, permitindo
histórico, autenticação, auditoria e importação incremental confiável.

## Camadas

```
Navegador (upload + parsing)  →  API (validação + motor incremental)  →  Postgres
        client component               route handlers                    Prisma
```

1. **Navegador** — o usuário envia planilhas. O parsing (Excel/CSV) acontece no
   cliente; apenas o **JSON normalizado** é enviado à API. Arquivos originais
   nunca são persistidos no servidor.
2. **API (Route Handlers)** — recebe os lotes, revalida com Zod, gera as chaves
   (business key / content hash) **no servidor** (fonte de verdade) e aplica o
   motor incremental dentro de transações Prisma.
3. **Banco** — PostgreSQL (Neon em produção), acessado via Prisma.

## Organização por feature

Cada módulo segue o mesmo padrão de camadas, usando o **RDO como referência**:

```
features/<modulo>/
  types/         Constantes e tipos do domínio (metas, colunas obrigatórias)
  schemas/       Validação Zod dos registros
  calculations/  Cálculo dos indicadores (puro, testável)
  utils/keys.ts  businessKey + contentHash do módulo
  importers/     Leitura/normalização/dedup no navegador
  repositories/  Delegate Prisma (findByBusinessKey/insert/update)
  services/      Orquestração backend + recálculo de indicadores
  components/     UI (importador, listas, detalhes)
```

Esse isolamento permite portar um módulo de cada vez sem afetar os demais.

## Código compartilhado

- `lib/` — utilitários puros (datas, moeda, normalização, hashing, lotes). Sem
  dependência de framework, 100% testável.
- `importers/shared/` — leitor de planilhas e o motor de importação incremental,
  desacoplado do Prisma através de uma interface `RecordDelegate`.
- `server/` — autenticação (Better Auth), matriz de permissões, serviços de
  importação, auditoria e tratamento de erros HTTP.

## Autenticação e autorização

- **Better Auth** com e-mail/senha e cadastro público desabilitado.
- Perfis **VIEWER / ANALYST / ADMIN**, verificados sempre no servidor via
  `requirePermission`. Veja `roles-permissions.md`.
- `server/auth/provider.ts` declara uma interface `AuthenticationProvider`
  para uma futura troca de provedor, mas ela **não está conectada** ao fluxo
  real hoje (`getCurrentUser`/login usam o Better Auth diretamente). O plano
  de substituição por SSO corporativo (Keycloak + Microsoft Entra ID) está em
  `migration-authentication-keycloak.md`; `corporate-integration.md` descreve
  o ponto de extensão genérico.

## Decisão de versões

O enunciado pedia Next.js 16 e Tailwind 4. Para garantir um build reprodutível e
estável no momento da migração, o projeto usa:

- **Next.js 15** (App Router) + **React 19**
- **Tailwind CSS 3**

Ambos são as versões estáveis compatíveis entre si e com o ecossistema
(Prisma, Better Auth). A atualização para Next 16 / Tailwind 4 é incremental:
subir as dependências, rodar os codemods do Next e migrar o `tailwind.config`
para a sintaxe CSS-first do Tailwind 4. Nenhuma regra de negócio depende dessas
versões.

## Testes

- **Unitários** (Vitest): utilitários e lógica de cálculo do RDO.
- **Integração** (Vitest): fluxo incremental completo com fixtures `.xlsx` reais.
- **E2E** (Playwright): jornadas de usuário (login, importação) — configurado.
