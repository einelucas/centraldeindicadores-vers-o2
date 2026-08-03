# Integração corporativa (futuro)

A autenticação local (Better Auth) é intencionalmente isolada atrás de uma
abstração, para que possa ser substituída por um provedor corporativo (SSO)
sem reescrever a aplicação.

## Ponto de extensão

`src/server/auth/provider.ts` define a interface `AuthenticationProvider`. A
aplicação depende dessa interface, não do Better Auth diretamente nas regras de
negócio. Trocar o provedor significa fornecer outra implementação dela.

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
