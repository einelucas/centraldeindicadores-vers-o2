"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExportButtons } from "@/components/exports/ExportButtons";
import { MONTH_NAMES } from "@/lib/dates";
import {
  ACCIDENT_RATE_DEFAULT_TARGET,
  type AccidentMonthlyRecord,
  type AccidentRateResult,
  type AccidentUnitRecord,
} from "@/features/taxa-acidentes/types";

interface AccidentRateApiResponse {
  setupRequired?: boolean;
  monthly: AccidentMonthlyRecord[];
  units: AccidentUnitRecord[];
  target: number;
  result: AccidentRateResult | null;
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

function decimal(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

function periodLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? month}/${year}`;
}

export function AccidentRateView({
  canPublish,
  canClear,
}: {
  canPublish: boolean;
  canClear: boolean;
}) {
  const now = new Date();
  const [data, setData] = useState<AccidentRateApiResponse | null>(null);
  const [publication, setPublication] = useState<PublicationSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [target, setTarget] = useState(String(ACCIDENT_RATE_DEFAULT_TARGET));
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rate, setRate] = useState("");
  const [caf, setCaf] = useState("");

  const [unitYear, setUnitYear] = useState(now.getFullYear());
  const [unitMonth, setUnitMonth] = useState(now.getMonth() + 1);
  const [unit, setUnit] = useState("");
  const [unitSaf, setUnitSaf] = useState("");
  const [unitCaf, setUnitCaf] = useState("");

  const [unitFilterYear, setUnitFilterYear] = useState("");
  const [unitFilterMonth, setUnitFilterMonth] = useState("");
  const [unitFilterUnit, setUnitFilterUnit] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/taxa-acidentes", { cache: "no-store" });
    if (!response.ok) {
      throw await responseError(response, "Falha ao carregar a Taxa de Acidentes.");
    }
    const body = (await response.json()) as AccidentRateApiResponse;
    setData(body);
    setTarget(String(body.target ?? ACCIDENT_RATE_DEFAULT_TARGET));
  }, []);

  const loadPublication = useCallback(async () => {
    const response = await fetch("/api/publicacoes/taxa-acidentes", {
      cache: "no-store",
    });
    if (!response.ok) return;
    const body = (await response.json()) as {
      publication: PublicationSummary | null;
    };
    setPublication(body.publication);
  }, []);

  useEffect(() => {
    void Promise.all([load().catch((err: Error) => setError(err.message)), loadPublication()]);
  }, [load, loadPublication]);

  const exportRows = useMemo(
    () =>
      data?.monthly.map((row) => ({
        periodo: periodLabel(row.year, row.month),
        taxa: row.rate,
        caf: row.caf,
      })) ?? [],
    [data],
  );

  const unitFilterYears = useMemo(() => {
    const years = new Set((data?.units ?? []).map((row) => row.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [data]);

  const unitFilterUnits = useMemo(() => {
    const units = new Set((data?.units ?? []).map((row) => row.unit.trim()).filter(Boolean));

    return Array.from(units).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [data]);

  const filteredUnitRows = useMemo(() => {
    return (data?.units ?? []).filter((row) => {
      if (unitFilterYear && row.year !== Number(unitFilterYear)) {
        return false;
      }

      if (unitFilterMonth && row.month !== Number(unitFilterMonth)) {
        return false;
      }

      if (unitFilterUnit && row.unit !== unitFilterUnit) {
        return false;
      }

      return true;
    });
  }, [data, unitFilterMonth, unitFilterUnit, unitFilterYear]);

  const unitExportRows = useMemo(
    () =>
      filteredUnitRows.map((row) => ({
        periodo: periodLabel(row.year, row.month),
        unidade: row.unit,
        caf: row.caf,
        saf: row.saf,
      })),
    [filteredUnitRows],
  );

  const hasUnitFilters = Boolean(unitFilterYear || unitFilterMonth || unitFilterUnit);

  function clearUnitFilters() {
    setUnitFilterYear("");
    setUnitFilterMonth("");
    setUnitFilterUnit("");
  }

  async function post(payload: unknown, fallback: string) {
    const response = await fetch("/api/taxa-acidentes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw await responseError(response, fallback);
  }

  async function saveTarget() {
    const value = Number(target);
    if (!Number.isFinite(value) || value < 0) {
      setError("Informe uma meta válida.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await post({ type: "settings", target: value }, "Falha ao salvar a meta.");
      await load();
      setMessage("Meta salva no Neon e cálculo administrativo atualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar a meta.");
    } finally {
      setBusy(false);
    }
  }

  async function addMonth() {
    const rateValue = Number(rate);
    const cafValue = Number(caf);
    if (
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      !rate.trim() ||
      !caf.trim() ||
      !Number.isFinite(rateValue) ||
      rateValue < 0 ||
      !Number.isInteger(cafValue) ||
      cafValue < 0
    ) {
      setError("Preencha ano, mês, taxa e acidentes CAF com valores válidos.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await post(
        { type: "month", year, month, rate: rateValue, caf: cafValue },
        "Falha ao salvar o lançamento mensal.",
      );
      await load();
      setRate("");
      setCaf("");
      setMessage("Lançamento mensal salvo no Neon.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar o mês.");
    } finally {
      setBusy(false);
    }
  }

  async function addUnit() {
    const safValue = Number(unitSaf);
    const cafValue = Number(unitCaf);
    if (
      !Number.isInteger(unitYear) ||
      unitYear < 2000 ||
      unitYear > 2100 ||
      !Number.isInteger(unitMonth) ||
      unitMonth < 1 ||
      unitMonth > 12 ||
      !unit.trim() ||
      !unitSaf.trim() ||
      !unitCaf.trim() ||
      !Number.isInteger(safValue) ||
      safValue < 0 ||
      !Number.isInteger(cafValue) ||
      cafValue < 0
    ) {
      setError("Preencha ano, mês, unidade e as quantidades de acidentes SAF e CAF.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await post(
        {
          type: "unit",
          year: unitYear,
          month: unitMonth,
          unit: unit.trim(),
          saf: safValue,
          caf: cafValue,
        },
        "Falha ao salvar os acidentes da unidade.",
      );
      await load();
      setUnit("");
      setUnitSaf("");
      setUnitCaf("");
      setMessage("Acidentes CAF e SAF da unidade salvos no Neon.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar a unidade.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(url: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(url, { method: "DELETE" });
      if (!response.ok) throw await responseError(response, "Falha ao remover.");
      await load();
      setMessage("Registro removido e cálculo administrativo atualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover.");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/publicacoes/taxa-acidentes", {
        method: "POST",
      });
      if (!response.ok) {
        throw await responseError(response, "Falha ao publicar o indicador.");
      }
      await Promise.all([load(), loadPublication()]);
      setMessage("Taxa de Acidentes publicada no Painel e no Painel Geral.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao publicar.");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (
      !window.confirm(
        "Remover todos os lançamentos administrativos da Taxa de Acidentes? A publicação anterior será preservada.",
      )
    ) {
      return;
    }
    await remove("/api/taxa-acidentes?kind=all");
  }

  if (data?.setupRequired) {
    return (
      <div className="error-box">
        Estrutura do banco pendente. Execute <strong>pnpm db:upgrade:accidents</strong> e recarregue
        esta página.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="controls-row">
        <label>Meta de frequência (≤)</label>
        <input
          type="number"
          min="0"
          step="0.1"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        />
        <button className="btn secondary" disabled={busy} onClick={() => void saveTarget()}>
          Salvar meta
        </button>
        <button className="btn secondary" disabled={busy} onClick={() => void load()}>
          Recalcular do banco
        </button>
        <ExportButtons
          fileName="taxa-acidentes"
          title="Taxa de Acidentes"
          subtitle={`Meta de frequência ≤ ${target}`}
          rows={exportRows}
          columns={[
            { header: "Mês", value: (row) => row.periodo },
            { header: "Taxa de Frequência", value: (row) => row.taxa },
            { header: "Acidentes CAF", value: (row) => row.caf },
          ]}
        />
        {canClear ? (
          <button className="btn secondary" disabled={busy} onClick={() => void clearAll()}>
            Limpar tudo
          </button>
        ) : null}
        {canPublish ? (
          <button
            className="btn"
            style={{ background: "var(--verde)" }}
            disabled={busy || !data?.monthly.length}
            onClick={() => void publish()}
          >
            Publicar no Painel
          </button>
        ) : null}
      </div>

      <div className="text-sm text-neutralbrand">
        {publication
          ? `Última publicação: versão ${publication.version}, por ${publication.publishedBy.name}, em ${new Date(publication.publishedAt).toLocaleString("pt-BR")}.`
          : "Nenhuma versão publicada ainda."}
      </div>

      {error ? <div className="error-box">{error}</div> : null}
      {message ? <div className="info-box">{message}</div> : null}

      {data?.result ? (
        <div className="cards">
          <div className="card">
            <div className="lbl">Taxa do período</div>
            <div className="val">
              {data.result.result === null ? "—" : decimal(data.result.result)}
            </div>
            <div className="sub">média de todos os meses carregados</div>
          </div>
          <div className="card">
            <div className="lbl">Acidentes CAF</div>
            <div className="val">{data.result.totalCaf}</div>
            <div className="sub">total mensal do período</div>
          </div>
          <div className="card">
            <div className="lbl">Acidentes SAF por unidade</div>
            <div className="val">{data.result.totalSaf}</div>
            <div className="sub">soma dos lançamentos por unidade</div>
          </div>
          <div className="card">
            <div className="lbl">Desempenho do mês</div>
            <div className="val">
              {data.result.latestRate === null ? "—" : decimal(data.result.latestRate)}
            </div>
            <div className="sub">leitura mais recente</div>
          </div>
        </div>
      ) : null}

      <div className="subtitle-block">
        <h3>Taxa de frequência mensal e acidentes CAF</h3>
        <p>Informe a competência, a taxa mensal e a quantidade total de acidentes CAF.</p>
      </div>
      <div className="controls-row">
        <label>Ano</label>
        <input
          type="number"
          min="2000"
          max="2100"
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
        />
        <label>Mês</label>
        <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>
        <label>Taxa de frequência</label>
        <input
          type="number"
          min="0"
          step="0.1"
          value={rate}
          onChange={(event) => setRate(event.target.value)}
        />
        <label>Acidentes CAF</label>
        <input
          type="number"
          min="0"
          step="1"
          value={caf}
          onChange={(event) => setCaf(event.target.value)}
        />
        <button className="btn" disabled={busy} onClick={() => void addMonth()}>
          Adicionar
        </button>
      </div>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Mês</th>
              <th>Taxa de Frequência</th>
              <th>Acidentes CAF</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.monthly.length ? (
              data.monthly.map((row) => (
                <tr key={row.id}>
                  <td>{periodLabel(row.year, row.month)}</td>
                  <td className="num">{decimal(row.rate)}</td>
                  <td className="num">{row.caf}</td>
                  <td>
                    <button
                      disabled={busy}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "var(--vermelho)",
                        fontWeight: 800,
                        cursor: busy ? "not-allowed" : "pointer",
                      }}
                      onClick={() =>
                        void remove(
                          `/api/taxa-acidentes?kind=month&year=${row.year}&month=${row.month}`,
                        )
                      }
                      type="button"
                      aria-label={`Remover ${row.month}/${row.year}`}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>Nenhum mês adicionado ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="subtitle-block">
        <h3>Acidentes CAF e SAF por unidade</h3>
        <p>Informe a competência e a quantidade de acidentes de cada classificação por unidade.</p>
      </div>

      <div className="controls-row">
        <label>Ano</label>
        <input
          type="number"
          min="2000"
          max="2100"
          value={unitYear}
          onChange={(event) => setUnitYear(Number(event.target.value))}
        />

        <label>Mês</label>
        <select value={unitMonth} onChange={(event) => setUnitMonth(Number(event.target.value))}>
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>

        <label>Unidade</label>
        <input
          type="text"
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
          placeholder="Ex.: Sinop"
        />

        <label>Acidentes SAF</label>
        <input
          type="number"
          min="0"
          step="1"
          value={unitSaf}
          onChange={(event) => setUnitSaf(event.target.value)}
        />

        <label>Acidentes CAF</label>
        <input
          type="number"
          min="0"
          step="1"
          value={unitCaf}
          onChange={(event) => setUnitCaf(event.target.value)}
        />

        <button className="btn" disabled={busy} onClick={() => void addUnit()}>
          Adicionar
        </button>
      </div>

      <div
        className="controls-row"
        style={{
          marginTop: 12,
          padding: "14px 16px",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          background: "#ffffff",
        }}
      >
        <strong style={{ color: "var(--azul)", marginRight: 4 }}>Consultar tabela</strong>

        <label htmlFor="unit-filter-year">Ano</label>
        <select
          id="unit-filter-year"
          value={unitFilterYear}
          onChange={(event) => setUnitFilterYear(event.target.value)}
        >
          <option value="">Todos</option>
          {unitFilterYears.map((filterYear) => (
            <option key={filterYear} value={filterYear}>
              {filterYear}
            </option>
          ))}
        </select>

        <label htmlFor="unit-filter-month">Mês</label>
        <select
          id="unit-filter-month"
          value={unitFilterMonth}
          onChange={(event) => setUnitFilterMonth(event.target.value)}
        >
          <option value="">Todos</option>
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>

        <label htmlFor="unit-filter-unit">Unidade</label>
        <select
          id="unit-filter-unit"
          value={unitFilterUnit}
          onChange={(event) => setUnitFilterUnit(event.target.value)}
        >
          <option value="">Todas</option>
          {unitFilterUnits.map((filterUnit) => (
            <option key={filterUnit} value={filterUnit}>
              {filterUnit}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="btn secondary"
          disabled={!hasUnitFilters}
          onClick={clearUnitFilters}
        >
          Limpar filtros
        </button>

        <span className="text-sm text-neutralbrand">
          {filteredUnitRows.length} {filteredUnitRows.length === 1 ? "registro" : "registros"}
        </span>

        <ExportButtons
          fileName="taxa-acidentes-por-unidade"
          title="Acidentes CAF e SAF por unidade"
          subtitle={
            hasUnitFilters
              ? "Lançamentos filtrados por competência e unidade"
              : "Todos os lançamentos por competência"
          }
          rows={unitExportRows}
          columns={[
            { header: "Mês", value: (row) => row.periodo },
            { header: "Unidade", value: (row) => row.unidade },
            { header: "Acidentes CAF", value: (row) => row.caf },
            { header: "Acidentes SAF", value: (row) => row.saf },
          ]}
        />
      </div>

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Mês</th>
              <th>Unidade</th>
              <th>Acidentes CAF</th>
              <th>Acidentes SAF</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {filteredUnitRows.length ? (
              filteredUnitRows.map((row) => (
                <tr key={row.id}>
                  <td>{periodLabel(row.year, row.month)}</td>
                  <td>{row.unit}</td>
                  <td className="num">{row.caf}</td>
                  <td className="num">{row.saf}</td>
                  <td>
                    <button
                      disabled={busy}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "var(--vermelho)",
                        fontWeight: 800,
                        cursor: busy ? "not-allowed" : "pointer",
                      }}
                      onClick={() =>
                        void remove(
                          `/api/taxa-acidentes?kind=unit&id=${encodeURIComponent(row.id)}`,
                        )
                      }
                      type="button"
                      aria-label={`Remover ${row.unit} de ${row.month}/${row.year}`}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>
                  {data?.units.length
                    ? "Nenhum lançamento encontrado para os filtros selecionados."
                    : "Nenhum lançamento por unidade adicionado ainda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
