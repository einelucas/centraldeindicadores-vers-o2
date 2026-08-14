"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  CalendarCheck,
  ClipboardList,
  HardHat,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ToolbarSlotOutlet } from "./ToolbarSlot";

type Tab = { id: string; label: string; href: string; icon: LucideIcon };

/** Ordem oficial dos módulos ativos no ciclo de 2026. */
export const TABS: Tab[] = [
  { id: "2026", label: "Scorecard", href: "/dashboard/scorecard", icon: LayoutDashboard },
  { id: "rdo", label: "RDO", href: "/dashboard/rdo", icon: ClipboardList },
  {
    id: "idp-disciplinas",
    label: "IDP - Disciplinas",
    href: "/dashboard/idp",
    icon: CalendarCheck,
  },
  { id: "rnc", label: "RNC", href: "/dashboard/rnc", icon: AlertTriangle },
  { id: "5s", label: "5S", href: "/dashboard/cinco-s", icon: ListChecks },
  {
    id: "taxa-acidentes",
    label: "Taxa de Acidentes",
    href: "/dashboard/taxa-acidentes",
    icon: HardHat,
  },
];

export function TabsNav() {
  const pathname = usePathname();

  return (
    <div className="app-toolbar-shell pt-2.5">
      <nav
        className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-3 shadow-sm"
        id="tabsNav"
        aria-label="Indicadores"
      >
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-label={tab.label}
              title={tab.label}
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                active &&
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
              )}
            >
              <Icon className="size-5" strokeWidth={2} />
            </Link>
          );
        })}

        <ToolbarSlotOutlet className="ml-auto flex items-center gap-2" />
      </nav>
    </div>
  );
}
