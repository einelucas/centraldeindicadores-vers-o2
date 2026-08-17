# Integração corporativa (futuro)

A autenticação local (Better Auth) foi pensada para ser substituível por um
provedor corporativo (SSO) sem reescrever as regras de negócio — mas essa
substituição **ainda não está isolada na prática**. Veja a ressalva abaixo
antes de assumir que basta implementar uma interface.

> **Decisão concreta já tomada**: o provedor corporativo será **Keycloak**,
> com Microsoft Entra ID configurado dentro dele. O plano detalhado, com
> arquivos exatos a trocar, fluxo OIDC, provisionamento de usuários e ordem de
> migração está em
> [`migration-authentication-keycloak.md`](migration-authentication-keycloak.md).
> Este documento descreve apenas o ponto de extensão genérico que já existe no
> código hoje.

## Ponto de extensão

`src/server/auth/provider.ts` define a interface `AuthenticationProvider` e o
tipo `AuthenticatedIdentity`. **Nenhum código do projeto usa essa interface
hoje** — `getCurrentUser()`, `requireUser()` e `requirePermission()`
(`src/server/auth/session.ts`) importam o Better Auth diretamente, e a tela de
login (`src/app/(auth)/login/page.tsx`) chama `signIn.email` do Better Auth
também diretamente. `provider.ts` é só a assinatura pretendida para o
provedor futuro, não um adapter já plugado.

Trocar o provedor de fato significa substituir esses pontos concretos
(sessão, login, logout) — implementar `AuthenticationProvider` sozinho não
troca nada em produção. Ver a lista completa de arquivos em
[`migration-authentication-keycloak.md`](migration-authentication-keycloak.md#31-arquivos-envolvidos).

## Campos já preparados

O modelo `User` inclui:

- `authProvider` — identifica a origem da conta (`LOCAL`, ou um provedor externo).
- `externalUserId` — id do usuário no sistema corporativo.

Assim, contas provisionadas por SSO convivem com contas locais.

## Caminho de migração sugerido

1. Implementar `AuthenticationProvider` para o IdP corporativo (OIDC/SAML).
2. No primeiro login federado, criar/associar o `User` local (JIT provisioning),
   preenchendo `authProvider` e `externalUserId`.
3. Mapear grupos/claims do IdP para os perfis internos (VIEWER/ANALYST/ADMIN).
4. Manter a matriz de permissões como está — ela independe do provedor.
5. Opcionalmente desativar o fluxo de e-mail/senha, mantendo uma conta local de
   emergência (break-glass).

## O que **não** muda

- A matriz de permissões (`server/permissions`).
- As verificações `requirePermission` nas rotas.
- O modelo de dados dos indicadores e o motor de importação.
