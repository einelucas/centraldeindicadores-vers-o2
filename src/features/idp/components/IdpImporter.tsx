"use client";

import { useState } from "react";
import { importIdpFiles } from "@/features/idp/importers";
import { computeIdpResult } from "@/features/idp/calculations";
import { chunk, DEFAULT_IMPORT_BATCH_SIZE } from "@/lib/batching";
import { fmtPct, fmtCurrency } from "@/lib/currency";
import { MetricCard } from "@/components/indicators/MetricCard";
import { ExportButtons } from "@/components/exports/ExportButtons";
import {
  IDP_DEFAULT_TARGET,
  type IdpNormalizedRecord,
} from "@/features/idp/types";

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

export function IdpImporter() {
  const [threshold, setThreshold] = useState(IDP_DEFAULT_TARGET * 100);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [preview, setPreview] = useState<ReturnType<
    typeof computeIdpResult
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
      const { records, perFile } = await importIdpFiles(files);
      const parseError = perFile.find((f) => f.error)?.error;
      if (parseError && records.length === 0) {
        setProgress((p) => (p ? { ...p, done: true, error: parseError } : p));
        setBusy(false);
        return;
      }

      setPreview(computeIdpResult(records, threshold / 100));

      const batches = chunk(records, DEFAULT_IMPORT_BATCH_SIZE);
      setProgress((p) =>
        p ? { ...p, totalFound: records.length, totalBatches: batches.length } : p,
      );

      const startRes = await fetch("/api/importacoes/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: "idp",
          fileName: files[0]?.name ?? "idp",
          totalFound: records.length,
        }),
      });
      if (!startRes.ok) throw new Error("Falha ao iniciar importação");
      const { importJobId } = (await startRes.json()) as { importJobId: string };

      let acc = { inserted: 0, ignored: 0, updated: 0, rejected: 0 };
      for (let i = 0; i < batches.length; i++) {
        const batchRecords = (batches[i] ?? []).map(
          (r: IdpNormalizedRecord) => ({
            unit: r.unit,
            year: r.year,
            month: r.month,
            disciplina: r.disciplina,
            custoLinhaBase: r.custoLinhaBase,
            custoReal: r.custoReal,
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
          <label className="mb-1 block text-sm font-medium" htmlFor="idpFiles">
            Arquivos (Excel/CSV) — vários permitidos
          </label>
          <input
            id="idpFiles"
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            disabled={busy}
            onChange={(e) => onFiles(e.target.files)}
            className="text-sm"
          />
          <p className="mt-1 text-xs text-neutralbrand">
            A unidade/projeto é derivada do nome do arquivo.
          </p>
        </div>
        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="idpThreshold"
          >
            Meta (%)
          </label>
          <input
            id="idpThreshold"
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
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
              fileName="idp-aderencia"
              title="IDP — Aderência de Cronograma por Disciplina"
              subtitle={`Aderência geral ${(preview.aderenciaGeral * 100).toFixed(1)}%`}
              orientation="landscape"
              rows={preview.disciplinas}
              columns={[
                { header: "Disciplina", value: (d) => d.name },
                { header: "Custo linha base", value: (d) => d.custoLinhaBase.toFixed(2) },
                { header: "Custo real", value: (d) => d.custoReal.toFixed(2) },
                { header: "Aderência (%)", value: (d) => (d.aderencia * 100).toFixed(1) },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard
              label="Aderência geral"
              value={fmtPct(preview.aderenciaGeral)}
              sub={`meta ${Math.round(threshold)}%`}
              accent
            />
            <MetricCard
              label="Custo linha de base"
              value={fmtCurrency(preview.totalLinhaBase)}
            />
            <MetricCard
              label="Custo real"
              value={fmtCurrency(preview.totalReal)}
            />
            <MetricCard
              label="Disciplinas"
              value={preview.disciplinas.length.toLocaleString("pt-BR")}
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutralbrand/30 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left">
                <tr>
                  <th className="px-3 py-2">Disciplina</th>
                  <th className="px-3 py-2 text-right">Linha de base</th>
                  <th className="px-3 py-2 text-right">Real</th>
                  <th className="px-3 py-2 text-right">Aderência</th>
                </tr>
              </thead>
              <tbody>
                {preview.disciplinas.map((d) => (
                  <tr key={d.name} className="border-t border-neutralbrand/20">
                    <td className="px-3 py-2">{d.name}</td>
                    <td className="px-3 py-2 text-right">
                      {fmtCurrency(d.custoLinhaBase)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmtCurrency(d.custoReal)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmtPct(d.aderencia)}
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
