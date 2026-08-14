import { ModuleWorkspace } from "@/components/layout/ModuleWorkspace";
import { ReferenceSectionHeader } from "@/components/layout/ReferenceSectionHeader";
import { FiveSPublishedPanel } from "@/features/cinco-s/components/FiveSPublishedPanel";
import { FiveSView } from "@/features/cinco-s/components/FiveSView";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "5S — Central de Indicadores" };

export default async function FiveSPage() {
  const user = await getCurrentUser();
  const canAdmin = user !== null && user.role !== "VIEWER";
  const isAdmin = user?.role === "ADMIN";

  return (
    <ModuleWorkspace
      eyebrow="Planejamento · 5S"
      title="Programa 5S"
      description="Painel de aderência das auditorias 5S por unidade e área."
      panel={<FiveSPublishedPanel />}
      administration={
        canAdmin ? (
          <>
            <ReferenceSectionHeader
              title="5S (Administração)"
              description="Aderência do programa 5S por área, unidade e mês — meta global ≥ 90%. SP e CSC ficam visíveis, mas fora do consolidado das obras."
            />
            <FiveSView canPublish={isAdmin} canClear={isAdmin} />
          </>
        ) : null
      }
    />
  );
}
