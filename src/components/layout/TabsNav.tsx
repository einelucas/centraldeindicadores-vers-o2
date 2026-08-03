"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { id: string; label: string; href: string };

/** Ordem oficial dos módulos ativos no ciclo de 2026. */
export const TABS: Tab[] = [
  { id: "2026", label: "2026", href: "/dashboard/scorecard" },
  { id: "rdo", label: "RDO", href: "/dashboard/rdo" },
  { id: "idp-disciplinas", label: "IDP - Disciplinas", href: "/dashboard/idp" },
  { id: "rnc", label: "RNC", href: "/dashboard/rnc" },
  { id: "5s", label: "5S", href: "/dashboard/cinco-s" },
  {
    id: "taxa-acidentes",
    label: "Taxa de Acidentes",
    href: "/dashboard/taxa-acidentes",
  },
];

export function TabsNav() {
  const pathname = usePathname();

  return (
    <nav className="tabs" id="tabsNav" aria-label="Indicadores">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link key={tab.id} href={tab.href} className={active ? "active" : ""}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
