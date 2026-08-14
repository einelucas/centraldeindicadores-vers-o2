import { ModuleWorkspace } from "@/components/layout/ModuleWorkspace";
import { ReferenceSectionHeader } from "@/components/layout/ReferenceSectionHeader";
import { AccidentRatePublishedPanel } from "@/features/taxa-acidentes/components/AccidentRatePublishedPanel";
import { AccidentRateView } from "@/features/taxa-acidentes/components/AccidentRateView";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = {
  title: "Taxa de Acidentes — Central de Indicadores",
};

export default async function AccidentRatePage() {
  const user = await getCurrentUser();

  const canAdmin = user !== null && user.role !== "VIEWER";
  const isAdmin = user?.role === "ADMIN";

  return (
    <ModuleWorkspace
      eyebrow="Planejamento · Segurança"
      title="Taxa de Acidentes"
      description="Painel de acompanhamento dos indicadores de segurança do trabalho."
      panel={<AccidentRatePublishedPanel />}
      administration={
        canAdmin ? (
          <>
            <ReferenceSectionHeader
              title="Taxa de Acidentes (Administração)"
              description="Registre mensalmente a Taxa de Frequência, a quantidade total de acidentes CAF e os acidentes CAF e SAF por unidade."
            />

            <AccidentRateView canPublish={isAdmin} canClear={isAdmin} />
          </>
        ) : null
      }
    />
  );
}
