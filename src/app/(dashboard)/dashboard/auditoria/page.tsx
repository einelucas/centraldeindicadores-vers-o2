import Link from "next/link";
import { redirect } from "next/navigation";
import { ReferenceSectionHeader } from "@/components/layout/ReferenceSectionHeader";
import { AuditViewer } from "@/features/admin/components/AuditViewer";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "Auditoria — Central de Indicadores" };

export default async function Page() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/dashboard/scorecard");

  return (
    <>
      <Link className="admin-back" href="/dashboard/administracao">← Voltar à administração</Link>
      <ReferenceSectionHeader title="Auditoria" description="Trilha de eventos do sistema: importações, alterações de usuários, snapshots e configurações." />
      <AuditViewer />
    </>
  );
}
