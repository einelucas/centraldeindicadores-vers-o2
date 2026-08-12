"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ToolbarSlotContent } from "./ToolbarSlot";

export function ModuleWorkspace({
  panel,
  administration,
  panelLabel = "Painel",
}: {
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
            "rounded-lg border px-3.5 py-1.5 text-xs font-bold transition-colors",
            active === "panel"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:text-foreground",
          )}
        >
          {panelLabel}
        </button>
        {hasAdministration ? (
          <button
            type="button"
            onClick={() => setActive("admin")}
            className={cn(
              "rounded-lg border px-3.5 py-1.5 text-xs font-bold transition-colors",
              active === "admin"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            Administração
          </button>
        ) : null}
      </ToolbarSlotContent>

      <div
        className={`subtab-content panel-view${active === "panel" ? " active" : ""}`}
      >
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
