"use client";

import { useState } from "react";
import { importRncFiles } from "@/features/rnc/importers";
import { computeRncResult } from "@/features/rnc/calculations";
import { chunk, DEFAULT_IMPORT_BATCH_SIZE } from "@/lib/batching";
import { fmtPct } from "@/lib/currency";
import { MetricCard } from "@/components/indicators/MetricCard";
import { ExportButtons } from "@/components/exports/ExportButtons";
import { StatusBadge } from "@/components/indicators/StatusBadge";
import {
  RNC_DEFAULT_MAX_DIAS,
  type RncNormalizedRecord,
} from "@/features/rnc/types";

interface Progress {
  fileName: string;
  totalFound: number;
  currentBatch: number;
  totalBatches: number;
  inserted: number;
  ignored: number;
  updated: number;
  rejected: number;
  done: boolean;
  error?: string;
}

export function RncImporter() {
  const [metaDias, setMetaDias] = useState(RNC_DEFAULT_MAX_DIAS);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [preview, setPreview] = useState<ReturnType<
    typeof computeRncResult
  > | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setBusy(true);
    setPreview(null);
    setProgress({
      fileName: files.map((f) => f.name).join(", "),
      totalFound: 0,
      currentBatch: 0,
      totalBatches: 0,
      inserted: 0,
      ignored: 0,
      updated: 0,
      rejected: 0,
      done: false,
    });

    try {
      const { records, perFile } = await importRncFiles(files);
      const parseError = perFile.find((f) => f.error)?.error;
      if (parseError && records.length === 0) {
        setProgress((p) => (p ? { ...p, done: true, error: parseError } : p));
        setBusy(false);
        return;
      }

      setPreview(computeRncResult(records, metaDias));

      const batches = chunk(records, DEFAULT_IMPORT_BATCH_SIZE);
      setProgress((p) =>
        p ? { ...p, totalFound: records.length, totalBatches: batches.length } : p,
      );

      const startRes = await fetch("/api/importacoes/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: "rnc",
          fileName: files[0]?.name ?? "rnc",
          totalFound: records.length,
        }),
      });
      if (!startRes.ok) throw new Error("Falha ao iniciar importação");
      const { importJobId } = (await startRes.json()) as { importJobId: string };

      let acc = { inserted: 0, ignored: 0, updated: 0, rejected: 0 };
      for (let i = 0; i < batches.length; i++) {
        const batchRecords = (batches[i] ?? []).map(
          (r: RncNormalizedRecord) => ({
            statusRnc: r.statusRnc,
            unidade: r.unidade,
            dataCriacao: r.dataCriacao.toISOString(),
            dataSolucao: r.dataSolucao ? r.dataSolucao.toISOString() : null,
            tempoTratativa: r.tempoTratativa,
            ofensor: r.ofensor,
            year: r.year,
            month: r.month,
            raw: r.raw,
          }),
        );
        const res = await fetch(`/api/importacoes/${importJobId}/lotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchNumber: i + 1, records: batchRecords }),
        });
        if (!res.ok) throw new Error(`Falha no lote ${i + 1}`);
        const out = (await res.json()) as typeof acc;
        acc = {
          inserted: acc.inserted + out.inserted,
          ignored: acc.ignored + out.ignored,
          updated: acc.updated + out.updated,
          rejected: acc.rejected + out.rejected,
        };
        setProgress((p) => (p ? { ...p, currentBatch: i + 1, ...acc } : p));
      }

      await fetch(`/api/importacoes/${importJobId}/finalizar`, {
        method: "POST",
      });
      setProgress((p) => (p ? { ...p, done: true } : p));
    } catch (err) {
      setProgress((p) =>
        p
          ? { ...p, done: true, error: err instanceof Error ? err.message : "Erro" }
          : p,
      );
    } finally {
      setBusy(false);
    }
  }

  const pct = progress?.totalBatches
    ? Math.round((progress.currentBatch / progress.totalBatches) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="rncFiles">
            Arquivos (Excel/CSV) — vários permitidos
          </label>
          <input
            id="rncFiles"
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            disabled={busy}
            onChange={(e) => onFiles(e.target.files)}
            className="text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="rncMeta">
            Meta (dias)
          </label>
          <input
            id="rncMeta"
            type="number"
            value={metaDias}
            onChange={(e) => setMetaDias(Number(e.target.value))}
            className="w-24 rounded border border-neutralbrand/50 px-2 py-1 text-sm"
          />
        </div>
      </div>

      {progress ? (
        <div className="rounded-lg border border-neutralbrand/30 bg-white p-4 text-sm">
          <div className="font-medium text-brand-dark">{progress.fileName}</div>
          <div className="mt-1 text-neutralbrand">
            {progress.totalFound.toLocaleString("pt-BR")} registros · lote{" "}
            {progress.currentBatch}/{progress.totalBatches} ({pct}%)
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-canvas">
            <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <span>
              Inseridos: <b>{progress.inserted}</b>
            </span>
            <span>
              Ignorados: <b>{progress.ignored}</b>
            </span>
            <span>
              Atualizados: <b>{progress.updated}</b>
            </span>
            <span>
              Rejeitados: <b>{progress.rejected}</b>
            </span>
          </div>
          {progress.error ? (
            <p className="mt-2 text-danger">{progress.error}</p>
          ) : progress.done ? (
            <p className="mt-2 text-success">Importação concluída.</p>
          ) : null}
        </div>
      ) : null}

      {preview ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <ExportButtons
              fileName="rnc-tratativa"
              title="RNC — Dias de Tratativa por Mês"
              subtitle={`Meta ${preview.metaDias} dias`}
              rows={preview.months}
              columns={[
                { header: "Mês", value: (m) => m.label },
                { header: "Chamados", value: (m) => m.chamados },
                { header: "Solucionados", value: (m) => m.solucionados },
                {
                  header: "Dias médios",
                  value: (m) => (m.diasMedios === null ? "" : m.diasMedios.toFixed(1)),
                },
                {
                  header: "Situação",
                  value: (m) =>
                    m.dentroMeta === null
                      ? "Sem tratativa"
                      : m.dentroMeta
                        ? "Dentro"
                        : "Fora",
                },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard
              label="RNC criadas"
              value={preview.totalCriadas.toLocaleString("pt-BR")}
            />
            <MetricCard
              label="Tratadas"
              value={preview.totalTratadas.toLocaleString("pt-BR")}
              sub={fmtPct(preview.aderenciaTotal)}
            />
            <MetricCard
              label="Meta"
              value={`${preview.metaDias} dias`}
            />
            <MetricCard
              label="Ofensores distintos"
              value={preview.ofensores.length.toLocaleString("pt-BR")}
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutralbrand/30 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left">
                <tr>
                  <th className="px-3 py-2">Mês (criação)</th>
                  <th className="px-3 py-2 text-right">Elaboradas</th>
                  <th className="px-3 py-2 text-right">Tratadas</th>
                  <th className="px-3 py-2 text-right">Dias resolução</th>
                  <th className="px-3 py-2">Situação</th>
                </tr>
              </thead>
              <tbody>
                {preview.months.map((m) => (
                  <tr key={m.label} className="border-t border-neutralbrand/20">
                    <td className="px-3 py-2">{m.label}</td>
                    <td className="px-3 py-2 text-right">{m.chamados}</td>
                    <td className="px-3 py-2 text-right">{m.solucionados}</td>
                    <td className="px-3 py-2 text-right">
                      {m.diasMedios === null
                        ? "—"
                        : m.diasMedios.toFixed(1).replace(".", ",")}
                    </td>
                    <td className="px-3 py-2">
                      {m.dentroMeta === null ? (
                        <span className="text-neutralbrand">Sem tratativa</span>
                      ) : (
                        <StatusBadge ok={m.dentroMeta}>
                          {m.dentroMeta ? "Dentro da meta" : "Fora da meta"}
                        </StatusBadge>
                      )}
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
