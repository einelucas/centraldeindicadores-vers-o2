"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chunk, DEFAULT_IMPORT_BATCH_SIZE } from "@/lib/batching";
import { MONTH_NAMES_FULL } from "@/lib/dates";
import { importRdoFiles, type RdoFileParseResult } from "@/features/rdo/importers";
import { exportRdoPdf } from "@/features/rdo/exports/pdf";
import type { RdoNormalizedRecord, RdoResult } from "@/features/rdo/types";

interface ApiResponse {
  total: number;
  threshold: number;
  result: RdoResult;
  detalheLimitado: boolean;
  lastImport: null | {
    id: string;
    fileName: string;
    completedAt: string | null;
    totalFound: number;
    totalInserted: number;
    totalUpdated: number;
    totalIgnored: number;
    totalRejected: number;
  };
}

interface Progress {
  totalFound: number;
  currentBatch: number;
  totalBatches: number;
  inserted: number;
  ignored: number;
  updated: number;
  rejected: number;
}

interface PublicationSummary {
  publishedAt: string;
  publishedBy: { name: string };
  version: number;
}

export function RdoView({ canPublish, canClear }: { canPublish: boolean; canClear: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [threshold, setThreshold] = useState(80);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [files, setFiles] = useState<RdoFileParseResult[]>([]);
  const [duplicates, setDuplicates] = useState(0);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [publication, setPublication] = useState<PublicationSummary | null>(null);
  const [unitFilter, setUnitFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");

  const load = useCallback(async (nextThreshold = threshold) => {
    setError(null);
    const response = await fetch(`/api/rdo?threshold=${encodeURIComponent(nextThreshold)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Falha ao carregar os dados do RDO.");
    setData((await response.json()) as ApiResponse);
  }, [threshold]);

  const loadPublication = useCallback(async () => {
    const response = await fetch("/api/publicacoes/rdo", { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as { publication: PublicationSummary | null };
    setPublication(body.publication);
  }, []);

  useEffect(() => {
    void Promise.all([load().catch((err: Error) => setError(err.message)), loadPublication()]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function processFiles(fileList: FileList | File[]) {
    const selected = Array.from(fileList);
    if (!selected.length) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setProgress(null);

    try {
      const parsed = await importRdoFiles(selected);
      setFiles(parsed.perFile);
      setDuplicates(parsed.duplicates);

      const valid = parsed.records;
      if (!valid.length) {
        throw new Error(parsed.perFile.find((file) => file.error)?.error ?? "Nenhum registro válido encontrado.");
      }

      const batches = chunk(valid, DEFAULT_IMPORT_BATCH_SIZE);
      setProgress({
        totalFound: valid.length,
        currentBatch: 0,
        totalBatches: batches.length,
        inserted: 0,
        ignored: 0,
        updated: 0,
        rejected: 0,
      });

      const start = await fetch("/api/importacoes/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: "rdo",
          fileName: selected.map((file) => file.name).join(", "),
          totalFound: valid.length,
        }),
      });
      if (!start.ok) throw new Error("Falha ao iniciar a importação no servidor.");
      const { importJobId } = (await start.json()) as { importJobId: string };

      let totals = { inserted: 0, ignored: 0, updated: 0, rejected: 0 };
      for (let index = 0; index < batches.length; index++) {
        const records = (batches[index] ?? []).map((record: RdoNormalizedRecord) => ({
          dataReferencia: record.dataReferencia.toISOString(),
          empresaNome: record.empresaNome,
          statusDescricao: record.statusDescricao,
          relatorioId: record.relatorioId,
          grupo: record.grupo,
          disciplina: record.disciplina,
          year: record.year,
          month: record.month,
          raw: record.raw,
        }));
        const response = await fetch(`/api/importacoes/${importJobId}/lotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchNumber: index + 1, records }),
        });
        if (!response.ok) throw new Error(`Falha ao processar o lote ${index + 1}.`);
        const current = (await response.json()) as typeof totals;
        totals = {
          inserted: totals.inserted + current.inserted,
          ignored: totals.ignored + current.ignored,
          updated: totals.updated + current.updated,
          rejected: totals.rejected + current.rejected,
        };
        setProgress({ totalFound: valid.length, currentBatch: index + 1, totalBatches: batches.length, ...totals });
      }

      const finish = await fetch(`/api/importacoes/${importJobId}/finalizar`, { method: "POST" });
      if (!finish.ok) throw new Error("Os lotes foram enviados, mas a finalização falhou.");

      setMessage(`Importação concluída: ${totals.inserted} inserido(s), ${totals.updated} atualizado(s), ${totals.ignored} ignorado(s).`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na importação.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function publish() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/publicacoes/rdo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; publication?: PublicationSummary };
      if (!response.ok) throw new Error(body.error ?? "Falha ao publicar o RDO.");
      if (body.publication) setPublication(body.publication);
      setMessage("RDO publicado no painel com sucesso.");
      window.dispatchEvent(new Event("rdo:published"));
      window.dispatchEvent(new Event("indicator:published"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao publicar.");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!window.confirm("Excluir todos os registros administrativos de RDO? O painel já publicado continuará preservado.")) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rdo/registros", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; deleted?: number };
      if (!response.ok) throw new Error(body.error ?? "Falha ao limpar os registros.");
      setMessage(`${body.deleted ?? 0} registro(s) removido(s).`);
      setFiles([]);
      setDuplicates(0);
      setProgress(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao limpar os registros.");
    } finally {
      setBusy(false);
    }
  }

  const result = data?.result;
  const pct = progress?.totalBatches ? Math.round((progress.currentBatch / progress.totalBatches) * 100) : 0;
  const filteredUnits = useMemo(() => {
    if (!result) return [];
    return unitFilter === "all"
      ? result.units
      : result.units.filter((unit) => unit.name === unitFilter);
  }, [result, unitFilter]);
  const filteredUnitAverage = useMemo(() => {
    if (!filteredUnits.length) return 0;
    return filteredUnits.reduce((sum, unit) => sum + unit.aderencia, 0) / filteredUnits.length;
  }, [filteredUnits]);
  const availableYears = useMemo(() => {
    if (!result) return [];
    return Array.from(new Set(result.months.map((month) => month.year))).sort((a, b) => b - a);
  }, [result]);
  const availableMonths = useMemo(() => {
    if (!result) return [];
    return Array.from(new Set(result.months.map((month) => month.month))).sort((a, b) => a - b);
  }, [result]);
  const filteredMonths = useMemo(() => {
    if (!result) return [];
    return result.months.filter((month) => {
      const matchesYear = yearFilter === "all" || month.year === Number(yearFilter);
      const matchesMonth = monthFilter === "all" || month.month === Number(monthFilter);
      return matchesYear && matchesMonth;
    });
  }, [monthFilter, result, yearFilter]);

  useEffect(() => {
    if (!result) return;
    if (unitFilter !== "all" && !result.units.some((unit) => unit.name === unitFilter)) {
      setUnitFilter("all");
    }
    if (yearFilter !== "all" && !result.months.some((month) => month.year === Number(yearFilter))) {
      setYearFilter("all");
    }
    if (monthFilter !== "all" && !result.months.some((month) => month.month === Number(monthFilter))) {
      setMonthFilter("all");
    }
  }, [monthFilter, result, unitFilter, yearFilter]);

  return (
    <>
      <div
        className={`upload-zone${dragging ? " drag" : ""}`}
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!busy) void processFiles(event.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !busy) inputRef.current?.click(); }}
      >
        <div className="icon">↑</div>
        <h4>Arraste os arquivos de RDOs aqui, ou clique para escolher</h4>
        <p>Pode soltar vários arquivos de uma vez (uma unidade por arquivo, ou exportações de períodos diferentes). Aceita .xlsx ou .csv com as colunas: data, status_descricao, empresa_nome.</p>
        <input ref={inputRef} type="file" multiple accept=".xlsx,.xls,.csv" onChange={(event) => event.target.files && void processFiles(event.target.files)} />
      </div>

      {busy && progress ? <div className="progress-item"><span className="spinner" /> Processando lote {progress.currentBatch}/{progress.totalBatches} — {pct}%</div> : null}

      {files.length ? (
        <div className="file-list">
          {files.map((file) => (
            <span className={`file-pill${file.error ? " error" : ""}`} key={`${file.fileName}-${file.count}`}>
              {file.fileName} · {file.error ? `erro: ${file.error}` : `${file.count.toLocaleString("pt-BR")} linhas`}
            </span>
          ))}
        </div>
      ) : null}

      {error ? <div className="error-box">{error}</div> : null}
      {message ? <div className="info-box">{message}</div> : null}

      {result && data.total > 0 ? (
        <div>
          <div className="controls-row">
            <label htmlFor="rdoThreshold">Meta de aderência (%)</label>
            <input id="rdoThreshold" type="number" min={0} max={100} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
            <button className="btn secondary" type="button" disabled={busy} onClick={() => void load(threshold).catch((err: Error) => setError(err.message))}>Recalcular</button>
            <button className="btn" type="button" onClick={() => exportRdoPdf(result, threshold)}>Baixar PDF</button>
            {canClear ? <button className="btn secondary" type="button" disabled={busy} onClick={() => void clearAll()}>Limpar tudo</button> : null}
            {canPublish ? <button className="btn" style={{ background: "var(--verde)" }} type="button" disabled={busy} onClick={() => void publish()}>Publicar no Painel</button> : null}
          </div>

          {duplicates > 0 ? <div className="info-box">{duplicates.toLocaleString("pt-BR")} linha(s) idêntica(s) repetida(s) entre os arquivos — contadas uma única vez.</div> : null}
          {publication ? <div className="rdo-publish-status">Publicado em {new Date(publication.publishedAt).toLocaleString("pt-BR")} por {publication.publishedBy.name} · versão {publication.version}</div> : null}

          <div className="cards">
            <div className="card"><div className="lbl">Total emitidos</div><div className="val">{result.totalEmitidos.toLocaleString("pt-BR")}</div></div>
            <div className="card accent"><div className="lbl">Aprovados</div><div className="val">{formatPct(result.totalEmitidos ? result.totalAprovados / result.totalEmitidos : 0)}</div><div className="sub">{result.totalAprovados.toLocaleString("pt-BR")} relatórios</div></div>
            <div className="card"><div className="lbl">A revisar</div><div className="val">{formatPct(result.totalEmitidos ? result.totalRevisar / result.totalEmitidos : 0)}</div><div className="sub">{result.totalRevisar.toLocaleString("pt-BR")} relatórios</div></div>
            <div className="card"><div className="lbl">Preenchendo</div><div className="val">{formatPct(result.totalEmitidos ? result.totalPreenchendo / result.totalEmitidos : 0)}</div><div className="sub">{result.totalPreenchendo.toLocaleString("pt-BR")} relatórios</div></div>
          </div>

          <div className="rdo-tables-stack">
            <section className="rdo-section-card">
              <div className="rdo-section-header">
                <div className="subtitle-block first">
                  <h3>Aderência por unidade</h3>
                  <p>Nº RDO emitidos x aprovados, por obra/unidade.</p>
                </div>
                <div className="rdo-section-filters">
                  <label htmlFor="rdoUnitFilter">
                    <span>Unidade</span>
                    <select id="rdoUnitFilter" value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)}>
                      <option value="all">Todas as unidades</option>
                      {result.units.map((unit) => <option value={unit.name} key={unit.name}>{unit.name}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              <div className="table-scroll rdo-summary-table-wrap">
                <table className="data rdo-summary-table">
                  <thead><tr><th>Unidade</th><th>Emitidos</th><th>Aprovados</th><th>Aderência</th><th>Situação</th></tr></thead>
                  <tbody>
                    {filteredUnits.length ? filteredUnits.map((unit) => {
                      const ok = unit.aderencia >= threshold / 100;
                      return (
                        <tr key={unit.name}>
                          <td>{unit.name}</td>
                          <td className="num">{unit.emitidos.toLocaleString("pt-BR")}</td>
                          <td className="num">{unit.aprovados.toLocaleString("pt-BR")}</td>
                          <td className="num">{formatPct(unit.aderencia)}</td>
                          <td><span className={`badge ${ok ? "ok" : "fail"}`}>{ok ? "Dentro da meta" : "Abaixo da meta"}</span></td>
                        </tr>
                      );
                    }) : <tr><td className="rdo-empty-row" colSpan={5}>Nenhuma unidade encontrada para o filtro selecionado.</td></tr>}
                    {filteredUnits.length ? (
                      <tr className="total">
                        <td>{unitFilter === "all" ? "Média das unidades" : "Unidade selecionada"}</td>
                        <td /><td /><td className="num">{formatPct(filteredUnitAverage)}</td><td />
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rdo-section-card">
              <div className="rdo-section-header">
                <div className="subtitle-block first">
                  <h3>Aderência por mês</h3>
                  <p>Consolidado mensal de todas as unidades.</p>
                </div>
                <div className="rdo-section-filters rdo-month-filters">
                  <label htmlFor="rdoMonthFilter">
                    <span>Mês</span>
                    <select id="rdoMonthFilter" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}>
                      <option value="all">Todos os meses</option>
                      {availableMonths.map((month) => (
                        <option value={month} key={month}>{MONTH_NAMES_FULL[month] ?? `Mês ${month + 1}`}</option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor="rdoYearFilter">
                    <span>Ano</span>
                    <select id="rdoYearFilter" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
                      <option value="all">Todos os anos</option>
                      {availableYears.map((year) => <option value={year} key={year}>{year}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              <div className="table-scroll rdo-summary-table-wrap">
                <table className="data rdo-summary-table">
                  <thead><tr><th>Mês</th><th>Emitidos</th><th>Aprovados</th><th>Aderência</th><th>Situação</th></tr></thead>
                  <tbody>
                    {filteredMonths.length ? filteredMonths.map((month) => {
                      const ok = month.aderencia >= threshold / 100;
                      return (
                        <tr key={`${month.year}-${month.month}`}>
                          <td>{month.label}</td>
                          <td className="num">{month.emitidos.toLocaleString("pt-BR")}</td>
                          <td className="num">{month.aprovados.toLocaleString("pt-BR")}</td>
                          <td className="num">{formatPct(month.aderencia)}</td>
                          <td><span className={`badge ${ok ? "ok" : "fail"}`}>{ok ? "Dentro da meta" : "Abaixo da meta"}</span></td>
                        </tr>
                      );
                    }) : <tr><td className="rdo-empty-row" colSpan={5}>Nenhum mês encontrado para os filtros selecionados.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      ) : (
        <div className="placeholder rdo-admin-empty"><span className="tag">Aguardando dados</span><h3>RDO</h3><p>Importe um ou mais arquivos para calcular a aprovação por unidade e por mês.</p></div>
      )}
    </>
  );
}

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
