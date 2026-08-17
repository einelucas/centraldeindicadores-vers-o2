# Autenticação

Provedor atual: **Better Auth** (e-mail + senha), com a sessão persistida no
PostgreSQL via adapter Prisma.

## Características

- **Cadastro público desabilitado** (`disableSignUp: true`). Usuários são criados
  apenas por um admin em `/api/usuarios` ou pelo seed inicial.
- **Senhas** com hash gerado pelo Better Auth (mínimo de 8 caracteres).
- **Sessão** de 8 horas, renovada a cada hora de atividade.
- **Cookies** HttpOnly; Secure em produção; SameSite Lax.
- Campos adicionais no usuário: `role`, `active`, `authProvider`,
  `externalUserId`, `lastLoginAt`.

## Variáveis de ambiente

| Variável             | Uso                                        |
| -------------------- | ------------------------------------------ |
| `BETTER_AUTH_SECRET` | segredo de assinatura (obrigatório)        |
| `BETTER_AUTH_URL`    | URL base para callbacks/redirects          |
| `NEXT_PUBLIC_APP_URL`| URL base exposta ao cliente                |

Gere o segredo com `openssl rand -base64 32`.

## Fluxo no servidor

- `getCurrentUser()` resolve a sessão e **reconfirma no banco** o `role`/`active`
  atuais (o banco é a fonte de verdade, não o cookie).
- `requireUser()` exige autenticação.
- `requirePermission(permission)` exige autenticação **e** permissão de perfil.

O layout do dashboard (`app/(dashboard)/layout.tsx`) protege todas as páginas
autenticadas no servidor, redirecionando para `/login` quando não há sessão.

## Primeiro acesso

```bash
# defina no .env
INITIAL_ADMIN_NAME=...
INITIAL_ADMIN_EMAIL=...
INITIAL_ADMIN_PASSWORD=...

pnpm db:seed   # cria o admin apenas se ainda não existir (idempotente)
```

Troque a senha do admin no primeiro acesso.

## Substituição futura por SSO corporativo

`server/auth/provider.ts` declara a interface `AuthenticationProvider`, mas
**não está conectada ao fluxo real** — `getCurrentUser()`/`requirePermission()`
(`server/auth/session.ts`) e a tela de login importam o Better Auth
diretamente, sem passar por essa interface. Trocar o provedor exige
substituir esses pontos concretos, não apenas implementar a interface.

Os campos `authProvider` e `externalUserId` já preveem contas vindas de um
sistema externo. O plano de migração está detalhado em
[`migration-authentication-keycloak.md`](migration-authentication-keycloak.md)
(Keycloak + Microsoft Entra ID, decisão recomendada para este projeto); veja
também `corporate-integration.md` para o ponto de extensão genérico.
