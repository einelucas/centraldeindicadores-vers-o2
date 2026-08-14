import { ModuleWorkspace } from "@/components/layout/ModuleWorkspace";
import { ReferenceSectionHeader } from "@/components/layout/ReferenceSectionHeader";
import { RdoPublishedPanel } from "@/features/rdo/components/RdoPublishedPanel";
import { RdoView } from "@/features/rdo/components/RdoView";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "RDO — Central de Indicadores" };

export default async function RdoPage() {
  const user = await getCurrentUser();
  const canAdmin = user !== null && user.role !== "VIEWER";
  const isAdmin = user?.role === "ADMIN";

  return (
    <ModuleWorkspace
      eyebrow="Planejamento · RDO"
      title="Aprovação de RDO"
      description="Painel de aprovação dos Relatórios Diários de Obra (RDO) por unidade e por mês."
      panel={<RdoPublishedPanel />}
      administration={canAdmin ? (
        <>
          <ReferenceSectionHeader
            title="RDO — Aprovação de Relatórios"
            description="Aderência de aprovação por unidade e por mês, a partir da exportação de RDOs."
          />
          <RdoView canPublish={isAdmin} canClear={isAdmin} />
        </>
      ) : null}
    />
  );
}
