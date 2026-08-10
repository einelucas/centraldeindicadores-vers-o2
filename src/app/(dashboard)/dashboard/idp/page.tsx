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
            title="IDP — Aderência do Cronograma (Administração)"
            description="Controle semanal dos Relatórios Semanais de Obra (RSO), com rastreabilidade de versão, competência, período, emissão, execução e disciplinas."
          />
          <IdpView canPublish={isAdmin} canClear={isAdmin} />
        </>
      ) : null}
    />
  );
}
