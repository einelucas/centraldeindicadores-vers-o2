"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  CalendarCheck,
  ChartColumn,
  HardHat,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ToolbarSlotOutlet } from "./ToolbarSlot";

type Tab = {
  id: string;
  label: string;
  contextLabel: string;
  href: string;
  icon: LucideIcon;
};

/** Ordem oficial dos módulos ativos no ciclo de 2026. */
export const TABS: Tab[] = [
  {
    id: "2026",
    label: "Scorecard",
    contextLabel: "Resumo Geral",
    href: "/dashboard/scorecard",
    icon: LayoutDashboard,
  },
  {
    id: "rdo",
    label: "RDO",
    contextLabel: "Aprovação RDO",
    href: "/dashboard/rdo",
    icon: ChartColumn,
  },
  {
    id: "idp-disciplinas",
    label: "IDP - Disciplinas",
    contextLabel: "IDP - Disciplinas",
    href: "/dashboard/idp",
    icon: CalendarCheck,
  },
  {
    id: "rnc",
    label: "RNC",
    contextLabel: "RNC",
    href: "/dashboard/rnc",
    icon: AlertTriangle,
  },
  {
    id: "5s",
    label: "5S",
    contextLabel: "5S",
    href: "/dashboard/cinco-s",
    icon: ListChecks,
  },
  {
    id: "taxa-acidentes",
    label: "Taxa de Acidentes",
    contextLabel: "Taxa de Acidentes",
    href: "/dashboard/taxa-acidentes",
    icon: HardHat,
  },
];

export function TabsNav() {
  const pathname = usePathname();

  return (
    <div className="app-toolbar-shell pt-2.5">
      <nav
        className="flex items-center gap-2 rounded-[18px] border border-[#e7ecf3] bg-background px-4 py-3 shadow-[0_10px_30px_rgba(39,69,120,0.08)]"
        id="tabsNav"
        aria-label="Indicadores"
      >
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <div key={tab.id} className="group relative">
              <Link
                href={tab.href}
                aria-label={tab.label}
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-transparent text-muted-foreground transition-colors",
                  active
                    ? "border-[#d8e5ff] bg-[#edf3ff] text-[#21427d]"
                    : "hover:border-border hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="size-5" strokeWidth={2} />
              </Link>

              {/* Tooltip com o nome da aba, igual ao hub de automação. */}
              <span
                role="tooltip"
                className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 scale-90 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-semibold text-background opacity-0 shadow-lg transition-all duration-150 ease-out group-hover:scale-100 group-hover:opacity-100"
              >
                <span
                  aria-hidden
                  className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-foreground"
                />
                {tab.label}
              </span>
            </div>
          );
        })}

        <ToolbarSlotOutlet className="ml-auto flex items-center gap-2" />
      </nav>
    </div>
  );
}
