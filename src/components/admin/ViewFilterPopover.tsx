"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PeriodRangeFilter } from "./PeriodRangeFilter";
import { formatPeriodRangeLabel, type PeriodRange } from "@/lib/period";

/**
 * Botão "Consulta" — abre o filtro de período livre (De/Até) só pra estreitar
 * o que aparece nas tabelas/gráficos deste painel de administração. Nunca
 * afeta o que será publicado: isso é sempre o período travado ao lado
 * (Ano + Semestre). `undefined` = sem filtro de consulta (segue o período de
 * publicação); `null` = "Tudo"; `PeriodRange` = recorte específico.
 */
export function ViewFilterPopover({
  value,
  onChange,
  yearsInData,
  publishedLabel,
  label = "Consulta",
}: {
  value: PeriodRange | null | undefined;
  onChange: (next: PeriodRange | null | undefined) => void;
  yearsInData?: readonly number[];
  /** Rótulo do período de publicação, mostrado como referência dentro do popover. */
  publishedLabel: string;
  /** Texto do botão/gatilho. Default "Consulta" — outros módulos não precisam passar isto. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = value !== undefined;

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <Button
        type="button"
        variant={active ? "default" : "outline"}
        size="sm"
        onClick={() => setOpen((current) => !current)}
      >
        <Search className="size-3.5" />
        {active ? `${label} · ${formatPeriodRangeLabel(value)}` : label}
      </Button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[420px] rounded-xl border border-border bg-popover p-3 shadow-lg">
          <p className="mb-2.5 text-xs leading-relaxed text-muted-foreground">
            Filtra só o que aparece aqui na Administração — não muda o que será publicado (
            {publishedLabel}).
          </p>
          <PeriodRangeFilter
            value={value ?? null}
            onChange={onChange}
            yearsInData={yearsInData}
            label=""
          />
          {active ? (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="mt-2.5 text-xs font-semibold text-primary hover:underline"
            >
              Voltar a seguir o período de publicação
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
