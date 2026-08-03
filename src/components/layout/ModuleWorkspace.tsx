"use client";

import { useState } from "react";

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
      <div className="subtab-nav">
        <button
          type="button"
          className={active === "panel" ? "active" : ""}
          onClick={() => setActive("panel")}
        >
          {panelLabel}
        </button>
        {hasAdministration ? (
          <button
            type="button"
            className={active === "admin" ? "active" : ""}
            onClick={() => setActive("admin")}
          >
            Administração
          </button>
        ) : null}
      </div>

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
