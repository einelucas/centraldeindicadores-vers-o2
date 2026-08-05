import { ModuleWorkspace } from "@/components/layout/ModuleWorkspace";
import { ReferenceSectionHeader } from "@/components/layout/ReferenceSectionHeader";
import { IdpPublishedPanel } from "@/features/idp/components/IdpPublishedPanel";
import { IdpView } from "@/features/idp/components/IdpView";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "IDP — Avanço Físico RSO — Central de Indicadores" };

export default async function IdpPage() {
  const user = await getCurrentUser();
  const canAdmin = user !== null && user.role !== "VIEWER";
  const isAdmin = user?.role === "ADMIN";

  return (
    <ModuleWorkspace
      panel={<IdpPublishedPanel />}
      administration={canAdmin ? (
        <>
          <ReferenceSectionHeader
            title="IDP — Cronograma (Administração)"
            description="Aderência do avanço físico calculada a partir do RSO mais recente de cada unidade. A execução geral usa a média das fases; o consolidado por disciplina usa todas as áreas reconhecidas nos PDFs ativos."
          />
          <IdpView canPublish={isAdmin} canClear={isAdmin} />
        </>
      ) : null}
    />
  );
}
