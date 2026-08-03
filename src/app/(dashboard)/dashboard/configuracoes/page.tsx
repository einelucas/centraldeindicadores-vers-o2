import Link from "next/link";
import { redirect } from "next/navigation";
import { ReferenceSectionHeader } from "@/components/layout/ReferenceSectionHeader";
import { SettingsManager } from "@/features/admin/components/SettingsManager";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "Configurações — Central de Indicadores" };

export default async function Page() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/dashboard/scorecard");

  return (
    <>
      <Link className="admin-back" href="/dashboard/administracao">← Voltar à administração</Link>
      <ReferenceSectionHeader title="Configurações" description="Metas, prazos e listas de exclusão utilizadas pelos módulos." />
      <SettingsManager />
    </>
  );
}
