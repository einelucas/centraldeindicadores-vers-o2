"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { chunk, DEFAULT_IMPORT_BATCH_SIZE } from "@/lib/batching";
import { fmtPct } from "@/lib/currency";
import { MONTH_NAMES_FULL } from "@/lib/dates";
import { parseIdpFile } from "@/features/idp/importers";
import { exportIdpPdf } from "@/features/idp/exports/pdf";
import {
  IDP_DISC_NAMES,
  type IdpDetailedResult,
  type IdpNormalizedRecord,
} from "@/features/idp/types";

interface ApiResponse {
  total: number;
  activeTotal: number;
  threshold: number;
  years: number[];
  selectedYear: number;
  monthStart: number;
  monthEnd: number;
  excludedDisciplines: string[];
  result: IdpDetailedResult;
  setupRequired?: boolean;
  documents: Array<{
    id: string;
    unit: string;
    rsoNumero: number | null;
    referenceDate: string;
    fileName: string;
    areas: number;
    active: boolean;
    updatedAt: string;
  }>;
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

function rsoLabel(value: number | null): string {
  return value === null ? "Não identificado" : `RSO ${value}`;
}

export function IdpView({ canPublish, canClear }: { canPublish: boolean; canClear: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [threshold, setThreshold] = useState(98);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [monthStart, setMonthStart] = useState(1);
  const [monthEnd, setMonthEnd] = useState(12);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [excludedDisciplinesDraft, setExcludedDisciplinesDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [publication, setPublication] = useState<PublicationSummary | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load(filters?: {
    threshold?: number;
    selectedYear?: number;
    monthStart?: number;
    monthEnd?: number;
  }) {
    setError(null);
    const params = new URLSearchParams({
      threshold: String(filters?.threshold ?? threshold),
      year: String(filters?.selectedYear ?? selectedYear),
      monthStart: String(filters?.monthStart ?? monthStart),
      monthEnd: String(filters?.monthEnd ?? monthEnd),
    });
    const response = await fetch(`/api/idp?${params}`, { cache: "no-store" });
    if (!response.ok) throw await responseError(response, "Falha ao carregar os dados do IDP.");
    const body = (await response.json()) as ApiResponse;
    setData(body);
    setThreshold(body.threshold * 100);
    setSelectedYear(body.selectedYear);
    setMonthStart(body.monthStart);
    setMonthEnd(body.monthEnd);
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
    void Promise.all([load({ threshold: 98, selectedYear: 0 }).catch((err: Error) => setError(err.message)), loadPublication()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
        parsed.push({
          id: `${Date.now()}-${index}-${file.name}`,
          fileName: result.fileName,
          record: result.record,
          error: result.error,
        });
      }
      setPendingFiles((current) => [...current, ...parsed]);
      if (parsed.some((file) => file.record)) {
        setMessage("RSOs lidos. Confira a unidade, o número e a competência antes de importar.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ler os PDFs RSO.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function importPendingFiles() {
    const records = pendingFiles.flatMap((file) => (file.record ? [file.record] : []));
    if (!records.length) {
      setError("Nenhum RSO válido foi preparado para importação.");
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
          fileName: pendingFiles.map((file) => file.fileName).join(", "),
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
          body: JSON.stringify({ batchNumber: index + 1, records: batches[index] ?? [] }),
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
        `Importação concluída: ${totals.inserted} inserido(s), ${totals.updated} atualizado(s), ${totals.ignored} ignorado(s) e ${totals.rejected} rejeitado(s).`,
      );
      setPendingFiles([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na importação.");
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
      setMessage("Exclusões atualizadas para as tabelas e a próxima publicação.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar as exclusões.");
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
        body: JSON.stringify({ threshold, selectedYear, monthStart, monthEnd }),
      });
      if (!response.ok) throw await responseError(response, "Falha ao publicar o IDP.");
      const body = (await response.json()) as { publication: PublicationSummary };
      setPublication(body.publication);
      setMessage("IDP publicado no painel com sucesso.");
      window.dispatchEvent(new Event("idp:published"));
      window.dispatchEvent(new Event("indicator:published"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao publicar o IDP.");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!window.confirm("Excluir todos os RSOs administrativos do IDP? O painel publicado será preservado.")) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/idp/registros", { method: "DELETE" });
      if (!response.ok) throw await responseError(response, "Falha ao limpar os registros do IDP.");
      const body = (await response.json()) as { deleted: number };
      setMessage(`${body.deleted} registro(s) removido(s).`);
      setPendingFiles([]);
      setProgress(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao limpar os registros.");
    } finally {
      setBusy(false);
    }
  }

  const result = data?.result;
  const detail = result?.unitDetails.find((item) => item.unit === selectedUnit) ?? null;
  const progressPct = progress?.totalBatches
    ? Math.round((progress.currentBatch / progress.totalBatches) * 100)
    : 0;
  const validPendingCount = pendingFiles.filter((file) => file.record).length;
  const rowByName = new Map<string, IdpDetailedResult["disciplineRows"][number]>(
    result?.disciplineRows.map((row) => [row.discipline, row] as const) ?? [],
  );

  return (
    <div className="idp-admin-stack">
      <div className="idp-toolbar">
        <label htmlFor="idpYear">Ano</label>
        <select
          id="idpYear"
          value={selectedYear}
          onChange={(event) => setSelectedYear(Number(event.target.value))}
        >
          {(data?.years ?? [selectedYear]).map((year) => (
            <option value={year} key={year}>{year}</option>
          ))}
        </select>
        <label htmlFor="idpMonthStart">De</label>
        <select
          id="idpMonthStart"
          value={monthStart}
          onChange={(event) => setMonthStart(Number(event.target.value))}
        >
          {MONTH_NAMES_FULL.map((month, index) => (
            <option value={index + 1} key={month}>{month}</option>
          ))}
        </select>
        <label htmlFor="idpMonthEnd">Até</label>
        <select
          id="idpMonthEnd"
          value={monthEnd}
          onChange={(event) => setMonthEnd(Number(event.target.value))}
        >
          {MONTH_NAMES_FULL.map((month, index) => (
            <option value={index + 1} key={month}>{month}</option>
          ))}
        </select>
        <label htmlFor="idpTolerance">Meta de aderência (%)</label>
        <input
          id="idpTolerance"
          type="number"
          min={0}
          max={200}
          value={threshold}
          onChange={(event) => setThreshold(Number(event.target.value))}
        />
        <button className="btn secondary" type="button" disabled={busy} onClick={() => void load({ threshold, selectedYear, monthStart, monthEnd })}>
          Consultar
        </button>
        <button className="btn" type="button" disabled={busy || !result?.activeDocuments} onClick={() => result && exportIdpPdf(result)}>
          Baixar PDF
        </button>
        {canClear ? (
          <button className="btn secondary" type="button" disabled={busy} onClick={() => void clearAll()}>
            Limpar tudo
          </button>
        ) : null}
        {canPublish ? (
          <button className="btn idp-publish-button" type="button" disabled={busy || !result?.activeDocuments} onClick={() => void publish()}>
            Publicar no Painel
          </button>
        ) : null}
      </div>
      <div className="idp-period-hint">
        Consulta acumulada até {MONTH_NAMES_FULL[(result?.monthEnd ?? monthEnd) - 1]}/{result?.selectedYear ?? selectedYear}; a série mensal considera o intervalo de {MONTH_NAMES_FULL[(result?.monthStart ?? monthStart) - 1]} a {MONTH_NAMES_FULL[(result?.monthEnd ?? monthEnd) - 1]}.
      </div>

      <div className="idp-publication-status">
        {publication
          ? `Última publicação: versão ${publication.version}, em ${new Date(publication.publishedAt).toLocaleString("pt-BR")}, por ${publication.publishedBy.name}.`
          : "O IDP ainda não foi publicado no painel."}
      </div>

      {data?.setupRequired ? (
        <div className="error-box">
          A tabela de RSO ainda não existe. Execute <strong>pnpm db:upgrade:idp-rso</strong> no ambiente conectado ao banco.
        </div>
      ) : null}
      {error ? <div className="error-box">{error}</div> : null}
      {message ? <div className="info-box">{message}</div> : null}

      <section className="idp-section-card">
        <div className="subtitle-block first">
          <h3>RSO — fonte principal</h3>
          <p>
            Envie um PDF por unidade. A unidade, o número e a competência do RSO são sugeridos pelo documento e podem ser corrigidos; quando houver mais de um RSO da mesma unidade, somente o maior número entra no cálculo.
          </p>
        </div>
        <div
          className={`upload-zone${dragging ? " drag" : ""}`}
          onClick={() => !busy && inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
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
          <p>O leitor busca execução acumulada, áreas, disciplinas e a competência no padrão do relatório.</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,application/pdf"
            onChange={(event) => event.target.files && void prepareFiles(event.target.files)}
          />
        </div>

        {busy && !progress ? (
          <div className="progress-item"><span className="spinner" /> Lendo PDFs RSO…</div>
        ) : null}

        {pendingFiles.length ? (
          <div className="idp-pending-list">
            {pendingFiles.map((file) => (
              <div className={`idp-pending-card${file.error ? " is-error" : ""}`} key={file.id}>
                <div className="idp-pending-file">{file.fileName}</div>
                {file.error || !file.record ? (
                  <div className="idp-pending-error">{file.error ?? "Arquivo inválido."}</div>
                ) : (
                  <div className="idp-pending-fields">
                    <label>
                      Unidade
                      <input
                        value={file.record.unit}
                        onChange={(event) => {
                          const unit = event.target.value;
                          setPendingFiles((current) => current.map((item) =>
                            item.id === file.id && item.record
                              ? { ...item, record: { ...item.record, unit } }
                              : item,
                          ));
                        }}
                      />
                    </label>
                    <label>
                      Número do RSO
                      <input
                        type="number"
                        min={0}
                        value={file.record.rsoNumero ?? ""}
                        placeholder="Não detectado"
                        onChange={(event) => {
                          const rsoNumero = event.target.value === "" ? null : Number(event.target.value);
                          setPendingFiles((current) => current.map((item) =>
                            item.id === file.id && item.record
                              ? { ...item, record: { ...item.record, rsoNumero } }
                              : item,
                          ));
                        }}
                      />
                    </label>
                    <label>
                      Competência
                      <input
                        type="date"
                        required
                        value={file.record.referenceDate}
                        onChange={(event) => {
                          const referenceDate = event.target.value;
                          if (!referenceDate) return;
                          setPendingFiles((current) => current.map((item) =>
                            item.id === file.id && item.record
                              ? { ...item, record: { ...item.record, referenceDate } }
                              : item,
                          ));
                        }}
                      />
                    </label>
                    <span>{file.record.execucaoFases.length} fase(s) · {file.record.areas.length} área(s)</span>
                  </div>
                )}
                <button
                  type="button"
                  className="idp-remove-file"
                  aria-label={`Remover ${file.fileName}`}
                  onClick={() => setPendingFiles((current) => current.filter((item) => item.id !== file.id))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {validPendingCount ? (
          <div className="controls-row" style={{ marginTop: 12 }}>
            <button className="btn" type="button" disabled={busy} onClick={() => void importPendingFiles()}>
              Importar {validPendingCount} RSO(s)
            </button>
            <span className="idp-help-text">Os dados normalizados serão persistidos no Neon; o PDF original não é armazenado.</span>
          </div>
        ) : null}

        {progress ? (
          <div className="info-box">
            Processando lote {progress.currentBatch}/{progress.totalBatches} — {progressPct}% · Inseridos: {progress.inserted} · Atualizados: {progress.updated} · Ignorados: {progress.ignored} · Rejeitados: {progress.rejected}
          </div>
        ) : null}
      </section>

      {canPublish ? (
        <section className="idp-section-card idp-config-card">
          <div className="subtitle-block first">
            <h3>Disciplinas desconsideradas</h3>
            <p>Uma disciplina por linha. A exclusão afeta o consolidado por disciplina, o detalhamento, o PDF e a publicação; a execução geral por unidade permanece baseada nas fases do RSO.</p>
          </div>
          <div className="idp-config-row">
            <textarea
              rows={3}
              value={excludedDisciplinesDraft}
              onChange={(event) => setExcludedDisciplinesDraft(event.target.value)}
              disabled={busy}
              placeholder={IDP_DISC_NAMES.join("\n")}
            />
            <button className="btn secondary" type="button" disabled={busy} onClick={() => void saveExcludedDisciplines()}>
              Salvar exclusões
            </button>
          </div>
        </section>
      ) : null}

      {data?.documents.length ? (
        <section className="idp-section-card">
          <div className="subtitle-block first">
            <h3>RSOs importados</h3>
            <p>O selo “Em cálculo” identifica o documento vigente na competência consultada.</p>
          </div>
          <div className="table-scroll idp-summary-table-wrap">
            <table className="data idp-summary-table">
              <thead><tr><th>Unidade</th><th>RSO</th><th>Competência</th><th>Arquivo</th><th>Áreas</th><th>Atualizado em</th><th>Uso</th></tr></thead>
              <tbody>
                {data.documents.map((document) => (
                  <tr key={document.id}>
                    <td>{document.unit}</td>
                    <td className="num">{rsoLabel(document.rsoNumero)}</td>
                    <td>{new Date(`${document.referenceDate}T12:00:00`).toLocaleDateString("pt-BR")}</td>
                    <td>{document.fileName}</td>
                    <td className="num">{document.areas}</td>
                    <td>{new Date(document.updatedAt).toLocaleString("pt-BR")}</td>
                    <td><span className={`badge ${document.active ? "ok" : "info"}`}>{document.active ? "Em cálculo" : "Histórico"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {result?.activeDocuments ? (
        <>
          {data?.lastImport ? (
            <div className="info-box">
              Última importação: {data.lastImport.fileName} · {data.lastImport.totalFound} RSO(s) encontrado(s) · {data.lastImport.totalInserted} inserido(s) · {data.lastImport.totalUpdated} atualizado(s) · {data.lastImport.totalIgnored} ignorado(s).
            </div>
          ) : null}

          <div className="cards idp-metric-grid">
            <Metric label="Aderência geral (Execução)" value={fmtPct(result.aderenciaGeral)} accent />
            <Metric label="Unidades ativas" value={String(result.activeDocuments)} />
            <DisciplineMetric label="Civil" value={rowByName.get("01 - Civil")?.aderencia ?? null} threshold={result.threshold} />
            <DisciplineMetric label="Mecânica" value={rowByName.get("02 - Mecânica")?.aderencia ?? null} threshold={result.threshold} />
            <DisciplineMetric label="Elétrica" value={rowByName.get("04 - Elétrica")?.aderencia ?? null} threshold={result.threshold} />
          </div>

          <section className="idp-section-card">
            <div className="subtitle-block first">
              <h3>Execução geral por unidade</h3>
              <p>Média das fases encontradas no RSO ativo, acumulada desde o início da obra.</p>
            </div>
            <div className="table-scroll idp-summary-table-wrap">
              <table className="data idp-summary-table">
                <thead><tr><th></th><th>Unidade</th><th>RSO</th><th>Competência</th><th>Fases</th><th>Prev. acum.</th><th>Real acum.</th><th>Aderência</th><th>Situação</th></tr></thead>
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
                          <td>{rsoLabel(unit.rsoNumero)}</td>
                          <td>{new Date(`${unit.referenceDate}T12:00:00`).toLocaleDateString("pt-BR")}</td>
                          <td className="num">{unit.nFases}</td>
                          <td className="num">{accumulated(unit.prevAcum)}</td>
                          <td className="num">{accumulated(unit.realAcum)}</td>
                          <td className="num">{fmtPct(unit.aderencia)}</td>
                          <td><span className={`badge ${ok ? "ok" : "fail"}`}>{ok ? "Dentro da meta" : "Fora da meta"}</span></td>
                        </tr>
                        {open ? unit.fases.map((phase, phaseIndex) => (
                          <tr className="idp-detail-row" key={`${key}-${phaseIndex}`}>
                            <td></td><td>Fase {phaseIndex + 1}</td><td></td><td></td><td></td>
                            <td className="num">{accumulated(phase.prevAcum)}</td>
                            <td className="num">{accumulated(phase.realAcum)}</td>
                            <td className="num">{fmtPct(phase.prevAcum ? phase.realAcum / phase.prevAcum : 0)}</td><td></td>
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
            <div className="subtitle-block first">
              <h3>Aderência por disciplina</h3>
              <p>Média simples de todas as áreas disponíveis nas unidades ativas.</p>
            </div>
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
            <div className="subtitle-block first">
              <h3>Detalhamento por unidade</h3>
              <p>Selecione uma unidade e expanda as disciplinas para visualizar cada área.</p>
            </div>
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
          <span className="tag">Aguardando RSO</span>
          <h3>IDP — Avanço físico</h3>
          <p>Importe ao menos um PDF RSO válido. Nenhum valor de demonstração é exibido.</p>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`card${accent ? " accent" : ""}`}>
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
    </div>
  );
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
