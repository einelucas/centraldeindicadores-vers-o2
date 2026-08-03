/**
 * Abstração de autenticação, preparada para trocar o provider local pelo
 * Hub de Automação corporativo no futuro, sem tocar no resto da aplicação.
 *
 * Hoje: LocalAuthenticationProvider (Better Auth, e-mail+senha).
 * Futuro: HubAuthenticationProvider (OIDC / JWT corporativo / proxy assinado).
 *
 * IMPORTANTE: não confiar em cabeçalhos simples enviados pelo navegador.
 * O provider futuro deve validar tokens assinados. Ver docs/corporate-integration.md.
 */

export interface AuthenticatedIdentity {
  userId: string;
  email: string;
  name: string;
  role: "VIEWER" | "ANALYST" | "ADMIN";
  authProvider: "LOCAL" | "HUB";
  externalUserId: string | null;
}

export interface AuthenticationProvider {
  /** Resolve a identidade a partir das credenciais/contexto. */
  authenticate(input: unknown): Promise<AuthenticatedIdentity>;
}
