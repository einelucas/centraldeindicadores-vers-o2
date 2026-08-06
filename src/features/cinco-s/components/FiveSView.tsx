"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chunk, DEFAULT_IMPORT_BATCH_SIZE } from "@/lib/batching";
import { fmtPct } from "@/lib/currency";
import { MONTH_NAMES_FULL } from "@/lib/dates";
import styles from "./FiveSView.module.css";
import { importFiveSFiles } from "@/features/cinco-s/importers";
import { exportFiveSPdf } from "@/features/cinco-s/exports/pdf";
import {
  FIVES_DEFAULT_EXCLUDED,
  FIVES_DEFAULT_TARGET,
  type FiveSNormalizedRecord,
  type FiveSResult,
  type FiveSUnitMonth,
} from "@/features/cinco-s/types";
import { aderenciaArea } from "@/features/cinco-s/calculations";
import {
  compareFiveSUnits,
  formatFiveSUnitLabel,
  normalizeFiveSUnitCode,
} from "@/features/cinco-s/utils/units";

interface FiveSApiResponse {
  total: number;
  threshold: number;
  excludedUnits: string[];
  result: FiveSResult;
  lastImport: null | {
    fileName: string;
    completedAt: string | null;
    totalFound: number;
    totalInserted: number;
    totalUpdated: number;
    totalIgnored: number;
    totalRejected: number;
  };
}

interface PreparedImport {
  fileNames: string[];
  records: FiveSNormalizedRecord[];
  duplicates: number;
  perFile: Array<{
    fileName: string;
    count: number;
    error: string | null;
    periods: string[];
  }>;
}

interface Progress {
  currentBatch: number;
  totalBatches: number;
  inserted: number;
  updated: number;
  ignored: number;
  rejected: number;
}

interface PublicationSummary {
  version: number;
  publishedAt: string;
  publishedBy: { name: string };
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? fallback);
}

function parseExcluded(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map(normalizeFiveSUnitCode)
        .filter(Boolean),
    ),
  );
}

function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function periodLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function numberText(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString("pt-BR")
    : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function FiveSView({
  canPublish,
  canClear,
}: {
  canPublish: boolean;
  canClear: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState(FIVES_DEFAULT_TARGET * 100);
  const [excludedText, setExcludedText] = useState(
    FIVES_DEFAULT_EXCLUDED.join(", "),
  );
  const [data, setData] = useState<FiveSApiResponse | null>(null);
  const [prepared, setPrepared] = useState<PreparedImport | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [publication, setPublication] = useState<PublicationSummary | null>(null);
  const [matrixUnitFilter, setMatrixUnitFilter] = useState("all");
  const [matrixMonthFilter, setMatrixMonthFilter] = useState("all");
  const [matrixYearFilter, setMatrixYearFilter] = useState("all");
  const [detailUnit, setDetailUnit] = useState("");
  const [detailPeriod, setDetailPeriod] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const excludedUnits = useMemo(
    () => parseExcluded(excludedText),
    [excludedText],
  );

  const load = useCallback(async () => {
    const response = await fetch("/api/cinco-s", { cache: "no-store" });
    if (!response.ok) {
      throw await responseError(response, "Falha ao carregar os dados do 5S.");
    }
    const body = (await response.json()) as FiveSApiResponse;
    setData(body);
    setTarget(body.threshold * 100);
    setExcludedText(body.excludedUnits.join(", "));
  }, []);

  const loadPublication = useCallback(async () => {
    const response = await fetch("/api/publicacoes/cinco-s", {
      cache: "no-store",
    });
    if (!response.ok) return;
    const body = (await response.json()) as {
      publication: PublicationSummary | null;
    };
    setPublication(body.publication);
  }, []);

  useEffect(() => {
    void Promise.all([
      load().catch((err: Error) => setError(err.message)),
      loadPublication(),
    ]);
  }, [load, loadPublication]);

  const units = useMemo(() => {
    if (!data) return [];
    return Array.from(
      new Set(data.result.unitMonths.map((item) => normalizeFiveSUnitCode(item.unit))),
    ).sort(compareFiveSUnits);
  }, [data]);

  const periods = useMemo(() => {
    if (!data) return [];
    return data.result.months.map((month) => ({
      key: periodKey(month.year, month.month),
      label: month.label,
      year: month.year,
      month: month.month,
    }));
  }, [data]);

  const availableYears = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.result.months.map((month) => month.year))).sort(
      (a, b) => b - a,
    );
  }, [data]);

  const availableMonths = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.result.months.map((month) => month.month))).sort(
      (a, b) => a - b,
    );
  }, [data]);

  const filteredMatrixUnits = useMemo(() => {
    if (matrixUnitFilter === "all") return units;
    return units.filter((unit) => unit === matrixUnitFilter);
  }, [matrixUnitFilter, units]);

  const filteredMatrixPeriods = useMemo(() => {
    if (!data) return [];
    return data.result.months.filter((period) => {
      const matchesYear =
        matrixYearFilter === "all" || period.year === Number(matrixYearFilter);
      const matchesMonth =
        matrixMonthFilter === "all" || period.month === Number(matrixMonthFilter);
      return matchesYear && matchesMonth;
    });
  }, [data, matrixMonthFilter, matrixYearFilter]);

  useEffect(() => {
    if (matrixUnitFilter !== "all" && !units.includes(matrixUnitFilter)) {
      setMatrixUnitFilter("all");
    }
    if (
      matrixYearFilter !== "all" &&
      !availableYears.includes(Number(matrixYearFilter))
    ) {
      setMatrixYearFilter("all");
    }
    if (
      matrixMonthFilter !== "all" &&
      !availableMonths.includes(Number(matrixMonthFilter))
    ) {
      setMatrixMonthFilter("all");
    }
  }, [
    availableMonths,
    availableYears,
    matrixMonthFilter,
    matrixUnitFilter,
    matrixYearFilter,
    units,
  ]);

  useEffect(() => {
    if (!units.length) {
      setDetailUnit("");
      setDetailPeriod("");
      return;
    }
    if (!units.includes(detailUnit)) setDetailUnit(units[0] ?? "");
    const periodKeys = periods.map((period) => period.key);
    if (!periodKeys.includes(detailPeriod)) {
      setDetailPeriod(periodKeys[periodKeys.length - 1] ?? "");
    }
  }, [detailPeriod, detailUnit, periods, units]);

  const detail = useMemo<FiveSUnitMonth | null>(() => {
    if (!data || !detailUnit || !detailPeriod) return null;
    const [year, month] = detailPeriod.split("-").map(Number);
    return (
      data.result.unitMonths.find(
        (item) =>
          item.unit === detailUnit && item.year === year && item.month === month,
      ) ?? null
    );
  }, [data, detailPeriod, detailUnit]);

  const detailGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof detail>["areas"]>();
    for (const area of detail?.areas ?? []) {
      const division = area.divisao?.trim() || "Sem divisão";
      const current = groups.get(division) ?? [];
      current.push(area);
      groups.set(division, current);
    }
    return Array.from(groups.entries());
  }, [detail]);

  async function prepareFiles(files: FileList | File[]) {
    const selected = Array.from(files);
    if (!selected.length) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setProgress(null);
    try {
      const parsed = await importFiveSFiles(selected);
      const perFile = parsed.perFile.map((file) => ({
        fileName: file.fileName,
        count: file.records.length,
        error: file.error,
        periods: Array.from(
          new Set(
            file.records.map((record) =>
              periodLabel(record.year, record.month),
            ),
          ),
        ),
      }));
      setPrepared({
        fileNames: selected.map((file) => file.name),
        records: parsed.records,
        duplicates: parsed.duplicates,
        perFile,
      });
      if (parsed.records.length) {
        setMessage(
          `${parsed.records.length.toLocaleString("pt-BR")} unidade(s)/mês preparada(s). Clique em “Importar arquivos” para gravar no Neon.`,
        );
      } else {
        setError("Nenhuma aba válida foi encontrada nos arquivos selecionados.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ler os arquivos.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function saveSettings() {
    const response = await fetch("/api/cinco-s", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, excludedUnits }),
    });
    if (!response.ok) {
      throw await responseError(response, "Falha ao salvar as regras do 5S.");
    }
  }

  async function importPrepared() {
    if (!prepared?.records.length) {
      setError("Nenhum registro válido foi preparado para importação.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await saveSettings();
      const batches = chunk(prepared.records, DEFAULT_IMPORT_BATCH_SIZE);
      const start = await fetch("/api/importacoes/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: "cinco-s",
          fileName: prepared.fileNames.join(", "),
          totalFound: prepared.records.length,
        }),
      });
      if (!start.ok) {
        throw await responseError(start, "Falha ao iniciar a importação.");
      }
      const { importJobId } = (await start.json()) as { importJobId: string };

      let totals = { inserted: 0, updated: 0, ignored: 0, rejected: 0 };
      for (let index = 0; index < batches.length; index++) {
        const response = await fetch(`/api/importacoes/${importJobId}/lotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batchNumber: index + 1,
            records: (batches[index] ?? []).map((record) => ({
              unit: record.unit,
              year: record.year,
              month: record.month,
              areas: record.areas,
              raw: record.raw,
            })),
          }),
        });
        if (!response.ok) {
          throw await responseError(response, `Falha no lote ${index + 1}.`);
        }
        const current = (await response.json()) as typeof totals;
        totals = {
          inserted: totals.inserted + current.inserted,
          updated: totals.updated + current.updated,
          ignored: totals.ignored + current.ignored,
          rejected: totals.rejected + current.rejected,
        };
        setProgress({
          currentBatch: index + 1,
          totalBatches: batches.length,
          ...totals,
        });
      }

      const finish = await fetch(`/api/importacoes/${importJobId}/finalizar`, {
        method: "POST",
      });
      if (!finish.ok) {
        throw await responseError(finish, "Falha ao finalizar a importação.");
      }

      setMessage(
        `Importação concluída: ${totals.inserted} inserido(s), ${totals.updated} atualizado(s), ${totals.ignored} ignorado(s) e ${totals.rejected} rejeitado(s).`,
      );
      setPrepared(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao importar o 5S.");
    } finally {
      setBusy(false);
    }
  }

  async function recalculate() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await saveSettings();
      await load();
      setMessage("Regras salvas e indicador recalculado com a base do Neon.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao recalcular.");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/publicacoes/cinco-s", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, excludedUnits }),
      });
      if (!response.ok) {
        throw await responseError(response, "Falha ao publicar o 5S.");
      }
      const body = (await response.json()) as {
        publication: PublicationSummary;
      };
      setPublication(body.publication);
      setMessage(`5S publicado no Painel — versão ${body.publication.version}.`);
      window.dispatchEvent(new Event("cinco-s:published"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao publicar o 5S.");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!window.confirm("Excluir todos os registros administrativos do 5S?")) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/cinco-s", { method: "DELETE" });
      if (!response.ok) {
        throw await responseError(response, "Falha ao limpar a base do 5S.");
      }
      const body = (await response.json()) as { deleted: number };
      setPrepared(null);
      setProgress(null);
      setMessage(`${body.deleted} registro(s) removido(s) da Administração.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao limpar o 5S.");
    } finally {
      setBusy(false);
    }
  }

  const result = data?.result ?? null;
  const latestEligibleUnits = result
    ? result.unitMonths.filter(
        (item) =>
          item.year === result.latestYear &&
          item.month === result.latestMonth &&
          !item.excluded,
      ).length
    : 0;

  return (
    <div>
      <div
        className={`upload-zone${dragging ? " drag" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void prepareFiles(event.dataTransfer.files);
        }}
      >
        <div className="icon">↑</div>
        <h4>Arraste o(s) arquivo(s) PPR - 5S aqui, ou clique para escolher</h4>
        <p>
          Pode selecionar vários meses. Cada arquivo deve possuir uma aba por
          unidade e o padrão Divisão, Área, Meta e Nota.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.xltx"
          disabled={busy}
          onChange={(event) => void prepareFiles(event.target.files ?? [])}
        />
      </div>

      {busy && !progress ? (
        <div className="progress-item">
          <span className="spinner" /> Processando…
        </div>
      ) : null}

      {prepared ? (
        <div className="file-list">
          {prepared.perFile.map((file) => (
            <span
              key={file.fileName}
              className={`file-pill${file.error ? " error" : ""}`}
            >
              {file.fileName} · {file.error ?? `${file.count} unidade(s) · ${file.periods.join(", ")}`}
            </span>
          ))}
        </div>
      ) : null}

      {prepared?.duplicates ? (
        <div className="info-box">
          {prepared.duplicates} unidade(s)/mês repetida(s) na seleção; somente a
          última versão de cada unidade e período será enviada.
        </div>
      ) : null}

      {progress ? (
        <div className="info-box">
          Lote {progress.currentBatch}/{progress.totalBatches} · Inseridos: {progress.inserted} ·
          Atualizados: {progress.updated} · Ignorados: {progress.ignored} · Rejeitados: {progress.rejected}
        </div>
      ) : null}

      {error ? <div className="error-box">{error}</div> : null}
      {message ? <div className="info-box">{message}</div> : null}

      {prepared?.records.length ? (
        <div className="controls-row">
          <button className="btn" disabled={busy} onClick={() => void importPrepared()}>
            Importar arquivos
          </button>
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => setPrepared(null)}
          >
            Descartar seleção
          </button>
        </div>
      ) : null}

      <div className="controls-row">
        <label htmlFor="fiveSTarget">Meta global (%)</label>
        <input
          id="fiveSTarget"
          type="number"
          min={0}
          max={100}
          step={0.1}
          value={target}
          onChange={(event) => setTarget(Number(event.target.value))}
        />
        <button className="btn secondary" disabled={busy} onClick={() => void recalculate()}>
          Recalcular
        </button>
        <button
          className="btn"
          disabled={!result?.unitMonths.length || busy}
          onClick={() => result && exportFiveSPdf(result)}
        >
          Baixar PDF
        </button>
        {canClear ? (
          <button className="btn secondary" disabled={!data?.total || busy} onClick={() => void clearAll()}>
            Limpar tudo
          </button>
        ) : null}
        {canPublish ? (
          <button
            className="btn"
            style={{ background: "var(--verde)" }}
            disabled={!result || result.geral === null || busy}
            onClick={() => void publish()}
          >
            Publicar no Painel
          </button>
        ) : null}
      </div>

      {publication ? (
        <div style={{ fontSize: 12.5, color: "var(--texto-suave)", marginBottom: 10 }}>
          Última publicação: versão {publication.version}, em{" "}
          {new Date(publication.publishedAt).toLocaleString("pt-BR")}, por {publication.publishedBy.name}.
        </div>
      ) : null}

      <div className="subtitle-block">
        <h3>Unidades excluídas do consolidado</h3>
        <p>
          Essas unidades continuam visíveis na tabela e no detalhamento, mas não
          entram na média GERAL.
        </p>
      </div>
      <textarea
        rows={1}
        value={excludedText}
        onChange={(event) => setExcludedText(event.target.value)}
        style={{
          width: "100%",
          fontFamily: "Montserrat, sans-serif",
          fontSize: 13,
          padding: 10,
          border: "1px solid var(--borda)",
          borderRadius: 8,
        }}
      />

      {result?.unitMonths.length ? (
        <>
          <div className="cards">
            <div className={`card${result.passaMeta ? "" : " accent"}`}>
              <div className="lbl">GERAL ({result.periodLabel})</div>
              <div className="val">{fmtPct(result.geral)}</div>
              <div className="sub">
                <span className={`badge ${result.passaMeta ? "ok" : "fail"}`}>
                  {result.passaMeta ? "Dentro da meta" : "Fora da meta"}
                </span>
              </div>
            </div>
            <div className="card">
              <div className="lbl">Unidades carregadas</div>
              <div className="val">{result.unitsCount.toLocaleString("pt-BR")}</div>
            </div>
            <div className="card">
              <div className="lbl">Unidades no GERAL atual</div>
              <div className="val">{latestEligibleUnits.toLocaleString("pt-BR")}</div>
            </div>
            <div className="card">
              <div className="lbl">Meses carregados</div>
              <div className="val">{result.monthsCount.toLocaleString("pt-BR")}</div>
            </div>
          </div>

          <div className="rdo-tables-stack">
            <section className="rdo-section-card">
              <div className="rdo-section-header">
                <div className="subtitle-block first">
                  <h3>Por unidade e mês</h3>
                  <p>
                    Aderência média das áreas, com filtros independentes por
                    unidade, mês e ano.
                  </p>
                </div>
                <div className="rdo-section-filters rdo-month-filters">
                  <label htmlFor="fiveSMatrixUnitFilter">
                    <span>Unidade</span>
                    <select
                      id="fiveSMatrixUnitFilter"
                      value={matrixUnitFilter}
                      onChange={(event) => setMatrixUnitFilter(event.target.value)}
                    >
                      <option value="all">Todas as unidades</option>
                      {units.map((unit) => (
                        <option key={unit} value={unit}>
                          {formatFiveSUnitLabel(unit)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor="fiveSMatrixMonthFilter">
                    <span>Mês</span>
                    <select
                      id="fiveSMatrixMonthFilter"
                      value={matrixMonthFilter}
                      onChange={(event) => setMatrixMonthFilter(event.target.value)}
                    >
                      <option value="all">Todos os meses</option>
                      {availableMonths.map((month) => (
                        <option key={month} value={month}>
                          {MONTH_NAMES_FULL[month - 1] ?? month}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor="fiveSMatrixYearFilter">
                    <span>Ano</span>
                    <select
                      id="fiveSMatrixYearFilter"
                      value={matrixYearFilter}
                      onChange={(event) => setMatrixYearFilter(event.target.value)}
                    >
                      <option value="all">Todos os anos</option>
                      {availableYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(matrixUnitFilter !== "all" ||
                    matrixMonthFilter !== "all" ||
                    matrixYearFilter !== "all") && (
                    <button
                      type="button"
                      className={`btn secondary ${styles.filterReset}`}
                      onClick={() => {
                        setMatrixUnitFilter("all");
                        setMatrixMonthFilter("all");
                        setMatrixYearFilter("all");
                      }}
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
              </div>
              <div className="table-scroll rdo-summary-table-wrap">
                <table className={`data rdo-summary-table ${styles.matrixTable}`}>
                  <thead>
                    <tr>
                      <th>Unidade</th>
                      {filteredMatrixPeriods.map((month) => (
                        <th key={periodKey(month.year, month.month)}>
                          {month.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMatrixUnits.length && filteredMatrixPeriods.length ? (
                      <>
                        {filteredMatrixUnits.map((unit) => {
                          const excluded = result.excludedUnits.includes(unit);
                          return (
                            <tr key={unit}>
                              <td>
                                {formatFiveSUnitLabel(unit)}{" "}
                                {excluded ? (
                                  <span className="badge info">excluída</span>
                                ) : null}
                              </td>
                              {filteredMatrixPeriods.map((month) => {
                                const item = result.unitMonths.find(
                                  (row) =>
                                    row.unit === unit &&
                                    row.year === month.year &&
                                    row.month === month.month,
                                );
                                return (
                                  <td
                                    key={periodKey(month.year, month.month)}
                                    className="num"
                                  >
                                    {item ? fmtPct(item.aderencia) : "—"}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                        <tr className="total">
                          <td>GERAL</td>
                          {filteredMatrixPeriods.map((month) => (
                            <td
                              key={periodKey(month.year, month.month)}
                              className="num"
                            >
                              {fmtPct(month.geral)}
                            </td>
                          ))}
                        </tr>
                      </>
                    ) : (
                      <tr>
                        <td
                          className="rdo-empty-row"
                          colSpan={Math.max(filteredMatrixPeriods.length + 1, 1)}
                        >
                          Nenhum resultado encontrado para os filtros selecionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rdo-section-card">
              <div className="rdo-section-header">
                <div className="subtitle-block first">
                  <h3>Detalhamento por unidade</h3>
                  <p>
                    Divisão, área, meta, nota e aderência do período selecionado.
                  </p>
                </div>
                <div className="rdo-section-filters">
                  <label htmlFor="fiveSDetailUnit">
                    <span>Unidade</span>
                    <select
                      id="fiveSDetailUnit"
                      value={detailUnit}
                      onChange={(event) => setDetailUnit(event.target.value)}
                    >
                      {units.map((unit) => (
                        <option key={unit} value={unit}>
                          {formatFiveSUnitLabel(unit)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor="fiveSDetailPeriod">
                    <span>Mês</span>
                    <select
                      id="fiveSDetailPeriod"
                      value={detailPeriod}
                      onChange={(event) => setDetailPeriod(event.target.value)}
                    >
                      {periods.map((period) => (
                        <option key={period.key} value={period.key}>
                          {period.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <div className="table-scroll rdo-summary-table-wrap">
                <table className="data rdo-summary-table">
                  <thead>
                    <tr>
                      <th>Divisão</th>
                      <th>Área</th>
                      <th>Meta</th>
                      <th>Nota</th>
                      <th>Aderência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailGroups.length ? (
                      detailGroups.map(([division, areas]) => {
                        const average =
                          areas.reduce(
                            (sum, area) => sum + aderenciaArea(area),
                            0,
                          ) / areas.length;
                        return (
                          <Fragment key={division}>
                            {areas.map((area, index) => (
                              <tr key={`${division}-${area.area}-${index}`}>
                                <td>{division}</td>
                                <td>{area.area}</td>
                                <td className="num">{numberText(area.meta)}</td>
                                <td className="num">{numberText(area.nota)}</td>
                                <td className="num">
                                  {fmtPct(aderenciaArea(area))}
                                </td>
                              </tr>
                            ))}
                            <tr className="total">
                              <td colSpan={4}>Média {division}</td>
                              <td className="num">{fmtPct(average)}</td>
                            </tr>
                          </Fragment>
                        );
                      })
                    ) : (
                      <tr>
                        <td className="rdo-empty-row" colSpan={5}>
                          Sem dados reais para esta unidade e mês.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {data?.lastImport ? (
            <div className="info-box">
              Última importação: {data.lastImport.fileName} · {data.lastImport.totalFound} encontrado(s), {data.lastImport.totalInserted} inserido(s), {data.lastImport.totalUpdated} atualizado(s), {data.lastImport.totalIgnored} ignorado(s) e {data.lastImport.totalRejected} rejeitado(s).
            </div>
          ) : null}
        </>
      ) : (
        <div className="placeholder" style={{ marginTop: 20 }}>
          <span className="tag">Aguardando dados</span>
          <h3>Nenhuma auditoria 5S importada</h3>
          <p>Os cards e tabelas serão montados somente após registros reais serem gravados no Neon.</p>
        </div>
      )}
    </div>
  );
}
