import Link from "next/link";
import { redirect } from "next/navigation";
import { ReferenceSectionHeader } from "@/components/layout/ReferenceSectionHeader";
import { ImportHistory } from "@/features/admin/components/ImportHistory";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "Importações — Central de Indicadores" };

export default async function Page() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/dashboard/scorecard");

  return (
    <>
      <Link className="admin-back" href="/dashboard/administracao">← Voltar à administração</Link>
      <ReferenceSectionHeader title="Importações" description="Histórico dos jobs, lotes processados e contagens de registros." />
      <ImportHistory />
    </>
  );
}
