"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, RotateCw, Save, Trash2 } from "lucide-react";

import { ExportButtons } from "@/components/exports/ExportButtons";
import { PublicationPeriodField } from "@/components/admin/PublicationPeriodField";
import {
  joinWithAnd,
  nextWorkingPeriod,
  usePublicationPeriodOptions,
} from "@/components/admin/usePublicationPeriodOptions";
import { MetricCard } from "@/components/indicators/MetricCard";
import { StatusBadge } from "@/components/indicators/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  cycleFromYearSemester,
  useReadingContextCycle,
} from "@/components/layout/useReadingContextCycle";
import type { ReadingSemester } from "@/components/layout/ReadingContextCard";
import { ToolbarSlotContent } from "@/components/layout/ToolbarSlot";
import { computeScorecard } from "@/features/scorecard/calculations";
import {
  SC_INDICATORS,
  SCORECARD_MAX_POINTS,
  SCORECARD_MONTHLY_POOL,
  type ScorecardResult,
  type ScorecardRow,
} from "@/features/scorecard/types";
import {
  exportScorecardConsolidatedPdf,
  type ScorecardConsolidatedModules,
} from "@/features/scorecard/exports/pdf";
import type { RdoResult } from "@/features/rdo/types";
import type { IdpDetailedResult } from "@/features/idp/types";
import type { RncResult } from "@/features/rnc/types";
import type { FiveSResult } from "@/features/cinco-s/types";
import type { AccidentRateResult } from "@/features/taxa-acidentes/types";
import { MONTH_NAMES } from "@/lib/dates";
import { notifyIndicatorDataChanged } from "@/lib/browser-events";
import {
  enumeratePeriodMonths,
  formatPeriodOptionLabel,
  formatPeriodRangeLabel,
  periodToOptionalFields,
  type PeriodRange,
} from "@/lib/period";

/** Formas mínimas das respostas de cada módulo — só os campos usados para
    montar o PDF consolidado do Scorecard. */
interface RdoModuleResponse {
  total: number;
  threshold: number;
  result: RdoResult;
}
interface IdpModuleResponse {
  total: number;
  result: IdpDetailedResult;
}
interface RncModuleResponse {
  total: number;
  result: RncResult;
}
interface FiveSModuleResponse {
  total: number;
  result: FiveSResult;
}
interface AccidentModuleResponse {
  monthly: unknown[];
  result: AccidentRateResult | null;
}

interface Computation {
  year: number;
  month: number;
  sourceValues?: Record<string, number | null>;
  values: Record<string, number | null>;
  result: ScorecardResult;
}

interface HistoryResponse {
  snapshots: Computation[];
}

interface HistoryExportRow {
  indicador: string;
  peso: string;
  meta: string;
  meses: string[];
  media: string;
  pontos: string;
  situacao: string;
}

function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? `Mês ${month}`;
}

function monthColumnLabel(year: number, month: number): string {
  return `${monthName(month).slice(0, 3)}/${String(year).slice(2)}`;
}

/** Mês de referência do ciclo: sempre o fim do intervalo do filtro de Período. */
function endOfRange(range: PeriodRange): { year: number; month: number } {
  return { year: range.endYear, month: range.endMonth };
}

function formatPoints(value: number, digits = 2): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatValue(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (unit === "dias") return `${Math.round(value)}`;
  const formatted = value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted}${unit}`;
}

function resultRow(computation: Computation | undefined, key: string): ScorecardRow | undefined {
  return computation?.result.rows.find((row) => row.key === key);
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

const LIVE_REFRESH_INTERVAL_MS = 30_000;

export function ScorecardView({
  canClearHistory,
  initialPeriod,
}: {
  canClearHistory: boolean;
  /** Período salvo (Administração) na última vez que alguém o alterou; `null` = nunca foi salvo. */
  initialPeriod: PeriodRange | null;
}) {
  // Período travado de Ano + Semestre, igual aos demais painéis de
  // Administração (RDO/IDP/RNC/5S/Taxa) — substitui o antigo filtro livre de
  // "De/Até", que permitia recortes fora dos 6 meses de um ciclo e quebrava a
  // premissa de pontuação do Scorecard (SCORECARD_MONTHLY_POOL × 6 meses).
  const {
    year: cycleYear,
    semester: cycleSemester,
    cycle: cycleRange,
    setPeriod: setCyclePeriod,
  } = useReadingContextCycle(initialPeriod);
  // Mês de referência para "Salvar snapshot": sempre o fim do intervalo do
  // ciclo travado — não existe mais um seletor independente, para não haver
  // dois controles de período divergentes.
  const { year, month } = useMemo(() => endOfRange(cycleRange), [cycleRange]);
  const cycleMonths = useMemo(() => enumeratePeriodMonths(cycleRange), [cycleRange]);
  const { availablePeriods, periodOptions } = usePublicationPeriodOptions(
    "scorecard",
    cycleYear,
    cycleSemester,
  );
  const [data, setData] = useState<Computation | null>(null);
  const [history, setHistory] = useState<Computation[]>([]);
  const [semesterPreview, setSemesterPreview] = useState<Computation[]>([]);
  const [busy, setBusy] = useState(false);
  /** Estado próprio, separado de `busy` — igual ao `exporting` do PDF dos
      painéis publicados — para o botão do toolbar não ficar preso a outras
      ações administrativas (Recalcular/Salvar) nem exibir o rótulo errado. */
  const [pdfBusy, setPdfBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const currentRequestId = useRef(0);
  const previousPeriodKeyRef = useRef<string | null>(null);

  const loadHistory = useCallback(async () => {
    const params = new URLSearchParams(
      Object.fromEntries(
        Object.entries(periodToOptionalFields(cycleRange)).map(([key, value]) => [
          key,
          String(value),
        ]),
      ),
    );
    const response = await fetch(`/api/scorecard/history?${params.toString()}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Não foi possível carregar o histórico.");
    const payload = (await response.json()) as HistoryResponse;
    setHistory(payload.snapshots);
  }, [cycleRange]);

  const fetchSemesterComputations = useCallback(async () => {
    const responses = await Promise.all(
      cycleMonths.map(({ year: cmYear, month: cmMonth }) =>
        fetch(`/api/scorecard?year=${cmYear}&month=${cmMonth}`, {
          cache: "no-store",
        }),
      ),
    );

    if (responses.some((response) => !response.ok)) {
      throw new Error("Não foi possível carregar os indicadores do ciclo.");
    }

    return Promise.all(responses.map((response) => response.json() as Promise<Computation>));
  }, [cycleMonths]);

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

  // Mantém o snapshot exibido em sincronia com o valor ao vivo do mês
  // selecionado (fim do período filtrado). Os dados vêm sempre do módulo de
  // origem ou do snapshot salvo — não há mais edição manual no cliente.
  useEffect(() => {
    const current =
      semesterPreview.find(
        (computation) => computation.year === year && computation.month === month,
      ) ?? null;
    const currentPeriodKey = periodKey(year, month);
    const periodChanged = previousPeriodKeyRef.current !== currentPeriodKey;
    previousPeriodKeyRef.current = currentPeriodKey;

    // Sem entrada ao vivo para o mês selecionado e o período não mudou: o
    // salvamento (ver save()) removeu esse mês da prévia de propósito, para
    // não sobrepor o snapshot recém-salvo com um valor ao vivo desatualizado.
    // O próximo ciclo de sincronização o repõe.
    if (!current && !periodChanged) return;

    setData(current);
  }, [month, year, semesterPreview]);

  const displayedValues = useMemo(() => data?.values ?? {}, [data?.values]);

  const displayedResult = useMemo(() => computeScorecard(displayedValues), [displayedValues]);

  const effectiveByPeriod = useMemo(() => {
    const map = new Map<string, Computation>();
    const historyByMonth = new Map(
      history.map((computation) => [periodKey(computation.year, computation.month), computation]),
    );
    const previewByMonth = new Map(
      semesterPreview.map((computation) => [
        periodKey(computation.year, computation.month),
        computation,
      ]),
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

    for (const cm of cycleMonths) {
      const key = periodKey(cm.year, cm.month);
      const saved = historyByMonth.get(key);
      const preview = previewByMonth.get(key);
      if (!saved && !preview) continue;

      const mergedValues = mergeWithSavedFallback(preview?.values ?? {}, saved);
      if (!hasRealValue(mergedValues)) continue;

      map.set(key, {
        year: cm.year,
        month: cm.month,
        values: mergedValues,
        result: computeScorecard(mergedValues),
      });
    }

    const selectedKey = periodKey(year, month);
    if (data && data.year === year && data.month === month) {
      const mergedValues = mergeWithSavedFallback(displayedValues, historyByMonth.get(selectedKey));
      if (hasRealValue(mergedValues)) {
        map.set(selectedKey, {
          year: data.year,
          month: data.month,
          values: mergedValues,
          result: computeScorecard(mergedValues),
        });
      } else {
        map.delete(selectedKey);
      }
    }

    return map;
  }, [cycleMonths, data, displayedValues, history, month, semesterPreview, year]);

  const semesterPoints = useMemo(
    () =>
      cycleMonths.reduce(
        (sum, cm) =>
          sum + (effectiveByPeriod.get(periodKey(cm.year, cm.month))?.result.totalPontos ?? 0),
        0,
      ),
    [cycleMonths, effectiveByPeriod],
  );

  // Só os meses com snapshot/preview disponível entram na meta do período —
  // o mês corrente do calendário nunca é usado para inferir disponibilidade.
  const availableMonthsCount = effectiveByPeriod.size;
  const semesterPontuacaoPrevista = availableMonthsCount * SCORECARD_MONTHLY_POOL;
  const semesterAttendance =
    semesterPontuacaoPrevista > 0 ? (semesterPoints / semesterPontuacaoPrevista) * 100 : 0;

  const historyExportRows = useMemo<HistoryExportRow[]>(() => {
    return SC_INDICATORS.map((indicator) => {
      const monthRows = cycleMonths.map((cm) =>
        resultRow(effectiveByPeriod.get(periodKey(cm.year, cm.month)), indicator.key),
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
        meses: monthRows.map((monthRow) =>
          monthRow?.hasValue ? formatValue(monthRow.value, monthRow.unit) : "—",
        ),
        media: mean === null ? "—" : formatValue(mean, indicator.unit),
        pontos: formatPoints(points),
        situacao: pass === null ? "Sem dados" : pass ? "Dentro da meta" : "Fora da meta",
      };

      return row;
    });
  }, [cycleMonths, effectiveByPeriod]);

  // Persiste a escolha de Período no servidor, para que ela sobreviva a um
  // recarregamento e seja o mesmo período usado pelo Painel Geral — em vez de
  // ficar só na memória do navegador e voltar ao ciclo padrão a cada F5.
  function updateCyclePeriod(nextYear: number, nextSemester: ReadingSemester) {
    setCyclePeriod(nextYear, nextSemester);
    void fetch("/api/scorecard/panel-period", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cycleFromYearSemester(nextYear, nextSemester)),
    }).catch(() => {
      // Falha silenciosa: o filtro continua funcionando nesta sessão: só a
      // persistência entre sessões é que não é garantida nesse caso.
    });
  }

  function prepareNextSemester() {
    const next = nextWorkingPeriod(cycleYear, cycleSemester);
    updateCyclePeriod(next.year, next.semester);
    setStatus(
      `Período de trabalho preparado: ${formatPeriodOptionLabel(next.year, next.semester)} · Sem dados.`,
    );
    setStatusError(false);
  }

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
      notifyIndicatorDataChanged();
      setData(saved);
      setSemesterPreview((current) =>
        current.filter((computation) => computation.year !== year || computation.month !== month),
      );
      await loadHistory();
      setStatus(`${monthName(month)}/${year} salvo com sucesso.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar.");
      setStatusError(true);
    } finally {
      setBusy(false);
    }
  }

  async function clearCycleHistory() {
    const cycleLabel = formatPeriodRangeLabel(cycleRange);
    const confirmed = window.confirm(
      `Limpar os snapshots salvos do ciclo ${cycleLabel}?\n\nOs dados publicados nos indicadores de origem serão preservados e continuarão disponíveis na leitura ao vivo.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setStatus(null);
    setStatusError(false);

    try {
      const params = new URLSearchParams(
        Object.fromEntries(
          Object.entries(periodToOptionalFields(cycleRange)).map(([key, value]) => [
            key,
            String(value),
          ]),
        ),
      );
      const response = await fetch(`/api/scorecard/history?${params.toString()}`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => ({}))) as {
        deleted?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "Não foi possível limpar o histórico do ciclo.");
      }

      notifyIndicatorDataChanged();
      await loadHistory();
      const deleted = body.deleted ?? 0;
      setStatus(
        deleted
          ? `${deleted} snapshot(s) removido(s) do ciclo ${cycleLabel}. Os valores publicados permanecem ao vivo.`
          : `O ciclo ${cycleLabel} não possui snapshots salvos para remover.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao limpar o histórico do ciclo.");
      setStatusError(true);
    } finally {
      setBusy(false);
    }
  }

  /** Diferente do "Baixar PDF" dos outros módulos (que exporta só a tabela do
      próprio módulo): este junta o Scorecard e, logo abaixo, uma seção por
      módulo de origem com dado neste período, tudo em um único arquivo PDF —
      busca cada módulo pela própria API, escopada no mesmo período de
      trabalho selecionado aqui, exatamente como cada aba faria sozinha. */
  async function downloadConsolidatedPdf() {
    setPdfBusy(true);
    setStatus(null);
    setStatusError(false);
    try {
      const params = new URLSearchParams(
        Object.fromEntries(
          Object.entries(periodToOptionalFields(cycleRange)).map(([key, value]) => [
            key,
            String(value),
          ]),
        ),
      );
      const suffix = params.toString();

      const [rdoRes, idpRes, rncRes, fiveSRes, accidentsRes] = await Promise.all([
        fetch(`/api/rdo?${suffix}`, { cache: "no-store" }),
        fetch(`/api/idp?${suffix}`, { cache: "no-store" }),
        fetch(`/api/rnc?${suffix}`, { cache: "no-store" }),
        fetch(`/api/cinco-s?${suffix}`, { cache: "no-store" }),
        fetch(`/api/taxa-acidentes?${suffix}`, { cache: "no-store" }),
      ]);

      const [rdoBody, idpBody, rncBody, fiveSBody, accidentsBody] = await Promise.all([
        rdoRes.ok ? ((await rdoRes.json()) as RdoModuleResponse) : null,
        idpRes.ok ? ((await idpRes.json()) as IdpModuleResponse) : null,
        rncRes.ok ? ((await rncRes.json()) as RncModuleResponse) : null,
        fiveSRes.ok ? ((await fiveSRes.json()) as FiveSModuleResponse) : null,
        accidentsRes.ok ? ((await accidentsRes.json()) as AccidentModuleResponse) : null,
      ]);

      const modules: ScorecardConsolidatedModules = {
        rdo:
          rdoBody && rdoBody.total > 0
            ? { result: rdoBody.result, thresholdPercent: rdoBody.threshold * 100 }
            : null,
        idp: idpBody && idpBody.result.activeDocuments > 0 ? { result: idpBody.result } : null,
        rnc: rncBody && rncBody.total > 0 ? { result: rncBody.result } : null,
        fiveS:
          fiveSBody && fiveSBody.result.unitMonths.length > 0 ? { result: fiveSBody.result } : null,
        accidents:
          accidentsBody?.result && accidentsBody.monthly.length > 0
            ? { result: accidentsBody.result }
            : null,
      };

      exportScorecardConsolidatedPdf(
        {
          cycleRange,
          monthColumnLabels: cycleMonths.map((cm) => monthColumnLabel(cm.year, cm.month)),
          rows: historyExportRows,
          semesterPoints,
          semesterPontuacaoPrevista,
          semesterAttendance,
          scorecardMaxPoints: SCORECARD_MAX_POINTS,
        },
        modules,
      );

      const includedCount = Object.values(modules).filter(Boolean).length;
      setStatus(
        includedCount
          ? `PDF consolidado gerado: Scorecard + ${includedCount} módulo(s) com dado neste período.`
          : "PDF consolidado gerado apenas com o Scorecard — nenhum módulo de origem tem dado publicado neste período.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao gerar o PDF consolidado.");
      setStatusError(true);
    } finally {
      setPdfBusy(false);
    }
  }

  const presentWorkingMonths = useMemo(
    () => cycleMonths.filter((cm) => effectiveByPeriod.has(periodKey(cm.year, cm.month))),
    [cycleMonths, effectiveByPeriod],
  );
  const missingWorkingMonths = useMemo(
    () => cycleMonths.filter((cm) => !effectiveByPeriod.has(periodKey(cm.year, cm.month))),
    [cycleMonths, effectiveByPeriod],
  );

  const selectedRows = displayedResult.rows;

  return (
    <div className="space-y-6">
      {/* Botão injetado na barra de navegação (ao lado do alternador
          Painel/Administração), no mesmo lugar em que cada painel publicado
          já coloca seu "Exportar PDF" — ver ToolbarSlot. Diferente dos
          outros, este é acionado da própria Administração, porque o PDF
          consolidado depende do período de trabalho e da meta configurados
          aqui, não do que está publicado. */}
      <ToolbarSlotContent>
        <button
          type="button"
          disabled={pdfBusy}
          onClick={() => void downloadConsolidatedPdf()}
          className="flex h-[42px] items-center gap-1.5 rounded-[12px] border border-border bg-background px-3.5 text-[15px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:cursor-wait disabled:opacity-60"
          title="Gera um único PDF com o Scorecard e, abaixo, uma seção por módulo de origem com dado neste período."
        >
          <Download className="size-4" />
          {pdfBusy ? "Gerando PDF…" : "Baixar PDF consolidado"}
        </button>
      </ToolbarSlotContent>

      <Card className="p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Contexto de publicação</CardTitle>
              <CardDescription>
                Defina o período de trabalho e as ações aplicadas ao cálculo e ao snapshot do
                Scorecard.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">
                {cycleYear} {cycleSemester}
              </Badge>
              <Badge
                variant={presentWorkingMonths.length === cycleMonths.length ? "success" : "outline"}
              >
                {presentWorkingMonths.length}/{cycleMonths.length} meses
              </Badge>
            </div>
          </div>

          <PublicationPeriodField
            fieldId="scorecardPeriodSelect"
            year={cycleYear}
            semester={cycleSemester}
            onChange={updateCyclePeriod}
            periodOptions={periodOptions}
            availablePeriods={availablePeriods}
            publishPeriod={cycleRange}
            onPrepareNextSemester={prepareNextSemester}
          >
            <p className="text-xs text-neutralbrand">
              &quot;Salvar snapshot&quot; sempre usa o mês final deste período (
              {monthName(month)}/{year}).{" "}
              {presentWorkingMonths.length
                ? `${presentWorkingMonths.length} de ${cycleMonths.length} meses com dados · Meses disponíveis: ${joinWithAnd(
                    presentWorkingMonths.map((m) => MONTH_NAMES[m.month - 1] ?? String(m.month)),
                  )}${
                    missingWorkingMonths.length
                      ? ` · Faltam: ${joinWithAnd(
                          missingWorkingMonths.map((m) => MONTH_NAMES[m.month - 1] ?? String(m.month)),
                        )}`
                      : ""
                  }`
                : "0 meses com dados neste período."}
            </p>
          </PublicationPeriodField>

          <div className="flex flex-wrap items-center gap-2 border-t border-neutralbrand/15 pt-3">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void refreshLive()}>
              <RotateCw className="size-3.5" />
              Recalcular
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void save()}>
              <Save className="size-3.5" />
              Salvar snapshot
            </Button>
            {canClearHistory ? (
              <Button
                variant="destructive"
                size="sm"
                className="ml-auto"
                disabled={busy}
                onClick={() => void clearCycleHistory()}
              >
                <Trash2 className="size-3.5" />
                Limpar histórico do ciclo
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

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
          sub={`de ${cycleMonths.length}`}
        />
      </div>

      <section className="rounded-2xl border border-neutralbrand/25 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-brand-dark">
              Histórico do ciclo — indicador por mês
            </h3>
            <p className="mt-1 text-xs text-neutralbrand">
              O farol usa a meta de cada indicador. Os valores vêm apenas do banco de dados: o
              publicado ao vivo pelo módulo de origem ou o último snapshot salvo.
            </p>
          </div>
          <ExportButtons
            fileName={`scorecard-historico-${cycleRange.startYear}-${cycleRange.endYear}`}
            title={`Scorecard — Histórico do ciclo ${formatPeriodRangeLabel(cycleRange)}`}
            subtitle={`${formatPoints(semesterPoints)} de ${SCORECARD_MAX_POINTS.toLocaleString("pt-BR")} pontos`}
            orientation="landscape"
            rows={historyExportRows}
            columns={[
              { header: "Indicador", value: (row) => row.indicador },
              { header: "Peso", value: (row) => row.peso },
              { header: "Meta", value: (row) => row.meta },
              ...cycleMonths.map((cm, index) => ({
                header: monthColumnLabel(cm.year, cm.month),
                value: (row: HistoryExportRow) => row.meses[index] ?? "—",
              })),
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
                {cycleMonths.map((cm) => (
                  <th key={periodKey(cm.year, cm.month)} className="px-3 py-3 text-center">
                    {monthColumnLabel(cm.year, cm.month)}
                  </th>
                ))}
                <th className="px-3 py-3 text-right">Média</th>
                <th className="px-3 py-3 text-right">Pontos</th>
                <th className="px-3 py-3">Situação</th>
              </tr>
            </thead>
            <tbody>
              {SC_INDICATORS.map((indicator) => {
                const rows = cycleMonths.map((cm) =>
                  resultRow(effectiveByPeriod.get(periodKey(cm.year, cm.month)), indicator.key),
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
                      const cm = cycleMonths[index];
                      if (!cm) return null;
                      return (
                        <td key={periodKey(cm.year, cm.month)} className="px-2 py-2 text-center">
                          <span
                            className={`inline-flex min-w-20 items-center justify-center gap-2 rounded-lg border px-2 py-2 text-xs font-bold ${
                              !row?.hasValue
                                ? "border-neutralbrand/20 bg-neutralbrand/5 text-neutralbrand"
                                : row.pass
                                  ? "border-green-200 bg-green-50 text-green-700"
                                  : "border-red-200 bg-red-50 text-red-700"
                            }`}
                            title={`${indicator.label} — ${monthName(cm.month)}/${cm.year}`}
                          >
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${!row?.hasValue ? "bg-neutralbrand/40" : row.pass ? "bg-success" : "bg-red-600"}`}
                            />
                            {row?.hasValue ? formatValue(row.value, row.unit) : "—"}
                          </span>
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
                {cycleMonths.map((cm) => (
                  <td
                    key={periodKey(cm.year, cm.month)}
                    className="px-3 py-3 text-center tabular-nums"
                  >
                    {formatPoints(
                      effectiveByPeriod.get(periodKey(cm.year, cm.month))?.result.totalPontos ?? 0,
                    )}
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
