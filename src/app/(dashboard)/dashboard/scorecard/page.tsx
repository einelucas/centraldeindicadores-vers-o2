import { ModuleWorkspace } from "@/components/layout/ModuleWorkspace";
import { ReferenceSectionHeader } from "@/components/layout/ReferenceSectionHeader";
import { DashboardOverview } from "@/features/dashboard/components/DashboardOverview";
import { ScorecardView } from "@/features/scorecard/components/ScorecardView";
import { loadScorecardPanelPeriod } from "@/features/scorecard/services";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";

export const metadata = { title: "Scorecard — Central de Indicadores" };

export default async function ScorecardPage() {
  const user = await getCurrentUser();
  const canAdmin = user !== null && user.role !== "VIEWER";
  const canClearHistory = user?.role === "ADMIN";
  const initialPeriod = user ? await loadScorecardPanelPeriod(prisma) : null;

  return (
    <ModuleWorkspace
      eyebrow="Planejamento · PMO Obras & Melhorias"
      title="Indicadores de Obra"
      description="Dashboard para visualização de indicadores de obras e melhorias."
      panelLabel="Painel Geral"
      panel={<DashboardOverview />}
      administration={
        canAdmin ? (
          <>
            <ReferenceSectionHeader
              title="Scorecard consolidado (Administração)"
              description="Consolida as publicações de RDO, IDP, RNC, 5S e Taxa de Acidentes com os pesos e metas vigentes para o período selecionado."
            />
            <ScorecardView canClearHistory={canClearHistory} initialPeriod={initialPeriod} />
          </>
        ) : null
      }
    />
  );
}
