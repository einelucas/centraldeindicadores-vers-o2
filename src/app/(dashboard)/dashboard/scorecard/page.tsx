import { ModuleWorkspace } from "@/components/layout/ModuleWorkspace";
import { ReferenceSectionHeader } from "@/components/layout/ReferenceSectionHeader";
import { DashboardOverview } from "@/features/dashboard/components/DashboardOverview";
import { ScorecardView } from "@/features/scorecard/components/ScorecardView";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "2026 — Central de Indicadores" };

export default async function ScorecardPage() {
  const user = await getCurrentUser();
  const canAdmin = user !== null && user.role !== "VIEWER";

  return (
    <ModuleWorkspace
      panelLabel="Painel Geral"
      panel={<DashboardOverview />}
      administration={canAdmin ? (
        <>
          <ReferenceSectionHeader
            title="2026 — Scorecard consolidado (Administração)"
            description='Consolida as publicações de RDO, IDP, RNC, 5S e Taxa de Acidentes com os pesos e metas vigentes para o ciclo de junho a novembro.'
          />
          <ScorecardView />
        </>
      ) : null}
    />
  );
}
