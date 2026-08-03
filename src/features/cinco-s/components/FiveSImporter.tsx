"use client";

import { useMemo, useState } from "react";
import { importFiveSFiles } from "@/features/cinco-s/importers";
import { computeFiveSResult } from "@/features/cinco-s/calculations";
import { chunk, DEFAULT_IMPORT_BATCH_SIZE } from "@/lib/batching";
import { fmtPct } from "@/lib/currency";
import { MetricCard } from "@/components/indicators/MetricCard";
import { StatusBadge } from "@/components/indicators/StatusBadge";
import { ExportButtons } from "@/components/exports/ExportButtons";
import { MONTH_NAMES } from "@/lib/dates";
import {
  FIVES_DEFAULT_TARGET,
  FIVES_DEFAULT_EXCLUDED,
  type FiveSNormalizedRecord,
} from "@/features/cinco-s/types";

export function FiveSImporter() {
  const [threshold, setThreshold] = useState(FIVES_DEFAULT_TARGET * 100);
  const [excludeText, setExcludeText] = useState(
    FIVES_DEFAULT_EXCLUDED.join(", "),
  );
  const [records, setRecords] = useState<FiveSNormalizedRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const excluded = useMemo(
    () => excludeText.split(",").map((s) => s.trim()).filter(Boolean),
    [excludeText],
  );

  const preview = useMemo(() => {
    if (!records.length) return null;
    return computeFiveSResult(records, excluded, threshold / 100);
  }, [records, excluded, threshold]);

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const { records: recs, perFile } = await importFiveSFiles(
        Array.from(list),
      );
      const parseError = perFile.find((f) => f.error)?.error;
      if (parseError && recs.length === 0) {
        setError(parseError);
        return;
      }
      setRecords((prev) => [...prev, ...recs]);
    } finally {
      setBusy(false);
    }
  }

  async function persist() {
    if (!records.length) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await fetch("/api/configuracoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "fiveS.excludedUnits",
          value: excluded.map((e) => e.toUpperCase()),
        }),
      });

      const payload = records.map((r) => ({
        unit: r.unit,
        year: r.year,
        month: r.month,
        areas: r.areas,
        raw: r.raw,
      }));

      const startRes = await fetch("/api/importacoes/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: "cinco-s",
          fileName: "cinco-s",
          totalFound: payload.length,
        }),
      });
      if (!startRes.ok) throw new Error("Falha ao iniciar importação");
      const { importJobId } = (await startRes.json()) as {
        importJobId: string;
      };

      const batches = chunk(payload, DEFAULT_IMPORT_BATCH_SIZE);
      for (let i = 0; i < batches.length; i++) {
        const res = await fetch(`/api/importacoes/${importJobId}/lotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchNumber: i + 1, records: batches[i] }),
        });
        if (!res.ok) throw new Error(`Falha no lote ${i + 1}`);
      }
      await fetch(`/api/importacoes/${importJobId}/finalizar`, {
        method: "POST",
      });
      setStatus("Dados importados e indicador recalculado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar");
    } finally {
      setBusy(false);
    }
  }

  // Agrupa a prévia por unidade (último valor) para a tabela.
  const unitsSorted = useMemo(() => {
    if (!preview) return [];
    return [...preview.unitMonths].sort(
      (a, b) => a.unit.localeCompare(b.unit) || a.year - b.year || a.month - b.month,
    );
  }, [preview]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="fsFiles">
            Arquivos (Excel) — uma aba por unidade
          </label>
          <input
            id="fsFiles"
            type="file"
            multiple
            accept=".xlsx,.xls"
            disabled={busy}
            onChange={(e) => onFiles(e.target.files)}
            className="text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="fsMeta">
            Meta (%)
          </label>
          <input
            id="fsMeta"
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-24 rounded border border-neutralbrand/50 px-2 py-1 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium" htmlFor="fsExclude">
            Unidades excluídas do GERAL
          </label>
          <input
            id="fsExclude"
            type="text"
            value={excludeText}
            onChange={(e) => setExcludeText(e.target.value)}
            className="w-full rounded border border-neutralbrand/50 px-2 py-1 text-sm"
          />
        </div>
      </div>

      {records.length > 0 ? (
        <button
          onClick={persist}
          disabled={busy}
          className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          Importar e recalcular
        </button>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {status ? <p className="text-sm text-success">{status}</p> : null}

      {preview ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <ExportButtons
              fileName={`5s-${preview.periodLabel.replace("/", "-")}`}
              title="5S — Aderência por Unidade"
              subtitle={`GERAL ${preview.periodLabel}`}
              rows={unitsSorted}
              columns={[
                { header: "Unidade", value: (u) => u.unit },
                { header: "Mês", value: (u) => `${u.month}/${u.year}` },
                { header: "Aderência (%)", value: (u) => (u.aderencia * 100).toFixed(1) },
                { header: "Excluída", value: (u) => (u.excluded ? "Sim" : "Não") },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <MetricCard
              label={`GERAL (${preview.periodLabel})`}
              value={preview.geral !== null ? fmtPct(preview.geral) : "—"}
              sub={preview.passaMeta ? "Dentro da meta" : "Fora da meta"}
              accent={!preview.passaMeta}
            />
            <MetricCard
              label="Unidades"
              value={preview.unitsCount.toLocaleString("pt-BR")}
            />
            <MetricCard
              label="Meses"
              value={preview.monthsCount.toLocaleString("pt-BR")}
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutralbrand/30 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left">
                <tr>
                  <th className="px-3 py-2">Unidade</th>
                  <th className="px-3 py-2">Mês</th>
                  <th className="px-3 py-2 text-right">Aderência</th>
                  <th className="px-3 py-2">Situação</th>
                </tr>
              </thead>
              <tbody>
                {unitsSorted.map((u) => (
                  <tr
                    key={u.unit + u.year + u.month}
                    className="border-t border-neutralbrand/20"
                  >
                    <td className="px-3 py-2">
                      {u.unit}
                      {u.excluded ? (
                        <span className="ml-1 text-xs text-neutralbrand">
                          (excluída)
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {MONTH_NAMES[u.month - 1]}/{u.year}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmtPct(u.aderencia)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge ok={u.aderencia >= threshold / 100}>
                        {u.aderencia >= threshold / 100 ? "OK" : "Abaixo"}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
