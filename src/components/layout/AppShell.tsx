import type { CurrentUser } from "@/server/auth/session";
import { AppHeader } from "./AppHeader";
import { TabsNav } from "./TabsNav";
import { ToolbarSlotProvider } from "./ToolbarSlot";

/**
 * Shell visual da aplicação. A sidebar do antecessor não participa mais do
 * fluxo principal; as seis frentes ativas seguem a barra horizontal do painel.
 */
export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: CurrentUser;
}) {
  return (
    <ToolbarSlotProvider>
      <AppHeader user={user} />
      <TabsNav />
      <main>{children}</main>
      <footer className="app">
        Central de Indicadores - 2026
      </footer>
    </ToolbarSlotProvider>
  );
}
