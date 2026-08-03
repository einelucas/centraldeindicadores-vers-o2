import Link from "next/link";
import { redirect } from "next/navigation";
import { ReferenceSectionHeader } from "@/components/layout/ReferenceSectionHeader";
import { UsersManager } from "@/features/admin/components/UsersManager";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "Usuários — Central de Indicadores" };

export default async function Page() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/dashboard/scorecard");

  return (
    <>
      <Link className="admin-back" href="/dashboard/administracao">← Voltar à administração</Link>
      <ReferenceSectionHeader title="Usuários" description="Contas, perfis de acesso e status dos usuários." />
      <UsersManager />
    </>
  );
}
