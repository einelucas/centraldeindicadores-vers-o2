"use client";

import { useState } from "react";
import { importRdoFiles } from "@/features/rdo/importers";
import { computeRdoResult } from "@/features/rdo/calculations";
import { chunk, DEFAULT_IMPORT_BATCH_SIZE } from "@/lib/batching";
import { fmtPct } from "@/lib/currency";
import { MetricCard } from "@/components/indicators/MetricCard";
import { StatusBadge } from "@/components/indicators/StatusBadge";
import { ExportButtons } from "@/components/exports/ExportButtons";
import { RDO_DEFAULT_TARGET, type RdoNormalizedRecord } from "@/features/rdo/types";

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

export function RdoImporter() {
  const [threshold, setThreshold] = useState(RDO_DEFAULT_TARGET * 100);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [preview, setPreview] = useState<ReturnType<typeof computeRdoResult> | null>(null);
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
      // 1. Processa no navegador
      const { records, perFile } = await importRdoFiles(files);
      const parseError = perFile.find((f) => f.error)?.error;
      if (parseError && records.length === 0) {
        setProgress((p) => (p ? { ...p, done: true, error: parseError } : p));
        setBusy(false);
        return;
      }

      // Prévia local (não substitui o cálculo do servidor)
      setPreview(computeRdoResult(records, threshold / 100));

      const batches = chunk(records, DEFAULT_IMPORT_BATCH_SIZE);
      setProgress((p) =>
        p ? { ...p, totalFound: records.length, totalBatches: batches.length } : p,
      );

      // 2. Inicia job
      const startRes = await fetch("/api/importacoes/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: "rdo",
          fileName: files[0]?.name ?? "rdo",
          totalFound: records.length,
        }),
      });
      if (!startRes.ok) throw new Error("Falha ao iniciar importação");
      const { importJobId } = (await startRes.json()) as { importJobId: string };

      // 3. Envia lotes
      let acc = { inserted: 0, ignored: 0, updated: 0, rejected: 0 };
      for (let i = 0; i < batches.length; i++) {
        const batchRecords = (batches[i] ?? []).map((r: RdoNormalizedRecord) => ({
          dataReferencia: r.dataReferencia.toISOString(),
          empresaNome: r.empresaNome,
          statusDescricao: r.statusDescricao,
          relatorioId: r.relatorioId,
          grupo: r.grupo,
          disciplina: r.disciplina,
          year: r.year,
          month: r.month,
          raw: r.raw,
        }));
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

      // 4. Finaliza (recalcula indicadores)
      await fetch(`/api/importacoes/${importJobId}/finalizar`, { method: "POST" });
      setProgress((p) => (p ? { ...p, done: true } : p));
    } catch (err) {
      setProgress((p) =>
        p ? { ...p, done: true, error: err instanceof Error ? err.message : "Erro" } : p,
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
          <label className="mb-1 block text-sm font-medium" htmlFor="rdoFiles">
            Arquivos (Excel/CSV) — vários permitidos
          </label>
          <input
            id="rdoFiles"
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            disabled={busy}
            onChange={(e) => onFiles(e.target.files)}
            className="text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="rdoThreshold">
            Meta (%)
          </label>
          <input
            id="rdoThreshold"
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
            {progress.totalFound.toLocaleString("pt-BR")} registros ·{" "}
            lote {progress.currentBatch}/{progress.totalBatches} ({pct}%)
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-canvas">
            <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <span>Inseridos: <b>{progress.inserted}</b></span>
            <span>Ignorados: <b>{progress.ignored}</b></span>
            <span>Atualizados: <b>{progress.updated}</b></span>
            <span>Rejeitados: <b>{progress.rejected}</b></span>
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
              fileName="rdo-aprovacao"
              title="RDO — Aprovação por Unidade"
              subtitle={`Aderência média ${(preview.unitAvg * 100).toFixed(1)}%`}
              rows={preview.units}
              columns={[
                { header: "Unidade", value: (u) => u.name },
                { header: "Emitidos", value: (u) => u.emitidos },
                { header: "Aprovados", value: (u) => u.aprovados },
                { header: "Aderência (%)", value: (u) => (u.aderencia * 100).toFixed(1) },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard label="Total emitidos" value={preview.totalEmitidos.toLocaleString("pt-BR")} />
            <MetricCard
              label="Aprovados"
              value={fmtPct(preview.totalEmitidos ? preview.totalAprovados / preview.totalEmitidos : null)}
              sub={`${preview.totalAprovados.toLocaleString("pt-BR")} relatórios`}
              accent
            />
            <MetricCard label="Revisar" value={preview.totalRevisar.toLocaleString("pt-BR")} />
            <MetricCard label="Preenchendo" value={preview.totalPreenchendo.toLocaleString("pt-BR")} />
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutralbrand/30 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left">
                <tr>
                  <th className="px-3 py-2">Unidade</th>
                  <th className="px-3 py-2 text-right">Emitidos</th>
                  <th className="px-3 py-2 text-right">Aprovados</th>
                  <th className="px-3 py-2 text-right">Aderência</th>
                  <th className="px-3 py-2">Situação</th>
                </tr>
              </thead>
              <tbody>
                {preview.units.map((u) => {
                  const pass = u.aderencia >= threshold / 100;
                  return (
                    <tr key={u.name} className="border-t border-neutralbrand/20">
                      <td className="px-3 py-2">{u.name}</td>
                      <td className="px-3 py-2 text-right">{u.emitidos}</td>
                      <td className="px-3 py-2 text-right">{u.aprovados}</td>
                      <td className="px-3 py-2 text-right">{fmtPct(u.aderencia)}</td>
                      <td className="px-3 py-2">
                        <StatusBadge ok={pass}>
                          {pass ? "Dentro da meta" : "Abaixo da meta"}
                        </StatusBadge>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-neutralbrand/40 font-semibold">
                  <td className="px-3 py-2">Média</td>
                  <td /><td />
                  <td className="px-3 py-2 text-right">{fmtPct(preview.unitAvg)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
