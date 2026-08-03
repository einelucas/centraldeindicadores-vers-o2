import { ModuleWorkspace } from "@/components/layout/ModuleWorkspace";
import { ReferenceSectionHeader } from "@/components/layout/ReferenceSectionHeader";
import { IdpPublishedPanel } from "@/features/idp/components/IdpPublishedPanel";
import { IdpView } from "@/features/idp/components/IdpView";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "IDP - Disciplinas — Central de Indicadores" };

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
            title="IDP - Disciplinas (Administração)"
            description='Aderência ao cronograma por disciplina, calculada pela relação entre Linha de Base e Real a partir do relatório "Uso de Atribuições" do MS Project.'
          />
          <IdpView canPublish={isAdmin} canClear={isAdmin} />
        </>
      ) : null}
    />
  );
}
