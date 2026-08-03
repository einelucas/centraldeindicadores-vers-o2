"use client";

import { useEffect, useRef, useState } from "react";
import { chunk, DEFAULT_IMPORT_BATCH_SIZE } from "@/lib/batching";
import { fmtCurrency, fmtPct } from "@/lib/currency";
import { MONTH_NAMES_FULL } from "@/lib/dates";
import {
  parseIdpFile,
  recordsFromParsedIdpFile,
  type IdpFileParseResult,
} from "@/features/idp/importers";
import { exportIdpPdf } from "@/features/idp/exports/pdf";
import {
  IDP_DEFAULT_MONTH_END,
  IDP_DEFAULT_MONTH_START,
  type IdpDetailedResult,
  type IdpNormalizedRecord,
} from "@/features/idp/types";

interface ApiResponse {
  total: number;
  totalImportedInPeriod: number;
  excludedTotal: number;
  excludedDisciplines: string[];
  years: number[];
  defaultYear: number;
  selectedYear: number;
  monthStart: number;
  monthEnd: number;
  threshold: number;
  result: IdpDetailedResult;
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

interface PendingFile extends IdpFileParseResult {
  id: string;
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

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function IdpView({ canPublish, canClear }: { canPublish: boolean; canClear: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [monthStart, setMonthStart] = useState(IDP_DEFAULT_MONTH_START);
  const [monthEnd, setMonthEnd] = useState(IDP_DEFAULT_MONTH_END);
  const [threshold, setThreshold] = useState(90);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [excludedDisciplinesDraft, setExcludedDisciplinesDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [publication, setPublication] = useState<PublicationSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load(filters?: {
    year?: number;
    monthStart?: number;
    monthEnd?: number;
    threshold?: number;
  }) {
    setError(null);
    const params = new URLSearchParams();
    const year = filters?.year ?? selectedYear;
    if (year) params.set("year", String(year));
    params.set("monthStart", String(filters?.monthStart ?? monthStart));
    params.set("monthEnd", String(filters?.monthEnd ?? monthEnd));
    params.set("threshold", String(filters?.threshold ?? threshold));

    const response = await fetch(`/api/idp?${params}`, { cache: "no-store" });
    if (!response.ok) throw await responseError(response, "Falha ao carregar os dados do IDP.");
    const body = (await response.json()) as ApiResponse;
    setData(body);
    setSelectedYear(body.selectedYear);
    setMonthStart(body.monthStart);
    setMonthEnd(body.monthEnd);
    setThreshold(body.threshold * 100);
    setExcludedDisciplinesDraft(body.excludedDisciplines.join("\n"));
    setSelectedUnit((current) =>
      body.result.unitDetails.some((item) => item.unit === current)
        ? current
        : body.result.unitDetails[0]?.unit ?? "",
    );
  }

  async function loadPublication() {
    const response = await fetch("/api/publicacoes/idp", { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as { publication: PublicationSummary | null };
    setPublication(body.publication);
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
        body: JSON.stringify({
          key: "idp.excludedDisciplines",
          value: disciplines,
        }),
      });
      if (!response.ok) {
        throw await responseError(
          response,
          "Falha ao salvar as disciplinas excluídas.",
        );
      }
      await load({ year: selectedYear, monthStart, monthEnd, threshold });
      setMessage(
        "Disciplinas excluídas atualizadas. Os cálculos e a próxima publicação já usam a nova regra.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Falha ao salvar as disciplinas excluídas.",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void Promise.all([
      load().catch((err: Error) => setError(err.message)),
      loadPublication(),
    ]);
    // A primeira leitura deixa a API escolher o ano real padrão da base.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function prepareFiles(files: FileList | File[]) {
    const selected = Array.from(files);
    if (!selected.length) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setProgress(null);

    try {
      const parsed: PendingFile[] = [];
      for (let index = 0; index < selected.length; index++) {
        const file = selected[index]!;
        const result = await parseIdpFile(file);
        parsed.push({
          ...result,
          id: `${Date.now()}-${index}-${file.name}`,
        });
      }
      setPendingFiles((current) => [...current, ...parsed]);
      if (parsed.some((file) => !file.error)) {
        setMessage("Arquivos lidos. Confira o nome de cada unidade e clique em “Importar arquivos”.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ler os arquivos.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function importPendingFiles() {
    const records = pendingFiles.flatMap((file) =>
      recordsFromParsedIdpFile(file, file.projectName),
    );
    if (!records.length) {
      setError("Nenhum registro válido foi encontrado nos arquivos preparados.");
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
      for (let index = 0; index < batches.length; index++) {
        const batchRecords = (batches[index] ?? []).map((record: IdpNormalizedRecord) => ({
          unit: record.unit,
          year: record.year,
          month: record.month,
          disciplina: record.disciplina,
          custoLinhaBase: record.custoLinhaBase,
          custoReal: record.custoReal,
          raw: record.raw,
        }));
        const response = await fetch(`/api/importacoes/${importJobId}/lotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchNumber: index + 1, records: batchRecords }),
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

      const finish = await fetch(`/api/importacoes/${importJobId}/finalizar`, {
        method: "POST",
      });
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
          monthStart,
          monthEnd,
          threshold,
        }),
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
    if (!window.confirm("Excluir todos os registros administrativos do IDP? O painel publicado continuará preservado.")) return;
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
  const validPendingCount = pendingFiles.filter((file) => !file.error && file.rows).length;

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
          if (!busy) void prepareFiles(event.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && !busy) inputRef.current?.click();
        }}
      >
        <div className="icon">↑</div>
        <h4>Arraste os arquivos “Uso de Atribuições” aqui, ou clique para escolher</h4>
        <p>Um arquivo por unidade (.xlsx, .xls, .xltx ou .csv). O nome do projeto é detectado pelo arquivo e pode ser corrigido antes da importação.</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.xltx,.csv"
          onChange={(event) => event.target.files && void prepareFiles(event.target.files)}
        />
      </div>

      {busy && !progress ? (
        <div className="progress-item"><span className="spinner" /> Lendo arquivos…</div>
      ) : null}

      {pendingFiles.length ? (
        <div className="file-list">
          {pendingFiles.map((file) => (
            <span className={`file-pill${file.error ? " error" : ""}`} key={file.id}>
              {file.error ? (
                <>{file.fileName} · erro: {file.error}</>
              ) : (
                <>
                  <input
                    className="proj-name"
                    value={file.projectName}
                    aria-label={`Nome da unidade para ${file.fileName}`}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      const projectName = event.target.value;
                      setPendingFiles((current) =>
                        current.map((item) => item.id === file.id ? { ...item, projectName } : item),
                      );
                    }}
                  />
                  · {file.count.toLocaleString("pt-BR")} linhas
                </>
              )}
              <button
                type="button"
                aria-label={`Remover ${file.fileName}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setPendingFiles((current) => current.filter((item) => item.id !== file.id));
                }}
              >✕</button>
            </span>
          ))}
        </div>
      ) : null}

      {validPendingCount ? (
        <div className="controls-row" style={{ marginTop: 12 }}>
          <button className="btn" type="button" disabled={busy} onClick={() => void importPendingFiles()}>
            Importar {validPendingCount} arquivo(s)
          </button>
          <span style={{ fontSize: 12.5, color: "var(--texto-suave)" }}>
            Os nomes acima serão gravados como unidade/projeto no Neon.
          </span>
        </div>
      ) : null}

      {progress ? (
        <div className="info-box">
          Processando lote {progress.currentBatch}/{progress.totalBatches} — {progressPct}% · Inseridos: {progress.inserted} · Atualizados: {progress.updated} · Ignorados: {progress.ignored} · Rejeitados: {progress.rejected}
        </div>
      ) : null}

      {error ? <div className="error-box">{error}</div> : null}
      {message ? <div className="info-box">{message}</div> : null}

      {canPublish ? (
        <div className="info-box" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Disciplinas desconsideradas no IDP
          </div>
          <p style={{ margin: "0 0 10px", fontSize: 12.5 }}>
            Informe uma disciplina por linha. Elas permanecem importadas no
            banco, mas não entram nos cálculos, detalhamentos, PDF ou publicação
            do painel.
          </p>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <label style={{ flex: "1 1 420px" }} htmlFor="idpExcludedDisciplines">
              <span
                style={{
                  display: "block",
                  fontSize: 12.5,
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                Lista de exclusão
              </span>
              <textarea
                id="idpExcludedDisciplines"
                rows={3}
                value={excludedDisciplinesDraft}
                onChange={(event) => setExcludedDisciplinesDraft(event.target.value)}
                disabled={busy}
                style={{
                  width: "100%",
                  resize: "vertical",
                  padding: "9px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--borda)",
                }}
              />
            </label>
            <button
              className="btn secondary"
              type="button"
              disabled={busy}
              onClick={() => void saveExcludedDisciplines()}
            >
              Salvar exclusões
            </button>
          </div>
          {data?.excludedTotal ? (
            <div style={{ marginTop: 8, fontSize: 12.5 }}>
              {data.excludedTotal.toLocaleString("pt-BR")} registro(s) do
              período atual foram desconsiderados por essa regra.
            </div>
          ) : null}
        </div>
      ) : null}

      {result && data && data.total > 0 ? (
        <div>
          <div className="controls-row">
            <label htmlFor="idpYear">Ano</label>
            <select id="idpYear" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
              {data.years.map((year) => <option value={year} key={year}>{year}</option>)}
            </select>
            <label htmlFor="idpMonthStart">De</label>
            <select id="idpMonthStart" value={monthStart} onChange={(event) => setMonthStart(Number(event.target.value))}>
              {MONTH_NAMES_FULL.map((month, index) => <option value={index + 1} key={month}>{month}</option>)}
            </select>
            <label htmlFor="idpMonthEnd">Até</label>
            <select id="idpMonthEnd" value={monthEnd} onChange={(event) => setMonthEnd(Number(event.target.value))}>
              {MONTH_NAMES_FULL.map((month, index) => <option value={index + 1} key={month}>{month}</option>)}
            </select>
            <label htmlFor="idpTolerance">Meta de aderência (%)</label>
            <input id="idpTolerance" type="number" min={0} max={200} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
            <button className="btn secondary" type="button" disabled={busy} onClick={() => void load({ year: selectedYear, monthStart, monthEnd, threshold }).catch((err: Error) => setError(err.message))}>Recalcular</button>
            <button className="btn" type="button" disabled={busy} onClick={() => exportIdpPdf(result)}>Baixar PDF</button>
            {canClear ? <button className="btn secondary" type="button" disabled={busy} onClick={() => void clearAll()}>Limpar tudo</button> : null}
            {canPublish ? <button className="btn" style={{ background: "var(--verde)" }} type="button" disabled={busy} onClick={() => void publish()}>Publicar no Painel</button> : null}
          </div>

          <div style={{ fontSize: 12.5, color: "var(--texto-suave)", marginBottom: 10 }}>
            {publication
              ? `Última publicação: versão ${publication.version}, em ${new Date(publication.publishedAt).toLocaleString("pt-BR")}, por ${publication.publishedBy.name}.`
              : "O IDP ainda não foi publicado no painel."}
          </div>
          {data.lastImport ? (
            <div className="info-box">
              Última importação: {data.lastImport.fileName} · {data.lastImport.totalFound.toLocaleString("pt-BR")} registro(s) encontrados · {data.lastImport.totalInserted} inserido(s) · {data.lastImport.totalUpdated} atualizado(s) · {data.lastImport.totalIgnored} ignorado(s).
            </div>
          ) : null}

          <div className="cards">
            <div className="card"><div className="lbl">Custo Linha de Base</div><div className="val" style={{ fontSize: 20 }}>{formatMoney(result.totalLinhaBase)}</div></div>
            <div className="card"><div className="lbl">Custo Real</div><div className="val" style={{ fontSize: 20 }}>{formatMoney(result.totalReal)}</div></div>
            <div className="card accent"><div className="lbl">Aderência geral</div><div className="val">{fmtPct(result.aderenciaGeral)}</div></div>
            <div className="card"><div className="lbl">Unidades carregadas</div><div className="val">{result.units.length}</div></div>
            <GroupCard label="Civil" adherence={result.groups.civil.aderencia} hasData={result.groups.civil.hasData} threshold={result.threshold} />
            <GroupCard label="Mecânica" adherence={result.groups.mecanica.aderencia} hasData={result.groups.mecanica.hasData} threshold={result.threshold} />
            <GroupCard label="EIA" adherence={result.groups.eia.aderencia} hasData={result.groups.eia.hasData} threshold={result.threshold} />
          </div>

          <div className="subtitle-block">
            <h3>Aderência por unidade</h3>
            <p>Custo Linha de Base x Custo Real, somando todas as disciplinas no período selecionado.</p>
          </div>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Unidade</th><th>Custo Linha de Base</th><th>Custo Real</th><th>Aderência</th><th>Situação</th></tr></thead>
              <tbody>
                {result.units.map((unit) => {
                  const ok = unit.aderencia >= result.threshold;
                  return (
                    <tr key={unit.name}>
                      <td>{unit.name}</td>
                      <td className="num">{fmtCurrency(unit.custoLinhaBase)}</td>
                      <td className="num">{fmtCurrency(unit.custoReal)}</td>
                      <td className="num">{fmtPct(unit.aderencia)}</td>
                      <td><span className={`badge ${ok ? "ok" : "fail"}`}>{ok ? "Dentro da meta" : "Fora da meta"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="subtitle-block">
            <h3>Aderência por disciplina (consolidado de todas as unidades)</h3>
          </div>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Disciplina</th><th>Custo Linha de Base</th><th>Custo Real</th><th>Aderência</th><th>Situação</th></tr></thead>
              <tbody>
                {result.disciplinas.map((disciplina) => {
                  const ok = disciplina.aderencia >= result.threshold;
                  return (
                    <tr key={disciplina.name}>
                      <td>{disciplina.name}</td>
                      <td className="num">{fmtCurrency(disciplina.custoLinhaBase)}</td>
                      <td className="num">{fmtCurrency(disciplina.custoReal)}</td>
                      <td className="num">{fmtPct(disciplina.aderencia)}</td>
                      <td><span className={`badge ${ok ? "ok" : "fail"}`}>{ok ? "Dentro da meta" : "Fora da meta"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="subtitle-block">
            <h3>Detalhamento por unidade</h3>
            <p>Selecione uma unidade para ver a quebra mensal por disciplina.</p>
          </div>
          <div className="controls-row">
            <label htmlFor="idpUnitDetailSelect">Unidade</label>
            <select id="idpUnitDetailSelect" value={selectedUnit} onChange={(event) => setSelectedUnit(event.target.value)}>
              {result.unitDetails.map((unit) => <option value={unit.unit} key={unit.unit}>{unit.unit}</option>)}
            </select>
          </div>
          {detail ? (
            <div className="table-scroll">
              <table className="data" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th rowSpan={2}>Disciplina</th>
                    {detail.months.map((month) => <th colSpan={3} key={month.month}>{month.label}</th>)}
                    <th colSpan={3}>Total do período</th>
                  </tr>
                  <tr>
                    {detail.months.flatMap((month) => [
                      <th key={`${month.month}-lb`}>LB</th>,
                      <th key={`${month.month}-real`}>Real</th>,
                      <th key={`${month.month}-ad`}>Ader.</th>,
                    ])}
                    <th>LB</th><th>Real</th><th>Ader.</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.rows.map((row) => (
                    <tr key={row.disciplina}>
                      <td>{row.disciplina}</td>
                      {row.values.flatMap((value) => [
                        <td className="num" key={`${value.month}-lb`}>{fmtCurrency(value.custoLinhaBase)}</td>,
                        <td className="num" key={`${value.month}-real`}>{fmtCurrency(value.custoReal)}</td>,
                        <td className="num" key={`${value.month}-ad`}>{fmtPct(value.aderencia)}</td>,
                      ])}
                      <td className="num">{fmtCurrency(row.totalLinhaBase)}</td>
                      <td className="num">{fmtCurrency(row.totalReal)}</td>
                      <td className="num">{fmtPct(row.aderencia)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : data && data.total === 0 ? (
        <div>
          {data.years.length ? (
            <div className="controls-row">
              <label htmlFor="idpYearEmpty">Ano</label>
              <select id="idpYearEmpty" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
                {data.years.map((year) => <option value={year} key={year}>{year}</option>)}
              </select>
              <label htmlFor="idpMonthStartEmpty">De</label>
              <select id="idpMonthStartEmpty" value={monthStart} onChange={(event) => setMonthStart(Number(event.target.value))}>
                {MONTH_NAMES_FULL.map((month, index) => <option value={index + 1} key={month}>{month}</option>)}
              </select>
              <label htmlFor="idpMonthEndEmpty">Até</label>
              <select id="idpMonthEndEmpty" value={monthEnd} onChange={(event) => setMonthEnd(Number(event.target.value))}>
                {MONTH_NAMES_FULL.map((month, index) => <option value={index + 1} key={month}>{month}</option>)}
              </select>
              <label htmlFor="idpToleranceEmpty">Meta de aderência (%)</label>
              <input id="idpToleranceEmpty" type="number" min={0} max={200} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
              <button className="btn secondary" type="button" disabled={busy} onClick={() => void load({ year: selectedYear, monthStart, monthEnd, threshold }).catch((err: Error) => setError(err.message))}>Recalcular</button>
              {canClear ? <button className="btn secondary" type="button" disabled={busy} onClick={() => void clearAll()}>Limpar tudo</button> : null}
            </div>
          ) : null}
          <div className="placeholder" style={{ marginTop: 18 }}>
            <span className="tag">Aguardando dados</span>
            <h3>IDP - Disciplinas</h3>
            <p>
              {data.totalImportedInPeriod > 0
                ? "Todos os lançamentos do período foram desconsiderados pela lista de disciplinas excluídas."
                : data.years.length
                  ? "Nenhum lançamento foi encontrado no período selecionado."
                  : "Importe um relatório real “Uso de Atribuições” para preencher a Administração. Nenhum valor de demonstração é exibido."}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

function GroupCard({ label, adherence, hasData, threshold }: {
  label: string;
  adherence: number;
  hasData: boolean;
  threshold: number;
}) {
  const ok = hasData && adherence >= threshold;
  return (
    <div className="card">
      <div className="lbl">{label}</div>
      <div className="val" style={{ fontSize: 20 }}>{hasData ? fmtPct(adherence) : "—"}</div>
      <div className="sub">
        <span className={`badge ${hasData ? (ok ? "ok" : "fail") : "info"}`}>
          {hasData ? (ok ? "Dentro da meta" : "Fora da meta") : "Sem dados"}
        </span>
      </div>
    </div>
  );
}
