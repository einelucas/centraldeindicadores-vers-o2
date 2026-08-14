"use client";

import { useState } from "react";
import { LayoutGrid, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToolbarSlotContent } from "./ToolbarSlot";

export function ModuleWorkspace({
  eyebrow,
  title,
  description,
  panel,
  administration,
  panelLabel = "Painel",
}: {
  /** Linha pequena acima do título, ex.: "Planejamento · RDO". */
  eyebrow: string;
  title: string;
  description: string;
  panel: React.ReactNode;
  administration?: React.ReactNode;
  panelLabel?: string;
}) {
  const [active, setActive] = useState<"panel" | "admin">("panel");
  const hasAdministration = administration !== null && administration !== undefined;

  return (
    <section className="module-workspace">
      {/* Botões injetados no container de ícones do TabsNav (ver ToolbarSlot),
          no lugar onde o hub de referência mostra "Importar/Exportar". */}
      <ToolbarSlotContent>
        <button
          type="button"
          onClick={() => setActive("panel")}
          className={cn(
            "flex h-[42px] items-center gap-1.5 rounded-[12px] border px-3.5 text-[15px] font-semibold transition-colors",
            active === "panel"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:text-foreground",
          )}
        >
          <LayoutGrid className="size-4" />
          {panelLabel}
        </button>
        {hasAdministration ? (
          <button
            type="button"
            onClick={() => setActive("admin")}
            className={cn(
              "flex h-[42px] items-center gap-1.5 rounded-[12px] border px-3.5 text-[15px] font-semibold transition-colors",
              active === "admin"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            <Settings2 className="size-4" />
            Administração
          </button>
        ) : null}
      </ToolbarSlotContent>

      {/* Cabeçalho fixo do módulo — igual em todo módulo, independe da aba
          (Painel/Administração) selecionada. Texto solto, sem cartão, igual
          ao hub de automação. */}
      <header className="mx-auto mb-[18px] w-full max-w-[1320px] pt-2.5">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#2e5aac]">
          {eyebrow}
        </p>
        <h1 className="mt-1.5 font-heading text-[34.4px] font-extrabold leading-[1.08] tracking-[0.001em] text-[#20324a]">
          {title}
        </h1>
        <p className="mt-1.5 max-w-4xl text-[15.68px] font-medium leading-6 text-[#6d7c92]">
          {description}
        </p>
      </header>

      <div className={`subtab-content panel-view${active === "panel" ? " active" : ""}`}>
        {panel}
      </div>
      {hasAdministration ? (
        <div className={`subtab-content${active === "admin" ? " active" : ""}`}>
          {administration}
        </div>
      ) : null}
    </section>
  );
}
