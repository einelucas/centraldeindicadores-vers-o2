import { ModuleWorkspace } from "@/components/layout/ModuleWorkspace";
import { ReferenceSectionHeader } from "@/components/layout/ReferenceSectionHeader";
import { RncPublishedPanel } from "@/features/rnc/components/RncPublishedPanel";
import { RncView } from "@/features/rnc/components/RncView";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "RNC — Central de Indicadores" };

export default async function RncPage() {
  const user = await getCurrentUser();
  const canAdmin = user !== null && user.role !== "VIEWER";
  const isAdmin = user?.role === "ADMIN";

  return (
    <ModuleWorkspace
      eyebrow="Planejamento · RNC"
      title="Não Conformidades"
      description="Painel de acompanhamento das RNCs e do tempo de tratativa por unidade."
      panel={<RncPublishedPanel />}
      administration={
        canAdmin ? (
          <>
            <ReferenceSectionHeader
              title="RNC (Administração)"
              description='Prazo médio de resolução (meta ≤ 15 dias) e aderência de tratativa, a partir da base "Controle de Conformidade de Obra".'
            />
            <RncView canPublish={isAdmin} canClear={isAdmin} />
          </>
        ) : null
      }
    />
  );
}
