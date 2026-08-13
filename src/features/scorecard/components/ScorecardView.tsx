"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ExportButtons } from "@/components/exports/ExportButtons";
import { MetricCard } from "@/components/indicators/MetricCard";
import { StatusBadge } from "@/components/indicators/StatusBadge";
import { computeScorecard } from "@/features/scorecard/calculations";
import {
  SC_INDICATORS,
  SCORECARD_MAX_POINTS,
  SCORECARD_MONTHLY_POOL,
  SCORECARD_PERIOD_MONTHS,
  type ScorecardResult,
  type ScorecardRow,
} from "@/features/scorecard/types";
import { MONTH_NAMES } from "@/lib/dates";

interface Computation {
  year: number;
  month: number;
  sourceValues?: Record<string, number | null>;
  values: Record<string, number | null>;
  result: ScorecardResult;
}

interface HistoryResponse {
  year: number;
  snapshots: Computation[];
}

interface HistoryExportRow {
  indicador: string;
  peso: string;
  meta: string;
  junho: string;
  julho: string;
  agosto: string;
  setembro: string;
  outubro: string;
  novembro: string;
  media: string;
  pontos: string;
  situacao: string;
}

function initialPeriodMonth(): number {
  const current = new Date().getMonth() + 1;
  return SCORECARD_PERIOD_MONTHS.includes(current as (typeof SCORECARD_PERIOD_MONTHS)[number])
    ? current
    : SCORECARD_PERIOD_MONTHS[0];
}

function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? `Mês ${month}`;
}

function formatPoints(value: number, digits = 2): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatValue(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const formatted = value.toLocaleString("pt-BR", {
    minimumFractionDigits: unit === "dias" ? 1 : 2,
    maximumFractionDigits: 2,
  });
  return unit === "dias" ? `${formatted} dias` : `${formatted}${unit}`;
}

function targetLabel(row: Pick<ScorecardRow, "direction" | "meta" | "unit">): string {
  const operator = row.direction === "lower" ? "≤" : "≥";
  return `${operator} ${formatValue(row.meta, row.unit)}`;
}

function inputsFromValues(values: Record<string, number | null>): Record<string, string> {
  return Object.fromEntries(
    SC_INDICATORS.map((indicator) => [
      indicator.key,
      values[indicator.key] === null || values[indicator.key] === undefined
        ? ""
        : String(values[indicator.key]),
    ]),
  );
}

function resultRow(computation: Computation | undefined, key: string): ScorecardRow | undefined {
  return computation?.result.rows.find((row) => row.key === key);
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

const LIVE_REFRESH_INTERVAL_MS = 30_000;

export function ScorecardView() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(initialPeriodMonth);
  const [data, setData] = useState<Computation | null>(null);
  const [history, setHistory] = useState<Computation[]>([]);
  const [semesterPreview, setSemesterPreview] = useState<Computation[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const currentRequestId = useRef(0);
  // Guarda o último valor "ao vivo" aplicado a cada campo, para saber se o
  // usuário editou manualmente desde então — assim uma atualização em tempo
  // real não apaga um ajuste que ainda não foi salvo.
  const lastLiveInputsRef = useRef<Record<string, string>>({});
  const previousPeriodKeyRef = useRef<string | null>(null);

  const loadHistory = useCallback(async () => {
    const response = await fetch(`/api/scorecard/history?year=${year}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Não foi possível carregar o histórico.");
    const payload = (await response.json()) as HistoryResponse;
    setHistory(payload.snapshots);
  }, [year]);

  const fetchSemesterComputations = useCallback(async () => {
    const responses = await Promise.all(
      SCORECARD_PERIOD_MONTHS.map((periodMonth) =>
        fetch(`/api/scorecard?year=${year}&month=${periodMonth}`, {
          cache: "no-store",
        }),
      ),
    );

    if (responses.some((response) => !response.ok)) {
      throw new Error("Não foi possível carregar os indicadores do ciclo.");
    }

    return Promise.all(responses.map((response) => response.json() as Promise<Computation>));
  }, [year]);

  // Substitui os antigos botões "Puxar mês/semestre": consulta os módulos de
  // origem para o ano selecionado (os seis meses do ciclo de uma vez) e
  // atualiza o histórico salvo. Chamada no carregamento inicial, ao trocar
  // de ano e periodicamente em segundo plano (ver useEffect abaixo).
  const refreshLive = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      const requestId = currentRequestId.current + 1;
      currentRequestId.current = requestId;

      if (!silent) {
        setBusy(true);
        setStatus(null);
        setStatusError(false);
      }

      try {
        const [computations] = await Promise.all([fetchSemesterComputations(), loadHistory()]);
        if (requestId !== currentRequestId.current) return;
        setSemesterPreview(computations);
        setLastSyncedAt(new Date());
      } catch (error) {
        if (requestId !== currentRequestId.current) return;
        if (!silent) {
          setStatus(error instanceof Error ? error.message : "Falha ao carregar os indicadores.");
          setStatusError(true);
        }
      } finally {
        if (!silent && requestId === currentRequestId.current) setBusy(false);
      }
    },
    [fetchSemesterComputations, loadHistory],
  );

  useEffect(() => {
    void refreshLive();
  }, [refreshLive]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refreshLive({ silent: true });
    }, LIVE_REFRESH_INTERVAL_MS);

    function handleVisibility() {
      if (document.visibilityState === "visible") void refreshLive({ silent: true });
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshLive]);

  // Mantém "Indicadores do mês" em sincronia com o snapshot ao vivo do mês
  // selecionado. Ao trocar de mês/ano, os campos assumem o valor publicado;
  // numa atualização em segundo plano, só os campos que o usuário não tocou
  // desde a última sincronização são sobrescritos.
  useEffect(() => {
    const current = semesterPreview.find((computation) => computation.month === month) ?? null;
    const periodKey = `${year}-${month}`;
    const periodChanged = previousPeriodKeyRef.current !== periodKey;
    previousPeriodKeyRef.current = periodKey;

    // Sem entrada ao vivo para o mês selecionado e o período não mudou: o
    // salvamento (ver save()/editHistoryCell) removeu esse mês da prévia de
    // propósito, para não sobrepor o snapshot recém-salvo com um valor ao
    // vivo desatualizado. O próximo ciclo de sincronização o repõe.
    if (!current && !periodChanged) return;

    setData(current);

    const liveInputs = current ? inputsFromValues(current.values) : {};
    setInputs((currentInputs) => {
      if (periodChanged) return liveInputs;
      const next = { ...currentInputs };
      for (const indicator of SC_INDICATORS) {
        const key = indicator.key;
        const untouched = (currentInputs[key] ?? "") === (lastLiveInputsRef.current[key] ?? "");
        if (untouched) next[key] = liveInputs[key] ?? "";
      }
      return next;
    });
    lastLiveInputsRef.current = liveInputs;
  }, [month, year, semesterPreview]);

  const displayedValues = useMemo(() => {
    const values: Record<string, number | null> = { ...(data?.values ?? {}) };

    for (const indicator of SC_INDICATORS) {
      const raw = inputs[indicator.key];
      if (raw === undefined) continue;
      const trimmed = raw.trim();
      if (!trimmed) {
        values[indicator.key] = null;
        continue;
      }
      const parsed = Number(trimmed.replace(",", "."));
      values[indicator.key] = Number.isFinite(parsed) ? parsed : null;
    }

    return values;
  }, [data?.values, inputs]);

  const displayedResult = useMemo(() => computeScorecard(displayedValues), [displayedValues]);

  const effectiveByMonth = useMemo(() => {
    const map = new Map<number, Computation>();
    const historyByMonth = new Map(history.map((computation) => [computation.month, computation]));
    const previewByMonth = new Map(
      semesterPreview.map((computation) => [computation.month, computation]),
    );

    // Mescla por indicador, não por mês inteiro, com o valor ao vivo ganhando
    // de um snapshot salvo sempre que ele existir. O "Salvar snapshot" hoje
    // não distingue um ajuste manual de um valor apenas puxado do módulo de
    // origem — os dois são gravados como o mesmo número — então tratar o
    // salvo como definitivo para sempre travaria o histórico na publicação
    // que existia no momento do save, ignorando republicações mais recentes
    // dos outros módulos (RDO/IDP/RNC/5S/Taxa). O snapshot salvo só entra
    // como respaldo quando o valor ao vivo não existe para aquele
    // indicador/mês (ex.: indicador retratado, sem publicação ativa).
    //
    // A mesma regra vale para o mês selecionado no topo — ele não pode ter
    // uma regra diferente dos demais, senão a mesma coluna mostra um valor
    // quando o mês está selecionado e outro quando não está.
    const mergeWithSavedFallback = (
      liveValues: Record<string, number | null>,
      saved: Computation | undefined,
    ): Record<string, number | null> => {
      const merged: Record<string, number | null> = {};
      for (const indicator of SC_INDICATORS) {
        const liveValue = liveValues[indicator.key];
        merged[indicator.key] =
          typeof liveValue === "number" && Number.isFinite(liveValue)
            ? liveValue
            : (saved?.values[indicator.key] ?? null);
      }
      return merged;
    };

    // Um mês só "tem dado" se pelo menos um indicador tiver valor real. A
    // busca em tempo real sempre retorna os 6 meses do ciclo (mesmo os sem
    // nenhum indicador publicado ainda), então checar só "existe um
    // Computation para esse mês" contava todo mês como disponível — inflando
    // "Meses disponíveis" e "Pontuação prevista — Período" para o semestre
    // inteiro mesmo com só 1 ou 2 meses realmente preenchidos.
    const hasRealValue = (values: Record<string, number | null>) =>
      Object.values(values).some((value) => typeof value === "number" && Number.isFinite(value));

    for (const periodMonth of SCORECARD_PERIOD_MONTHS) {
      const saved = historyByMonth.get(periodMonth);
      const preview = previewByMonth.get(periodMonth);
      if (!saved && !preview) continue;

      const mergedValues = mergeWithSavedFallback(preview?.values ?? {}, saved);
      if (!hasRealValue(mergedValues)) continue;

      map.set(periodMonth, {
        year,
        month: periodMonth,
        values: mergedValues,
        result: computeScorecard(mergedValues),
      });
    }

    if (data && data.year === year) {
      const mergedValues = mergeWithSavedFallback(displayedValues, historyByMonth.get(data.month));
      if (hasRealValue(mergedValues)) {
        map.set(data.month, {
          year: data.year,
          month: data.month,
          values: mergedValues,
          result: computeScorecard(mergedValues),
        });
      } else {
        map.delete(data.month);
      }
    }

    return map;
  }, [data, displayedValues, history, semesterPreview, year]);

  const semesterPoints = useMemo(
    () =>
      SCORECARD_PERIOD_MONTHS.reduce(
        (sum, periodMonth) => sum + (effectiveByMonth.get(periodMonth)?.result.totalPontos ?? 0),
        0,
      ),
    [effectiveByMonth],
  );

  // Só os meses com snapshot/preview disponível entram na meta do período —
  // o mês corrente do calendário nunca é usado para inferir disponibilidade.
  const availableMonthsCount = effectiveByMonth.size;
  const semesterPontuacaoPrevista = availableMonthsCount * SCORECARD_MONTHLY_POOL;
  const semesterAttendance =
    semesterPontuacaoPrevista > 0 ? (semesterPoints / semesterPontuacaoPrevista) * 100 : 0;

  const historyExportRows = useMemo<HistoryExportRow[]>(() => {
    const monthField = ["junho", "julho", "agosto", "setembro", "outubro", "novembro"] as const;

    return SC_INDICATORS.map((indicator) => {
      const monthRows = SCORECARD_PERIOD_MONTHS.map((periodMonth) =>
        resultRow(effectiveByMonth.get(periodMonth), indicator.key),
      );
      const values = monthRows
        .filter((row): row is ScorecardRow => Boolean(row?.hasValue))
        .map((row) => row.value as number);
      const mean = average(values);
      const points = monthRows.reduce((sum, row) => sum + (row?.pontos ?? 0), 0);
      const pass =
        mean === null
          ? null
          : indicator.direction === "lower"
            ? mean <= indicator.meta
            : mean >= indicator.meta;

      const row: HistoryExportRow = {
        indicador: indicator.label,
        peso: `${indicator.peso.toFixed(2)}%`,
        meta: `${indicator.direction === "lower" ? "≤" : "≥"} ${indicator.meta}${indicator.unit}`,
        junho: "—",
        julho: "—",
        agosto: "—",
        setembro: "—",
        outubro: "—",
        novembro: "—",
        media: mean === null ? "—" : formatValue(mean, indicator.unit),
        pontos: formatPoints(points),
        situacao: pass === null ? "Sem dados" : pass ? "Dentro da meta" : "Fora da meta",
      };

      monthRows.forEach((monthRow, index) => {
        const field = monthField[index];
        if (!field) return;
        row[field] = monthRow?.hasValue ? formatValue(monthRow.value, monthRow.unit) : "—";
      });

      return row;
    });
  }, [effectiveByMonth]);

  async function save() {
    setBusy(true);
    setStatus(null);
    setStatusError(false);

    try {
      const response = await fetch("/api/scorecard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          month,
          overrides: displayedValues,
        }),
      });

      if (!response.ok) throw new Error("Não foi possível salvar o snapshot.");

      const saved = (await response.json()) as Computation;
      const savedInputs = inputsFromValues(saved.values);
      setData(saved);
      setInputs(savedInputs);
      // O próximo ciclo de sincronização em tempo real substitui esse valor
      // pelo publicado ao vivo assim que houver um — daí marcar o override
      // recém-salvo como o baseline "ao vivo" atual (ver o efeito acima).
      lastLiveInputsRef.current = savedInputs;
      setSemesterPreview((current) => current.filter((computation) => computation.month !== month));
      await loadHistory();
      setStatus(`${monthName(month)}/${year} salvo com sucesso.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar.");
      setStatusError(true);
    } finally {
      setBusy(false);
    }
  }

  async function editHistoryCell(indicatorKey: string, periodMonth: number) {
    const indicator = SC_INDICATORS.find((item) => item.key === indicatorKey);
    if (!indicator || busy) return;

    const currentComputation = effectiveByMonth.get(periodMonth);
    const currentValue = currentComputation?.values[indicatorKey] ?? null;
    const input = window.prompt(
      `${indicator.label} — ${monthName(periodMonth)}/${year}\nMeta: ${indicator.direction === "lower" ? "≤" : "≥"} ${indicator.meta}${indicator.unit}\n\nDigite o novo resultado. Deixe em branco para restaurar o valor publicado do módulo:`,
      currentValue === null ? "" : String(currentValue).replace(".", ","),
    );

    if (input === null) return;

    const trimmed = input.trim();
    const parsed = trimmed === "" ? null : Number(trimmed.replace(",", "."));
    if (parsed !== null && !Number.isFinite(parsed)) {
      setStatus("Digite um valor numérico válido.");
      setStatusError(true);
      return;
    }

    const baseValues = currentComputation?.values ?? {};
    const overrides: Record<string, number | null> = {};

    for (const item of SC_INDICATORS) {
      if (item.key === indicatorKey) continue;
      const value = baseValues[item.key];
      if (typeof value === "number" && Number.isFinite(value)) {
        overrides[item.key] = value;
      }
    }

    if (parsed !== null) overrides[indicatorKey] = parsed;

    setBusy(true);
    setStatus(null);
    setStatusError(false);

    try {
      const response = await fetch("/api/scorecard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          month: periodMonth,
          overrides,
        }),
      });

      if (!response.ok) throw new Error("Não foi possível atualizar o valor do histórico.");

      const saved = (await response.json()) as Computation;
      setHistory((current) =>
        [...current.filter((computation) => computation.month !== periodMonth), saved].sort(
          (a, b) => a.month - b.month,
        ),
      );
      setSemesterPreview((current) =>
        current.filter((computation) => computation.month !== periodMonth),
      );

      if (periodMonth === month) {
        const savedInputs = inputsFromValues(saved.values);
        setData(saved);
        setInputs(savedInputs);
        lastLiveInputsRef.current = savedInputs;
      }

      setStatus(
        `${indicator.label} de ${monthName(periodMonth)}/${year} atualizado sem trocar o mês selecionado.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao atualizar o histórico.");
      setStatusError(true);
    } finally {
      setBusy(false);
    }
  }

  const selectedRows = displayedResult.rows;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-neutralbrand/25 bg-canvas px-4 py-4 shadow-sm sm:px-6">
        <div>
          <label
            className="mb-1 block text-xs font-bold uppercase tracking-wide text-neutralbrand"
            htmlFor="scMonth"
          >
            Mês do snapshot
          </label>
          <select
            id="scMonth"
            value={month}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setMonth(Number(event.target.value))
            }
            className="min-w-40 rounded-lg border border-neutralbrand/40 bg-white px-3 py-2 text-sm font-semibold text-brand outline-none focus:border-brand"
          >
            {SCORECARD_PERIOD_MONTHS.map((periodMonth) => (
              <option key={periodMonth} value={periodMonth}>
                {monthName(periodMonth)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-bold uppercase tracking-wide text-neutralbrand"
            htmlFor="scYear"
          >
            Ano
          </label>
          <input
            id="scYear"
            type="number"
            value={year}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setYear(Number(event.target.value))}
            className="w-28 rounded-lg border border-neutralbrand/40 bg-white px-3 py-2 text-sm font-semibold text-brand outline-none focus:border-brand"
          />
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-dark disabled:opacity-40"
        >
          Salvar snapshot
        </button>

        <div className="flex items-center gap-1.5 text-xs font-semibold text-neutralbrand">
          <span
            className={`h-2 w-2 rounded-full ${busy ? "animate-pulse bg-accent" : "bg-success"}`}
            aria-hidden
          />
          {busy
            ? "Sincronizando…"
            : lastSyncedAt
              ? `Ao vivo · atualizado às ${lastSyncedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
              : "Ao vivo"}
        </div>

        <div className="ml-auto">
          <ExportButtons
            fileName={`scorecard-${year}-${String(month).padStart(2, "0")}`}
            title="Scorecard — Resultado mensal"
            subtitle={`${monthName(month)}/${year} · ${formatPoints(displayedResult.totalPontos)} de ${formatPoints(SCORECARD_MONTHLY_POOL)} pontos`}
            orientation="landscape"
            rows={selectedRows}
            columns={[
              { header: "Indicador", value: (row) => row.label },
              { header: "Peso (%)", value: (row) => row.peso.toFixed(2) },
              { header: "Meta", value: (row) => targetLabel(row) },
              { header: "Resultado", value: (row) => formatValue(row.value, row.unit) },
              { header: "Pontos possíveis", value: (row) => formatPoints(row.pontosPossiveis) },
              { header: "Pontos realizados", value: (row) => formatPoints(row.pontos) },
              {
                header: "Situação",
                value: (row) =>
                  !row.hasValue ? "Sem dados" : row.pass ? "Dentro da meta" : "Fora da meta",
              },
            ]}
          />
        </div>
      </section>

      {status ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${statusError ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}
        >
          {status}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Pontos do mês"
          value={formatPoints(displayedResult.totalPontos)}
          sub={`de ${formatPoints(SCORECARD_MONTHLY_POOL)}`}
          accent
        />
        <MetricCard
          label="Atendimento mensal"
          value={`${displayedResult.atendimentoMes.toFixed(2)}%`}
          sub={`${selectedRows.filter((row) => row.pass).length} indicadores na meta`}
        />
        <MetricCard
          label="Pontuação prevista — Semestre"
          value={formatPoints(SCORECARD_MAX_POINTS)}
          sub="Meta total dos 6 meses"
        />
        <MetricCard
          label="Pontuação prevista — Período"
          value={formatPoints(semesterPontuacaoPrevista)}
          sub={`Meta dos ${availableMonthsCount} mês(es) com dados`}
        />
        <MetricCard
          label="Pontos no ciclo"
          value={formatPoints(semesterPoints)}
          sub="Realizado acumulado no período"
          accent
        />
        <MetricCard
          label="Atendimento do ciclo"
          value={`${semesterAttendance.toFixed(2)}%`}
          sub={`sobre ${formatPoints(semesterPontuacaoPrevista)} pontos do período`}
        />
        <MetricCard
          label="Meses disponíveis"
          value={String(availableMonthsCount)}
          sub={`de ${SCORECARD_PERIOD_MONTHS.length}`}
        />
      </div>

      <section className="rounded-2xl border border-neutralbrand/25 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-brand-dark">Indicadores do mês</h3>
            <p className="mt-1 text-xs text-neutralbrand">
              O valor é atualizado automaticamente a partir do módulo de origem. O campo pode ser
              editado para um ajuste manual antes de salvar; sem edição, ele acompanha o valor
              publicado em tempo real.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-neutralbrand/20">
          <table className="min-w-[1050px] w-full text-sm">
            <thead className="bg-[#EEF1F6] text-left text-[11px] font-bold uppercase tracking-wide text-brand-dark">
              <tr>
                <th className="px-3 py-3">Indicador</th>
                <th className="px-3 py-3 text-right">Peso</th>
                <th className="px-3 py-3 text-right">Meta</th>
                <th className="px-3 py-3 text-right">Origem publicada</th>
                <th className="px-3 py-3">Resultado / ajuste</th>
                <th className="px-3 py-3 text-right">Pontos possíveis</th>
                <th className="px-3 py-3 text-right">Pontos realizados</th>
                <th className="px-3 py-3">Situação</th>
              </tr>
            </thead>
            <tbody>
              {selectedRows.map((row) => (
                <tr
                  key={row.key}
                  className="border-t border-neutralbrand/15 align-middle hover:bg-canvas/60"
                >
                  <td className="px-3 py-3">
                    <div className="font-bold text-brand-dark">{row.label}</div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-wide text-neutralbrand">
                      {SC_INDICATORS.find((indicator) => indicator.key === row.key)?.source
                        ?.module ?? "Manual"}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold">{row.peso.toFixed(2)}%</td>
                  <td className="px-3 py-3 text-right font-semibold">{targetLabel(row)}</td>
                  <td className="px-3 py-3 text-right text-neutralbrand">
                    {formatValue(
                      data?.sourceValues?.[row.key] ?? data?.values[row.key] ?? null,
                      row.unit,
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Sem resultado"
                      value={inputs[row.key] ?? ""}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setInputs((current) => ({
                          ...current,
                          [row.key]: event.target.value,
                        }))
                      }
                      className="w-32 rounded-lg border border-neutralbrand/40 px-3 py-2 text-sm font-semibold outline-none focus:border-brand"
                    />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatPoints(row.pontosPossiveis)}
                  </td>
                  <td
                    className={`px-3 py-3 text-right font-extrabold tabular-nums ${row.pass ? "text-success" : "text-neutralbrand"}`}
                  >
                    {formatPoints(row.pontos)}
                  </td>
                  <td className="px-3 py-3">
                    {row.hasValue ? (
                      <StatusBadge ok={row.pass}>
                        {row.pass ? "Dentro da meta" : "Fora da meta"}
                      </StatusBadge>
                    ) : (
                      <span className="rounded-full bg-neutralbrand/10 px-2.5 py-1 text-xs font-bold text-neutralbrand">
                        Sem dados
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-brand/20 bg-canvas font-extrabold text-brand-dark">
              <tr>
                <td className="px-3 py-3" colSpan={5}>
                  Total do mês
                </td>
                <td className="px-3 py-3 text-right">{formatPoints(SCORECARD_MONTHLY_POOL)}</td>
                <td className="px-3 py-3 text-right text-accent">
                  {formatPoints(displayedResult.totalPontos)}
                </td>
                <td className="px-3 py-3">{displayedResult.atendimentoMes.toFixed(2)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-neutralbrand/25 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-brand-dark">
              Histórico do ciclo — indicador por mês
            </h3>
            <p className="mt-1 text-xs text-neutralbrand">
              O farol usa a meta de cada indicador. Clique nele para editar somente aquele indicador
              e mês, sem trocar o snapshot aberto acima.
            </p>
          </div>
          <ExportButtons
            fileName={`scorecard-historico-${year}`}
            title={`Scorecard ${year} — Histórico de junho a novembro`}
            subtitle={`${formatPoints(semesterPoints)} de ${SCORECARD_MAX_POINTS.toLocaleString("pt-BR")} pontos`}
            orientation="landscape"
            rows={historyExportRows}
            columns={[
              { header: "Indicador", value: (row) => row.indicador },
              { header: "Peso", value: (row) => row.peso },
              { header: "Meta", value: (row) => row.meta },
              { header: "Junho", value: (row) => row.junho },
              { header: "Julho", value: (row) => row.julho },
              { header: "Agosto", value: (row) => row.agosto },
              { header: "Setembro", value: (row) => row.setembro },
              { header: "Outubro", value: (row) => row.outubro },
              { header: "Novembro", value: (row) => row.novembro },
              { header: "Média", value: (row) => row.media },
              { header: "Pontos", value: (row) => row.pontos },
              { header: "Situação", value: (row) => row.situacao },
            ]}
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-neutralbrand/20">
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-[#EEF1F6] text-left text-[11px] font-bold uppercase tracking-wide text-brand-dark">
              <tr>
                <th className="px-3 py-3">Indicador</th>
                <th className="px-3 py-3 text-right">Peso</th>
                <th className="px-3 py-3 text-right">Meta</th>
                {SCORECARD_PERIOD_MONTHS.map((periodMonth) => (
                  <th key={periodMonth} className="px-3 py-3 text-center">
                    {monthName(periodMonth).slice(0, 3)}
                  </th>
                ))}
                <th className="px-3 py-3 text-right">Média</th>
                <th className="px-3 py-3 text-right">Pontos</th>
                <th className="px-3 py-3">Situação</th>
              </tr>
            </thead>
            <tbody>
              {SC_INDICATORS.map((indicator) => {
                const rows = SCORECARD_PERIOD_MONTHS.map((periodMonth) =>
                  resultRow(effectiveByMonth.get(periodMonth), indicator.key),
                );
                const values = rows
                  .filter((row): row is ScorecardRow => Boolean(row?.hasValue))
                  .map((row) => row.value as number);
                const mean = average(values);
                const points = rows.reduce((sum, row) => sum + (row?.pontos ?? 0), 0);
                const maxPoints = (indicator.peso / 100) * SCORECARD_MAX_POINTS;
                const partialPass =
                  mean === null
                    ? null
                    : indicator.direction === "lower"
                      ? mean <= indicator.meta
                      : mean >= indicator.meta;

                return (
                  <tr
                    key={indicator.key}
                    className="border-t border-neutralbrand/15 hover:bg-canvas/60"
                  >
                    <td className="px-3 py-3 font-bold text-brand-dark">{indicator.label}</td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {indicator.peso.toFixed(2)}%
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {indicator.direction === "lower" ? "≤" : "≥"} {indicator.meta}
                      {indicator.unit}
                    </td>
                    {rows.map((row, index) => {
                      const periodMonth = SCORECARD_PERIOD_MONTHS[index];
                      if (periodMonth === undefined) return null;
                      return (
                        <td key={periodMonth} className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => void editHistoryCell(indicator.key, periodMonth)}
                            disabled={busy}
                            className={`inline-flex min-w-20 items-center justify-center gap-2 rounded-lg border px-2 py-2 text-xs font-bold transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60 ${
                              !row?.hasValue
                                ? "border-neutralbrand/20 bg-neutralbrand/5 text-neutralbrand"
                                : row.pass
                                  ? "border-green-200 bg-green-50 text-green-700"
                                  : "border-red-200 bg-red-50 text-red-700"
                            }`}
                            title={`Editar ${indicator.label} de ${monthName(periodMonth)}/${year}`}
                          >
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${!row?.hasValue ? "bg-neutralbrand/40" : row.pass ? "bg-success" : "bg-red-600"}`}
                            />
                            {row?.hasValue ? formatValue(row.value, row.unit) : "—"}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-right font-semibold">
                      {formatValue(mean, indicator.unit)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="font-extrabold text-brand-dark">{formatPoints(points)}</div>
                      <div className="text-[10px] text-neutralbrand">
                        de {formatPoints(maxPoints)}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {partialPass === null ? (
                        <span className="text-xs font-semibold text-neutralbrand">Sem dados</span>
                      ) : (
                        <StatusBadge ok={partialPass}>
                          {partialPass ? "Dentro da meta" : "Fora da meta"}
                        </StatusBadge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-brand/20 bg-canvas font-extrabold text-brand-dark">
              <tr>
                <td className="px-3 py-3" colSpan={3}>
                  Pontuação mensal
                </td>
                {SCORECARD_PERIOD_MONTHS.map((periodMonth) => (
                  <td key={periodMonth} className="px-3 py-3 text-center tabular-nums">
                    {formatPoints(effectiveByMonth.get(periodMonth)?.result.totalPontos ?? 0)}
                  </td>
                ))}
                <td className="px-3 py-3 text-right">—</td>
                <td className="px-3 py-3 text-right text-accent">{formatPoints(semesterPoints)}</td>
                <td className="px-3 py-3">{semesterAttendance.toFixed(2)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-brand">
          <strong>Regra de pontuação:</strong> cada mês disponibiliza{" "}
          {formatPoints(SCORECARD_MONTHLY_POOL)} pontos. O peso define a parcela de cada indicador.
          Meta cumprida recebe 100% da parcela; meta não cumprida ou sem resultado recebe zero.
        </div>
      </section>
    </div>
  );
}
