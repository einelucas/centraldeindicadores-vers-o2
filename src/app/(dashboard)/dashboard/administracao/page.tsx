import Link from "next/link";
import { redirect } from "next/navigation";
import { ReferenceSectionHeader } from "@/components/layout/ReferenceSectionHeader";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "Administração — Central de Indicadores" };

const ITEMS = [
  {
    href: "/dashboard/importacoes",
    title: "Importações",
    description: "Histórico dos processamentos, lotes e registros rejeitados.",
  },
  {
    href: "/dashboard/usuarios",
    title: "Usuários",
    description: "Contas, perfis de acesso e ativação de usuários.",
  },
  {
    href: "/dashboard/auditoria",
    title: "Auditoria",
    description: "Trilha de importações, alterações e ações administrativas.",
  },
  {
    href: "/dashboard/configuracoes",
    title: "Configurações",
    description: "Metas, listas de exclusão e parâmetros globais.",
  },
] as const;

export default async function AdministrationPage() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/dashboard/scorecard");

  return (
    <>
      <ReferenceSectionHeader
        title="Administração do sistema"
        description="Recursos técnicos e cadastros foram retirados da barra principal para preservar o mesmo design e a mesma ordem de abas do HTML de referência."
      />
      <div className="admin-hub-grid">
        {ITEMS.map((item) => (
          <Link className="admin-hub-card" href={item.href} key={item.href}>
            <strong>{item.title}</strong>
            <span>{item.description}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
