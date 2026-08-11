"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { chunk, DEFAULT_IMPORT_BATCH_SIZE } from "@/lib/batching";
import { fmtPct } from "@/lib/currency";
import { MONTH_NAMES_FULL } from "@/lib/dates";
import { parseIdpFile } from "@/features/idp/importers";
import { exportIdpPdf } from "@/features/idp/exports/pdf";
import type { IdpDetailedResult, IdpNormalizedRecord } from "@/features/idp/types";

interface DocumentRow {
  id: string;
  unit: string;
  detectedUnit: string | null;
  unitAdjusted: boolean;
  rsoNumero: number;
  detectedRsoNumero: number | null;
  rsoAdjusted: boolean;
  referenceYear: number;
  referenceMonth: number;
  detectedReferenceYear: number | null;
  detectedReferenceMonth: number | null;
  referenceSource: string;
  referenceOriginalText: string | null;
  referenceAdjusted: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  emissionDate: string | null;
  fileName: string;
  areas: number;
  active: boolean;
  sameCompetence: boolean;
  createdAt: string;
  updatedAt: string;
  firstImportedBy: string | null;
  lastUpdatedBy: string | null;
}

interface ApiResponse {
  total: number;
  activeTotal: number;
  threshold: number;
  years: number[];
  selectedYear: number;
  selectedMonth: number;
  historyMonthStart: number;
  historyMonthEnd: number;
  excludedDisciplines: string[];
  result: IdpDetailedResult;
  setupRequired?: boolean;
  documents: DocumentRow[];
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

interface PendingFile {
  id: string;
  fileName: string;
  record: IdpNormalizedRecord | null;
  error: string | null;
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

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? fallback);
}

function accumulated(value: number): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function competenceLabel(year: number, month: number): string {
  return `${MONTH_NAMES_FULL[month - 1] ?? month}/${year}`;
}

function shortDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function periodLabel(start: string | null, end: string | null): string {
  if (!start && !end) return "Não identificado";
  return `${shortDate(start)} → ${shortDate(end)}`;
}

function inputMonthValue(record: IdpNormalizedRecord): string {
  if (!record.referenceYear || !record.referenceMonth) return "";
  return `${record.referenceYear}-${String(record.referenceMonth).padStart(2, "0")}`;
}

function isPendingRecordValid(record: IdpNormalizedRecord | null): record is IdpNormalizedRecord {
  return Boolean(
    record &&
      record.unit.trim() &&
      Number.isInteger(record.rsoNumero) &&
      (record.rsoNumero ?? 0) > 0 &&
      Number.isInteger(record.referenceYear) &&
      Number.isInteger(record.referenceMonth) &&
      (record.referenceMonth ?? 0) >= 1 &&
      (record.referenceMonth ?? 0) <= 12 &&
      record.referenceSource !== "UNRESOLVED" &&
      record.execucaoFases.length > 0,
  );
}

export function IdpView({ canPublish, canClear }: { canPublish: boolean; canClear: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [threshold, setThreshold] = useState(90);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [historyMonthStart, setHistoryMonthStart] = useState(1);
  const [historyMonthEnd, setHistoryMonthEnd] = useState(12);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [excludedDisciplinesDraft, setExcludedDisciplinesDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [publication, setPublication] = useState<PublicationSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load(filters?: Partial<{
    year: number;
    month: number;
    historyStart: number;
    historyEnd: number;
    threshold: number;
  }>, useCurrentSelection = true) {
    setError(null);
    const params = new URLSearchParams();
    const year = filters?.year ?? (useCurrentSelection ? selectedYear : undefined);
    const month = filters?.month ?? (useCurrentSelection ? selectedMonth : undefined);
    const historyStart = filters?.historyStart ?? (useCurrentSelection ? historyMonthStart : undefined);
    const historyEnd = filters?.historyEnd ?? (useCurrentSelection ? historyMonthEnd : undefined);
    const target = filters?.threshold ?? (useCurrentSelection ? threshold : undefined);
    if (year !== undefined) params.set("year", String(year));
    if (month !== undefined) params.set("month", String(month));
    if (historyStart !== undefined) params.set("historyStart", String(historyStart));
    if (historyEnd !== undefined) params.set("historyEnd", String(historyEnd));
    if (target !== undefined) params.set("threshold", String(target));
    const suffix = params.toString();
    const response = await fetch(`/api/idp${suffix ? `?${suffix}` : ""}`, { cache: "no-store" });
    if (!response.ok) throw await responseError(response, "Falha ao carregar o IDP.");
    const body = (await response.json()) as ApiResponse;
    setData(body);
    setSelectedYear(body.selectedYear);
    setSelectedMonth(body.selectedMonth);
    setHistoryMonthStart(body.historyMonthStart);
    setHistoryMonthEnd(body.historyMonthEnd);
    setThreshold(body.threshold * 100);
    setExcludedDisciplinesDraft(body.excludedDisciplines.join("\n"));
    setSelectedUnit((current) =>
      body.result.unitDetails.some((item) => item.unit === current)
        ? current
        : (body.result.unitDetails[0]?.unit ?? ""),
    );
  }

  async function loadPublication() {
    const response = await fetch("/api/publicacoes/idp", { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as { publication: PublicationSummary | null };
    setPublication(body.publication);
  }

  useEffect(() => {
    void Promise.all([load(undefined, false).catch((err: Error) => setError(err.message)), loadPublication()]);
    // A primeira leitura não envia mês/ano: a API abre a competência mais recente realmente armazenada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updatePending(id: string, updater: (record: IdpNormalizedRecord) => IdpNormalizedRecord) {
    setPendingFiles((current) =>
      current.map((item) =>
        item.id === id && item.record ? { ...item, record: updater(item.record) } : item,
      ),
    );
  }

  async function prepareFiles(files: FileList | File[]) {
    const selected = Array.from(files);
    if (!selected.length) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setProgress(null);
    try {
      const parsed: PendingFile[] = [];
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index]!;
        const result = await parseIdpFile(file);
        parsed.push({ ...result, id: `${Date.now()}-${index}-${file.name}` });
      }
      setPendingFiles((current) => [...current, ...parsed]);
      if (parsed.some((item) => item.record)) {
        setMessage(
          "RSOs lidos. Confira unidade, número da versão, mês de referência, período e emissão antes de importar.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ler os PDFs RSO.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const validPendingCount = pendingFiles.filter((item) => isPendingRecordValid(item.record)).length;
  const invalidPendingCount = pendingFiles.filter((item) => item.record && !isPendingRecordValid(item.record)).length;

  async function importPendingFiles() {
    const records = pendingFiles
      .map((item) => item.record)
      .filter(isPendingRecordValid);
    if (!records.length) {
      setError("Nenhum RSO está completo para importação. Revise os campos destacados.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    const batches = chunk(records, DEFAULT_IMPORT_BATCH_SIZE);
    setProgress({
      totalFound: records.length,
      currentBatch: 0,
      totalBatches: batches.length,
      inserted: 0,
      ignored: 0,
      updated: 0,
      rejected: 0,
    });

    try {
      const start = await fetch("/api/importacoes/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: "idp",
          fileName: records.map((record) => record.fileName).join(", "),
          referenceYear: records[0]?.referenceYear,
          referenceMonth: records[0]?.referenceMonth,
          totalFound: records.length,
        }),
      });
      if (!start.ok) throw await responseError(start, "Falha ao iniciar a importação.");
      const { importJobId } = (await start.json()) as { importJobId: string };

      let totals = { inserted: 0, ignored: 0, updated: 0, rejected: 0 };
      for (let index = 0; index < batches.length; index += 1) {
        const response = await fetch(`/api/importacoes/${importJobId}/lotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchNumber: index + 1, records: batches[index] }),
        });
        if (!response.ok) {
          throw await responseError(response, `Falha ao processar o lote ${index + 1}.`);
        }
        const current = (await response.json()) as typeof totals;
        totals = {
          inserted: totals.inserted + current.inserted,
          ignored: totals.ignored + current.ignored,
          updated: totals.updated + current.updated,
          rejected: totals.rejected + current.rejected,
        };
        setProgress({
          totalFound: records.length,
          currentBatch: index + 1,
          totalBatches: batches.length,
          ...totals,
        });
      }

      const finish = await fetch(`/api/importacoes/${importJobId}/finalizar`, { method: "POST" });
      if (!finish.ok) throw await responseError(finish, "Falha ao finalizar a importação.");

      setMessage(
        `Importação concluída: ${totals.inserted} nova(s) versão(ões), ${totals.updated} corrigida(s), ${totals.ignored} idêntica(s) e ${totals.rejected} rejeitada(s).`,
      );
      setPendingFiles([]);
      const importedCompetence = records
        .filter((record) => record.referenceYear && record.referenceMonth)
        .map((record) => ({ year: record.referenceYear!, month: record.referenceMonth! }))
        .sort((a, b) => b.year - a.year || b.month - a.month)[0];
      if (importedCompetence) {
        await load({
          year: importedCompetence.year,
          month: importedCompetence.month,
          historyStart: Math.min(historyMonthStart, importedCompetence.month),
          historyEnd: Math.max(historyMonthEnd, importedCompetence.month),
          threshold,
        });
      } else {
        await load(undefined, false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na importação.");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/publicacoes/idp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: selectedYear,
          month: selectedMonth,
          historyStart: historyMonthStart,
          historyEnd: historyMonthEnd,
          threshold,
        }),
      });
      if (!response.ok) throw await responseError(response, "Falha ao publicar o IDP.");
      const body = (await response.json()) as { publication: PublicationSummary };
      setPublication(body.publication);
      setMessage("IDP publicado com os RSOs exatos do mês analisado.");
      window.dispatchEvent(new Event("idp:published"));
      window.dispatchEvent(new Event("indicator:published"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao publicar o IDP.");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!window.confirm("Excluir todo o histórico administrativo de RSOs do IDP? A publicação ativa será preservada.")) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/idp/registros", { method: "DELETE" });
      if (!response.ok) throw await responseError(response, "Falha ao limpar os RSOs.");
      const body = (await response.json()) as { deleted: number };
      setMessage(`${body.deleted} versão(ões) de RSO removida(s).`);
      setPendingFiles([]);
      setProgress(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao limpar os registros.");
    } finally {
      setBusy(false);
    }
  }

  async function saveExcludedDisciplines() {
    const disciplines = excludedDisciplinesDraft
      .split(/[\r\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/configuracoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "idp.excludedDisciplines", value: disciplines }),
      });
      if (!response.ok) throw await responseError(response, "Falha ao salvar as exclusões.");
      await load();
      setMessage("Disciplinas excluídas atualizadas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar as exclusões.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const result = data?.result;
  const detail = result?.unitDetails.find((item) => item.unit === selectedUnit) ?? null;
  const progressPct = progress?.totalBatches
    ? Math.round((progress.currentBatch / progress.totalBatches) * 100)
    : 0;
  const rowByName = useMemo(
    () => new Map(result?.disciplineRows.map((row) => [row.discipline, row]) ?? []),
    [result],
  );

  return (
    <div className="space-y-5">
      {data?.setupRequired ? (
        <div className="error-box">
          A tabela de versões do RSO ainda não existe. Execute <strong>pnpm db:upgrade:idp-rso</strong> no banco conectado.
        </div>
      ) : null}

      <section className="idp-section-card">
        <div className="subtitle-block first">
          <h3>RSO — controle semanal</h3>
          <p>
            Cada PDF é uma versão semanal independente. O número do RSO identifica a versão; mês de referência, período e emissão são armazenados separadamente.
          </p>
        </div>
        <div
          className={`upload-zone${dragging ? " drag" : ""}`}
          onClick={() => !busy && inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!busy) void prepareFiles(event.dataTransfer.files);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === " ") && !busy) inputRef.current?.click();
          }}
        >
          <div className="icon">↑</div>
          <h4>Arraste os PDFs do RSO aqui, ou clique para escolher</h4>
          <p>O sistema lê Unidade, RSO Nº, Mês ref., Período, Emissão, Execução e disciplinas.</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,application/pdf"
            onChange={(event) => event.target.files && void prepareFiles(event.target.files)}
          />
        </div>
      </section>

      {busy && !progress ? <div className="progress-item"><span className="spinner" /> Processando…</div> : null}

      {pendingFiles.length ? (
        <section className="idp-section-card">
          <div className="subtitle-block first">
            <h3>Pré-validação dos documentos</h3>
            <p>Nenhum mês de referência é inferido por período, emissão ou data de upload. Se “Mês ref.” não for localizado, a definição manual é obrigatória.</p>
          </div>
          <div className="idp-rso-preview-list">
            {pendingFiles.map((file) => {
              const record = file.record;
              if (file.error || !record) {
                return (
                  <div className="idp-rso-preview-card is-error" key={file.id}>
                    <strong>{file.fileName}</strong>
                    <span>{file.error ?? "Falha ao interpretar o arquivo."}</span>
                    <button type="button" className="btn secondary" onClick={() => setPendingFiles((items) => items.filter((item) => item.id !== file.id))}>Remover</button>
                  </div>
                );
              }

              const valid = isPendingRecordValid(record);
              const detectedCompetence = record.detectedReferenceYear && record.detectedReferenceMonth
                ? competenceLabel(record.detectedReferenceYear, record.detectedReferenceMonth)
                : "Não identificada";

              return (
                <div className={`idp-rso-preview-card${valid ? "" : " is-warning"}`} key={file.id}>
                  <div className="idp-rso-preview-head">
                    <div>
                      <strong>{file.fileName}</strong>
                      <div className="idp-rso-source-line">
                        Fonte do mês de referência: {record.referenceOriginalText ?? "Mês ref. não localizado"}
                      </div>
                    </div>
                    <span className={`badge ${valid ? "ok" : "fail"}`}>{valid ? "Pronto para importar" : "Revisão obrigatória"}</span>
                  </div>

                  <div className="idp-rso-edit-grid">
                    <label>
                      <span>Unidade</span>
                      <input
                        value={record.unit}
                        onChange={(event) => updatePending(file.id, (current) => ({
                          ...current,
                          unit: event.target.value,
                          unitAdjusted: event.target.value.trim() !== (current.detectedUnit ?? "").trim(),
                        }))}
                      />
                      <small>Detectado: {record.detectedUnit ?? "—"}</small>
                    </label>
                    <label>
                      <span>Número do RSO</span>
                      <input
                        type="number"
                        min={1}
                        value={record.rsoNumero ?? ""}
                        onChange={(event) => {
                          const value = event.target.value ? Number(event.target.value) : null;
                          updatePending(file.id, (current) => ({
                            ...current,
                            rsoNumero: value,
                            rsoAdjusted: value !== current.detectedRsoNumero,
                          }));
                        }}
                      />
                      <small>Detectado: {record.detectedRsoNumero ?? "—"}</small>
                    </label>
                    <label>
                      <span>Mês de referência</span>
                      <input
                        type="month"
                        value={inputMonthValue(record)}
                        onChange={(event) => {
                          const [yearText, monthText] = event.target.value.split("-");
                          const referenceYear = yearText ? Number(yearText) : null;
                          const referenceMonth = monthText ? Number(monthText) : null;
                          updatePending(file.id, (current) => {
                            const adjusted =
                              referenceYear !== current.detectedReferenceYear ||
                              referenceMonth !== current.detectedReferenceMonth;
                            return {
                              ...current,
                              referenceYear,
                              referenceMonth,
                              referenceAdjusted: adjusted,
                              referenceSource: adjusted || !current.detectedReferenceYear ? "MANUAL" : "PDF_MES_REF",
                            };
                          });
                        }}
                      />
                      <small>Detectado: {detectedCompetence}</small>
                    </label>
                    <div className="idp-rso-readonly-field"><span>Período</span><strong>{periodLabel(record.periodStart, record.periodEnd)}</strong><small>Não altera o mês de referência</small></div>
                    <div className="idp-rso-readonly-field"><span>Emissão</span><strong>{shortDate(record.emissionDate)}</strong><small>Data formal do documento</small></div>
                    <div className="idp-rso-readonly-field"><span>Execução</span><strong>{record.execucaoFases.length} fase(s)</strong><small>{record.areas.length} área(s) reconhecida(s)</small></div>
                  </div>

                  {record.referenceAdjusted || record.unitAdjusted || record.rsoAdjusted ? (
                    <div className="idp-manual-adjustment-note">Ajuste manual rastreado: o valor detectado no PDF será preservado junto do valor usado.</div>
                  ) : null}

                  <button type="button" className="btn secondary" onClick={() => setPendingFiles((items) => items.filter((item) => item.id !== file.id))}>Remover arquivo</button>
                </div>
              );
            })}
          </div>

          <div className="controls-row" style={{ marginTop: 12 }}>
            <button className="btn" type="button" disabled={busy || validPendingCount === 0} onClick={() => void importPendingFiles()}>
              Importar {validPendingCount} RSO(s)
            </button>
            {invalidPendingCount ? <span className="badge fail">{invalidPendingCount} documento(s) aguardando revisão</span> : null}
          </div>
        </section>
      ) : null}

      {progress ? (
        <div className="info-box">
          Processando lote {progress.currentBatch}/{progress.totalBatches} — {progressPct}% · Inseridos: {progress.inserted} · Atualizados: {progress.updated} · Ignorados: {progress.ignored} · Rejeitados: {progress.rejected}
        </div>
      ) : null}
      {error ? <div className="error-box">{error}</div> : null}
      {message ? <div className="info-box">{message}</div> : null}

      <section className="idp-section-card">
        <div className="subtitle-block first">
          <h3>Mês analisado e ajustes de cálculo</h3>
          <p>Dois grupos com papéis diferentes: um define quais RSOs entram na conta e vão para o Painel; o outro só ajusta como esse resultado é exibido, sem trocar os dados usados.</p>
        </div>

        <div className="idp-filter-groups">
          <div className="idp-filter-group">
            <h4>Mês analisado — define os dados do Painel</h4>
            <p>
              Escolha o ano e o mês. São os RSOs deste mês que alimentam todas as tabelas abaixo e são
              exatamente os que vão para o Painel quando você clicar em “Publicar”.
            </p>
            <div className="controls-row idp-control-grid">
              <label>Ano
                <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
                  {(data?.years ?? [selectedYear]).map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
              <label>Mês analisado
                <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
                  {MONTH_NAMES_FULL.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
                </select>
              </label>
            </div>
            <div className="idp-competence-banner">
              <strong>Mês analisado: {competenceLabel(data?.selectedYear ?? selectedYear, data?.selectedMonth ?? selectedMonth)}</strong>
              <span>{result?.activeDocuments ?? 0} RSO(s) ativo(s). Nenhuma versão de outro mês é reutilizada.</span>
            </div>
          </div>

          <div className="idp-filter-group">
            <h4>Intervalo do gráfico e meta</h4>
            <p>
              Não mudam quais RSOs são usados. “De / Até” define quais meses aparecem no gráfico de tendência
              do Painel publicado. “Meta” define a aderência mínima para marcar “Dentro da meta” aqui e no Painel.
            </p>
            <div className="controls-row idp-control-grid">
              <label>Gráfico do Painel — de
                <select value={historyMonthStart} onChange={(event) => setHistoryMonthStart(Number(event.target.value))}>
                  {MONTH_NAMES_FULL.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
                </select>
              </label>
              <label>Gráfico do Painel — até
                <select value={historyMonthEnd} onChange={(event) => setHistoryMonthEnd(Number(event.target.value))}>
                  {MONTH_NAMES_FULL.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
                </select>
              </label>
              <label>Meta (%)
                <input type="number" min={0} max={200} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
              </label>
            </div>
          </div>
        </div>

        <div className="controls-row" style={{ marginTop: 14 }}>
          <button className="btn secondary" type="button" disabled={busy} onClick={() => void load({ year: selectedYear, month: selectedMonth, historyStart: historyMonthStart, historyEnd: historyMonthEnd, threshold })}>Recalcular</button>
          {result?.activeDocuments ? <button className="btn secondary" type="button" onClick={() => exportIdpPdf(result)}>Baixar PDF</button> : null}
          {canPublish ? <button className="btn" type="button" disabled={busy || !result?.activeDocuments} onClick={() => void publish()}>Publicar</button> : null}
          {canClear ? <button className="btn secondary" type="button" disabled={busy || !data?.total} onClick={() => void clearAll()}>Limpar histórico</button> : null}
        </div>
        {publication ? <div className="idp-publication-note">Última publicação: versão {publication.version} · {new Date(publication.publishedAt).toLocaleString("pt-BR")} · {publication.publishedBy.name}</div> : null}
      </section>

      {canPublish ? (
        <section className="idp-section-card">
          <div className="subtitle-block first"><h3>Disciplinas desconsideradas</h3><p>As versões continuam armazenadas; a exclusão afeta apenas os cálculos por disciplina.</p></div>
          <div className="controls-row">
            <textarea rows={3} value={excludedDisciplinesDraft} onChange={(event) => setExcludedDisciplinesDraft(event.target.value)} style={{ minWidth: 360, flex: 1 }} />
            <button className="btn secondary" type="button" disabled={busy} onClick={() => void saveExcludedDisciplines()}>Salvar exclusões</button>
          </div>
        </section>
      ) : null}

      {data?.documents.length ? (
        <section className="idp-section-card">
          <div className="subtitle-block first">
            <h3>Histórico de versões RSO</h3>
            <p>Todos os documentos permanecem no banco. “Em cálculo” marca a maior versão de cada unidade no mês analisado.</p>
          </div>
          <div className="table-scroll idp-summary-table-wrap">
            <table className="data idp-summary-table">
              <thead><tr><th>Unidade</th><th>RSO</th><th>Ref.</th><th>Período</th><th>Emissão</th><th>Origem ref.</th><th>Arquivo</th><th>1ª importação</th><th>Última atualização</th><th>Uso</th></tr></thead>
              <tbody>
                {data.documents.map((document) => (
                  <tr key={document.id}>
                    <td>{document.unit}{document.unitAdjusted ? <small className="idp-inline-audit"> ajustada</small> : null}</td>
                    <td>RSO {document.rsoNumero}{document.rsoAdjusted ? <small className="idp-inline-audit"> ajustado</small> : null}</td>
                    <td>{competenceLabel(document.referenceYear, document.referenceMonth)}{document.referenceAdjusted ? <small className="idp-inline-audit"> manual</small> : null}</td>
                    <td>{periodLabel(document.periodStart, document.periodEnd)}</td>
                    <td>{shortDate(document.emissionDate)}</td>
                    <td>
                      {document.referenceSource === "PDF_MES_REF" ? "Mês ref. do PDF" : "Ajuste manual"}
                      {document.referenceOriginalText ? <small className="idp-rso-source-line">{document.referenceOriginalText}</small> : null}
                    </td>
                    <td title={document.fileName}>{document.fileName}</td>
                    <td>{new Date(document.createdAt).toLocaleString("pt-BR")}{document.firstImportedBy ? <small className="idp-rso-source-line">por {document.firstImportedBy}</small> : null}</td>
                    <td>{new Date(document.updatedAt).toLocaleString("pt-BR")}{document.lastUpdatedBy ? <small className="idp-rso-source-line">por {document.lastUpdatedBy}</small> : null}</td>
                    <td>{document.active ? <span className="badge ok">Em cálculo</span> : document.sameCompetence ? <span className="badge info">Histórico do mês analisado</span> : <span className="badge info">Outro mês</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {result?.activeDocuments ? (
        <>
          <div className="cards idp-metric-grid">
            <Metric label="Aderência geral (Execução)" value={fmtPct(result.aderenciaGeral)} accent />
            <Metric label="RSOs ativos" value={String(result.activeDocuments)} />
            <DisciplineMetric label="Civil" value={rowByName.get("01 - Civil")?.aderencia ?? null} threshold={result.threshold} />
            <DisciplineMetric label="Mecânica" value={rowByName.get("02 - Mecânica")?.aderencia ?? null} threshold={result.threshold} />
            <DisciplineMetric label="Elétrica" value={rowByName.get("04 - Elétrica")?.aderencia ?? null} threshold={result.threshold} />
          </div>

          <section className="idp-section-card">
            <div className="subtitle-block first"><h3>Execução geral por unidade</h3><p>Fonte: página 1 → Avanços por Etapa → linha Execução → acumulado. A maior versão semanal do mês analisado é usada.</p></div>
            <div className="table-scroll idp-summary-table-wrap">
              <table className="data idp-summary-table">
                <thead><tr><th></th><th>Unidade</th><th>RSO utilizado</th><th>Período</th><th>Ref.</th><th>Fases</th><th>Prev. acum.</th><th>Real acum.</th><th>Aderência</th><th>Situação</th></tr></thead>
                <tbody>
                  {result.unitRows.map((unit) => {
                    const key = `unit-${unit.unit}`;
                    const open = expanded.has(key);
                    const ok = unit.aderencia >= result.threshold;
                    return (
                      <Fragment key={key}>
                        <tr className="idp-expandable-row" onClick={() => toggle(key)}>
                          <td><span className={`idp-chevron${open ? " is-open" : ""}`}>▸</span></td>
                          <td>{unit.unit}</td>
                          <td><strong>RSO {unit.rsoNumero}</strong></td>
                          <td>{periodLabel(unit.periodStart, unit.periodEnd)}</td>
                          <td>{competenceLabel(unit.referenceYear, unit.referenceMonth)}{unit.referenceAdjusted ? <small className="idp-inline-audit"> manual</small> : null}</td>
                          <td className="num">{unit.nFases}</td>
                          <td className="num">{accumulated(unit.prevAcum)}</td>
                          <td className="num">{accumulated(unit.realAcum)}</td>
                          <td className="num">{fmtPct(unit.aderencia)}</td>
                          <td><span className={`badge ${ok ? "ok" : "fail"}`}>{ok ? "Dentro da meta" : "Fora da meta"}</span></td>
                        </tr>
                        {open ? (
                          <>
                            <tr className="idp-detail-row idp-source-detail"><td></td><td colSpan={9}><strong>Rastreabilidade:</strong> arquivo {unit.fileName} · emissão {shortDate(unit.emissionDate)} · mês de referência {unit.referenceSource === "PDF_MES_REF" ? `lida de ${unit.referenceOriginalText ?? "Mês ref."}` : `ajustada manualmente (original: ${unit.referenceOriginalText ?? "não identificado"})`}.</td></tr>
                            {unit.fases.map((phase, phaseIndex) => (
                              <tr className="idp-detail-row" key={`${key}-${phaseIndex}`}>
                                <td></td><td>{phase.label}</td><td></td><td></td><td></td><td></td>
                                <td className="num">{accumulated(phase.prevAcum)}</td>
                                <td className="num">{accumulated(phase.realAcum)}</td>
                                <td className="num">{fmtPct(phase.prevAcum ? phase.realAcum / phase.prevAcum : 0)}</td><td></td>
                              </tr>
                            ))}
                          </>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="idp-section-card">
            <div className="subtitle-block first"><h3>Aderência por disciplina</h3><p>Média das áreas do RSO ativo de cada unidade no mês analisado.</p></div>
            <div className="table-scroll idp-summary-table-wrap">
              <table className="data idp-summary-table">
                <thead><tr><th></th><th>Disciplina</th><th>Áreas usadas</th><th>Prev. médio</th><th>Real médio</th><th>Aderência</th><th>Situação</th></tr></thead>
                <tbody>
                  {result.disciplineRows.map((row, rowIndex) => {
                    const key = `discipline-${rowIndex}`;
                    const open = expanded.has(key);
                    if (row.aderencia === null || row.prevAvg === null || row.realAvg === null) {
                      return <tr key={key}><td></td><td>{row.discipline}</td><td className="num">0</td><td>—</td><td>—</td><td>—</td><td><span className="badge info">Sem dados</span></td></tr>;
                    }
                    const ok = row.aderencia >= result.threshold;
                    return (
                      <Fragment key={key}>
                        <tr className="idp-expandable-row" onClick={() => toggle(key)}>
                          <td><span className={`idp-chevron${open ? " is-open" : ""}`}>▸</span></td>
                          <td>{row.discipline}</td><td className="num">{row.entries.length}</td>
                          <td className="num">{accumulated(row.prevAvg)}</td><td className="num">{accumulated(row.realAvg)}</td>
                          <td className="num">{fmtPct(row.aderencia)}</td>
                          <td><span className={`badge ${ok ? "ok" : "fail"}`}>{ok ? "Dentro da meta" : "Fora da meta"}</span></td>
                        </tr>
                        {open ? row.unitGroups.map((group) => (
                          <tr className="idp-detail-row" key={`${key}-${group.unit}`}>
                            <td></td><td>{group.unit}</td><td className="num">{group.entries.length}</td>
                            <td className="num">{accumulated(group.prevAvg)}</td><td className="num">{accumulated(group.realAvg)}</td>
                            <td className="num">{fmtPct(group.aderencia)}</td><td></td>
                          </tr>
                        )) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="idp-section-card">
            <div className="subtitle-block first"><h3>Detalhamento por unidade</h3><p>Expanda as disciplinas para chegar às áreas originais do RSO ativo.</p></div>
            <div className="controls-row compact">
              <label htmlFor="idpUnitDetailSelect">Unidade</label>
              <select id="idpUnitDetailSelect" value={selectedUnit} onChange={(event) => setSelectedUnit(event.target.value)}>
                {result.unitDetails.map((unit) => <option value={unit.unit} key={unit.unit}>{unit.unit}</option>)}
              </select>
            </div>
            <div className="table-scroll idp-summary-table-wrap">
              <table className="data idp-summary-table">
                <thead><tr><th></th><th>Disciplina / área</th><th>Áreas usadas</th><th>Prev. acum.</th><th>Real acum.</th><th>Aderência</th></tr></thead>
                <tbody>
                  {detail?.disciplines.length ? detail.disciplines.map((discipline, index) => {
                    const key = `area-${detail.unit}-${index}`;
                    const open = expanded.has(key);
                    return (
                      <Fragment key={key}>
                        <tr className="idp-expandable-row" onClick={() => toggle(key)}>
                          <td><span className={`idp-chevron${open ? " is-open" : ""}`}>▸</span></td>
                          <td>{discipline.discipline}</td><td className="num">{discipline.n}</td>
                          <td className="num">{accumulated(discipline.prevAvg)}</td><td className="num">{accumulated(discipline.realAvg)}</td>
                          <td className="num">{fmtPct(discipline.aderencia)}</td>
                        </tr>
                        {open ? discipline.areas.map((area, areaIndex) => (
                          <tr className="idp-detail-row" key={`${key}-${areaIndex}`}>
                            <td></td><td>{area.area}</td><td></td>
                            <td className="num">{accumulated(area.prevAcum)}</td><td className="num">{accumulated(area.realAcum)}</td>
                            <td className="num">{fmtPct(area.prevAcum ? area.realAcum / area.prevAcum : 0)}</td>
                          </tr>
                        )) : null}
                      </Fragment>
                    );
                  }) : <tr><td colSpan={6}>Nenhuma disciplina reconhecida para esta unidade.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <div className="placeholder idp-empty-state">
          <span className="tag">Sem RSO neste mês</span>
          <h3>{competenceLabel(data?.selectedYear ?? selectedYear, data?.selectedMonth ?? selectedMonth)}</h3>
          <p>O sistema não reutiliza automaticamente RSOs de meses anteriores. Importe um RSO para este mês ou selecione outro mês analisado.</p>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className={`card${accent ? " accent" : ""}`}><div className="lbl">{label}</div><div className="val">{value}</div></div>;
}

function DisciplineMetric({ label, value, threshold }: { label: string; value: number | null; threshold: number }) {
  const hasData = value !== null;
  const ok = hasData && value >= threshold;
  return (
    <div className="card">
      <div className="lbl">{label}</div>
      <div className="val" style={{ fontSize: 20 }}>{value !== null ? fmtPct(value) : "—"}</div>
      <div className="sub"><span className={`badge ${hasData ? (ok ? "ok" : "fail") : "info"}`}>{hasData ? (ok ? "Dentro da meta" : "Fora da meta") : "Sem dados"}</span></div>
    </div>
  );
}
