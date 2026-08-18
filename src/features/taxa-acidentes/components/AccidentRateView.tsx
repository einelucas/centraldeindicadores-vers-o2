"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  FilterX,
  Gauge,
  HardHat,
  Pencil,
  RotateCw,
  Save,
  Send,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { ClearRecordsDialog } from "@/components/admin/ClearRecordsDialog";
import { PublicationPeriodField } from "@/components/admin/PublicationPeriodField";
import { UnitExclusionDialog } from "@/components/admin/UnitExclusionDialog";
import {
  joinWithAnd,
  nextWorkingPeriod,
  usePublicationPeriodOptions,
} from "@/components/admin/usePublicationPeriodOptions";
import {
  periodQueryString,
  useReadingContextCycle,
} from "@/components/layout/useReadingContextCycle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ExportButtons } from "@/components/exports/ExportButtons";
import { IndicatorAnalysisDialog } from "@/features/justifications/components/IndicatorAnalysisDialog";
import { MONTH_NAMES } from "@/lib/dates";
import { notifyIndicatorDataChanged } from "@/lib/browser-events";
import {
  enumeratePeriodMonths,
  formatPeriodOptionLabel,
  periodToOptionalFields,
  type PeriodRange,
} from "@/lib/period";
import {
  ACCIDENT_RATE_DEFAULT_TARGET,
  type AccidentMonthlyRecord,
  type AccidentRateResult,
  type AccidentUnitRecord,
} from "@/features/taxa-acidentes/types";
import {
  ACCIDENT_UNITS,
  compareAccidentUnits,
  formatAccidentUnitLabel,
  normalizeAccidentUnitCode,
} from "@/features/taxa-acidentes/utils/units";

interface AccidentRateApiResponse {
  setupRequired?: boolean;
  monthly: AccidentMonthlyRecord[];
  units: AccidentUnitRecord[];
  target: number;
  excludedUnits?: string[];
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
  const [editingMonthId, setEditingMonthId] = useState<string | null>(null);
  const [monthlyFilterYear, setMonthlyFilterYear] = useState("");
  const [monthlyFilterMonth, setMonthlyFilterMonth] = useState("");

  const [unitYear, setUnitYear] = useState(now.getFullYear());
  const [unitMonth, setUnitMonth] = useState(now.getMonth() + 1);
  const [unit, setUnit] = useState("");
  const [unitSaf, setUnitSaf] = useState("");
  const [unitCaf, setUnitCaf] = useState("");
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);

  const [unitFilterYear, setUnitFilterYear] = useState("");
  const [unitFilterMonth, setUnitFilterMonth] = useState("");
  const [unitFilterUnit, setUnitFilterUnit] = useState("");

  const [excludedUnits, setExcludedUnits] = useState<string[]>([]);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [unitDialogBusy, setUnitDialogBusy] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearPeriod, setClearPeriod] = useState<PeriodRange | null>(null);
  /** Período travado (Ano + Semestre) — é sempre o que vai ser publicado. */
  const {
    year: publishYear,
    semester: publishSemester,
    cycle: publishPeriod,
    setPeriod,
  } = useReadingContextCycle();
  /** Filtro de "Consulta": undefined = segue o período de publicação; null =
      Tudo; PeriodRange = recorte específico. Nunca afeta o que é publicado. */
  const [viewFilter, setViewFilter] = useState<PeriodRange | null | undefined>(undefined);
  const effectivePeriod = viewFilter === undefined ? publishPeriod : viewFilter;
  const effectivePeriodKey = effectivePeriod
    ? `${effectivePeriod.startYear}-${effectivePeriod.startMonth}:${effectivePeriod.endYear}-${effectivePeriod.endMonth}`
    : "all";
  const { availablePeriods, periodOptions, loadAvailablePeriods, detectNewPeriod } =
    usePublicationPeriodOptions("taxa-acidentes", publishYear, publishSemester);
  /** Meses do ciclo de PUBLICAÇÃO com dado real — sempre relativo a
      `publishPeriod`, nunca ao filtro de "Detalhar meses", para a cobertura e
      o botão "Publicar" nunca refletirem um período diferente do publicado. */
  const [narrowedCoverageMonths, setNarrowedCoverageMonths] = useState<Set<string> | null>(null);

  const loadCoverage = useCallback(async () => {
    const params = new URLSearchParams(
      Object.fromEntries(
        Object.entries(periodToOptionalFields(publishPeriod)).map(([key, value]) => [
          key,
          String(value),
        ]),
      ),
    );
    const response = await fetch(`/api/taxa-acidentes?${params.toString()}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const body = (await response.json()) as AccidentRateApiResponse;
    setNarrowedCoverageMonths(new Set(body.monthly.map((m) => `${m.year}-${m.month}`)));
  }, [publishPeriod]);

  function prepareNextSemester() {
    const next = nextWorkingPeriod(publishYear, publishSemester);
    setPeriod(next.year, next.semester);
    setMessage(
      `Período de trabalho preparado: ${formatPeriodOptionLabel(next.year, next.semester)} · Sem dados.`,
    );
  }

  const load = useCallback(
    async (nextPeriod = effectivePeriod) => {
      const params = new URLSearchParams(
        Object.fromEntries(
          Object.entries(periodToOptionalFields(nextPeriod)).map(([key, value]) => [
            key,
            String(value),
          ]),
        ),
      );
      const suffix = params.toString();
      const response = await fetch(`/api/taxa-acidentes${suffix ? `?${suffix}` : ""}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw await responseError(response, "Falha ao carregar a Taxa de Acidentes.");
      }
      const body = (await response.json()) as AccidentRateApiResponse;
      setData(body);
      setTarget(String(body.target ?? ACCIDENT_RATE_DEFAULT_TARGET));
      setExcludedUnits(body.excludedUnits ?? []);
    },
    [effectivePeriod],
  );

  const loadPublication = useCallback(async () => {
    const response = await fetch(
      `/api/publicacoes/taxa-acidentes?${periodQueryString(publishPeriod)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const body = (await response.json()) as {
      publication: PublicationSummary | null;
    };
    setPublication(body.publication);
  }, [publishPeriod]);

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePeriodKey]);

  useEffect(() => {
    void loadPublication();
  }, [loadPublication]);

  // "Detalhar meses" pode restringir a tabela a um recorte diferente do
  // período de publicação — nesse caso a cobertura/o botão "Publicar" não
  // podem usar `data` (que segue o filtro), então buscamos separadamente,
  // sempre escopado em `publishPeriod`. Sem filtro ativo, `data` já reflete
  // exatamente o período de publicação e essa busca extra é dispensada.
  useEffect(() => {
    if (viewFilter === undefined) {
      setNarrowedCoverageMonths(null);
      return;
    }
    void loadCoverage();
  }, [viewFilter, loadCoverage]);

  const coverageMonthSet = useMemo(() => {
    if (viewFilter === undefined && data) {
      return new Set(data.monthly.map((m) => `${m.year}-${m.month}`));
    }
    return narrowedCoverageMonths;
  }, [viewFilter, data, narrowedCoverageMonths]);

  const workingMonths = useMemo(() => enumeratePeriodMonths(publishPeriod), [publishPeriod]);
  const presentWorkingMonths = useMemo(
    () => workingMonths.filter((m) => coverageMonthSet?.has(`${m.year}-${m.month}`)),
    [workingMonths, coverageMonthSet],
  );
  const missingWorkingMonths = useMemo(
    () => workingMonths.filter((m) => !coverageMonthSet?.has(`${m.year}-${m.month}`)),
    [workingMonths, coverageMonthSet],
  );
  const coverageKnown = coverageMonthSet !== null;
  const canPublishPeriod = coverageKnown && presentWorkingMonths.length > 0;

  const monthlyFilterYears = useMemo(() => {
    const years = new Set((data?.monthly ?? []).map((row) => row.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [data]);

  const filteredMonthlyRows = useMemo(() => {
    return (data?.monthly ?? []).filter((row) => {
      if (monthlyFilterYear && row.year !== Number(monthlyFilterYear)) return false;
      if (monthlyFilterMonth && row.month !== Number(monthlyFilterMonth)) return false;
      return true;
    });
  }, [data, monthlyFilterMonth, monthlyFilterYear]);

  const monthlyExportRows = useMemo(
    () =>
      filteredMonthlyRows.map((row) => ({
        periodo: periodLabel(row.year, row.month),
        taxa: row.rate,
        caf: row.caf,
      })),
    [filteredMonthlyRows],
  );

  const unitFilterYears = useMemo(() => {
    const years = new Set((data?.units ?? []).map((row) => row.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [data]);

  const periodFilterYears = useMemo(
    () => Array.from(new Set([...monthlyFilterYears, ...unitFilterYears])).sort((a, b) => b - a),
    [monthlyFilterYears, unitFilterYears],
  );

  const unitFilterUnits = useMemo(() => {
    const units = new Set(
      (data?.units ?? []).map((row) => normalizeAccidentUnitCode(row.unit)).filter(Boolean),
    );
    return Array.from(units).sort(compareAccidentUnits);
  }, [data]);

  const unitFormOptions = useMemo(() => {
    const units = new Set(ACCIDENT_UNITS.map((item) => item.code));
    for (const row of data?.units ?? []) {
      const code = normalizeAccidentUnitCode(row.unit);
      if (code) units.add(code);
    }
    return Array.from(units).sort(compareAccidentUnits);
  }, [data]);

  const unitDialogOptions = useMemo(() => {
    const codes = new Set<string>([...unitFormOptions, ...excludedUnits]);
    codes.delete("");
    return Array.from(codes)
      .sort(compareAccidentUnits)
      .map((code) => ({ code, label: formatAccidentUnitLabel(code) }));
  }, [excludedUnits, unitFormOptions]);

  async function saveExcludedUnits(next: string[]) {
    setUnitDialogBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/taxa-acidentes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedUnits: next }),
      });
      if (!response.ok) {
        throw await responseError(response, "Falha ao salvar as unidades ignoradas.");
      }
      setExcludedUnits(next);
      setUnitDialogOpen(false);
      await load();
      setMessage("Unidades ignoradas atualizadas e indicador recalculado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar as unidades ignoradas.");
    } finally {
      setUnitDialogBusy(false);
    }
  }

  const filteredUnitRows = useMemo(() => {
    return (data?.units ?? []).filter((row) => {
      if (unitFilterYear && row.year !== Number(unitFilterYear)) return false;
      if (unitFilterMonth && row.month !== Number(unitFilterMonth)) return false;
      if (
        unitFilterUnit &&
        normalizeAccidentUnitCode(row.unit) !== normalizeAccidentUnitCode(unitFilterUnit)
      ) {
        return false;
      }
      return true;
    });
  }, [data, unitFilterMonth, unitFilterUnit, unitFilterYear]);

  const unitExportRows = useMemo(
    () =>
      filteredUnitRows.map((row) => ({
        periodo: periodLabel(row.year, row.month),
        unidade: formatAccidentUnitLabel(row.unit),
        caf: row.caf,
        saf: row.saf,
      })),
    [filteredUnitRows],
  );

  const hasMonthlyFilters = Boolean(monthlyFilterYear || monthlyFilterMonth);
  const hasUnitFilters = Boolean(unitFilterYear || unitFilterMonth || unitFilterUnit);

  useEffect(() => {
    if (monthlyFilterYear && !monthlyFilterYears.includes(Number(monthlyFilterYear))) {
      setMonthlyFilterYear("");
    }
  }, [monthlyFilterYear, monthlyFilterYears]);

  useEffect(() => {
    if (unitFilterYear && !unitFilterYears.includes(Number(unitFilterYear))) {
      setUnitFilterYear("");
    }
    if (
      unitFilterUnit &&
      !unitFilterUnits.some(
        (item) => normalizeAccidentUnitCode(item) === normalizeAccidentUnitCode(unitFilterUnit),
      )
    ) {
      setUnitFilterUnit("");
    }
  }, [unitFilterUnit, unitFilterUnits, unitFilterYear, unitFilterYears]);

  function clearMonthlyFilters() {
    setMonthlyFilterYear("");
    setMonthlyFilterMonth("");
  }

  function clearUnitFilters() {
    setUnitFilterYear("");
    setUnitFilterMonth("");
    setUnitFilterUnit("");
  }

  function resetMonthForm() {
    setEditingMonthId(null);
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setRate("");
    setCaf("");
  }

  function resetUnitForm() {
    setEditingUnitId(null);
    setUnitYear(now.getFullYear());
    setUnitMonth(now.getMonth() + 1);
    setUnit("");
    setUnitSaf("");
    setUnitCaf("");
  }

  function startMonthEdit(row: AccidentMonthlyRecord) {
    setEditingMonthId(row.id);
    setYear(row.year);
    setMonth(row.month);
    setRate(String(row.rate));
    setCaf(String(row.caf));
    setError(null);
    setMessage(null);
  }

  function startUnitEdit(row: AccidentUnitRecord) {
    setEditingUnitId(row.id);
    setUnitYear(row.year);
    setUnitMonth(row.month);
    setUnit(normalizeAccidentUnitCode(row.unit));
    setUnitSaf(String(row.saf));
    setUnitCaf(String(row.caf));
    setError(null);
    setMessage(null);
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
        {
          type: "month",
          id: editingMonthId ?? undefined,
          year,
          month,
          rate: rateValue,
          caf: cafValue,
        },
        editingMonthId
          ? "Falha ao atualizar o lançamento mensal."
          : "Falha ao salvar o lançamento mensal.",
      );
      const edited = Boolean(editingMonthId);
      let saveMessage = edited ? "Lançamento mensal atualizado." : "Lançamento mensal salvo no Neon.";
      if (!edited) {
        const newPeriodMessage = detectNewPeriod([{ year, month }], setPeriod);
        if (newPeriodMessage) saveMessage += ` ${newPeriodMessage}`;
      }
      resetMonthForm();
      setMessage(saveMessage);
      await load();
      void loadAvailablePeriods();
      notifyIndicatorDataChanged();
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
          id: editingUnitId ?? undefined,
          year: unitYear,
          month: unitMonth,
          unit: normalizeAccidentUnitCode(unit),
          saf: safValue,
          caf: cafValue,
        },
        editingUnitId
          ? "Falha ao atualizar os acidentes da unidade."
          : "Falha ao salvar os acidentes da unidade.",
      );
      await load();
      notifyIndicatorDataChanged();
      const edited = Boolean(editingUnitId);
      resetUnitForm();
      setMessage(
        edited
          ? "Lançamento da unidade atualizado."
          : "Acidentes CAF e SAF da unidade salvos no Neon.",
      );
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
      notifyIndicatorDataChanged();
      setMessage("Registro removido e cálculo administrativo atualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMonth(row: AccidentMonthlyRecord) {
    if (editingMonthId === row.id) resetMonthForm();
    await remove(`/api/taxa-acidentes?kind=month&year=${row.year}&month=${row.month}`);
  }

  async function removeUnit(row: AccidentUnitRecord) {
    if (editingUnitId === row.id) resetUnitForm();
    await remove(`/api/taxa-acidentes?kind=unit&id=${encodeURIComponent(row.id)}`);
  }

  async function publish() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/publicacoes/taxa-acidentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(periodToOptionalFields(publishPeriod)),
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

  function openClearDialog() {
    setClearPeriod(null);
    setClearDialogOpen(true);
  }

  const fetchClearAffectedCount = useCallback(async (period: PeriodRange | null) => {
    const params = new URLSearchParams(
      Object.fromEntries(
        Object.entries(periodToOptionalFields(period)).map(([key, value]) => [key, String(value)]),
      ),
    );
    const response = await fetch(`/api/taxa-acidentes/registros?${params.toString()}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Falha ao calcular os registros afetados.");
    const body = (await response.json()) as { count: number };
    return body.count;
  }, []);

  async function executeClear() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body = clearPeriod
        ? {
            periodStartYear: clearPeriod.startYear,
            periodStartMonth: clearPeriod.startMonth,
            periodEndYear: clearPeriod.endYear,
            periodEndMonth: clearPeriod.endMonth,
          }
        : { all: true as const };
      const response = await fetch("/api/taxa-acidentes/registros", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw await responseError(response, "Falha ao limpar os lançamentos da Taxa de Acidentes.");
      }
      const responseBody = (await response.json()) as { deleted: number };
      notifyIndicatorDataChanged();
      resetMonthForm();
      resetUnitForm();
      setMessage(`${responseBody.deleted} registro(s) removido(s).`);
      setClearDialogOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao limpar a Taxa de Acidentes.");
    } finally {
      setBusy(false);
    }
  }

  if (data?.setupRequired) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/5 px-3.5 py-3 text-sm font-medium text-danger">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>
          Estrutura do banco pendente. Execute{" "}
          <strong className="font-bold">pnpm db:upgrade:accidents</strong> e recarregue esta página.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Contexto de publicação</CardTitle>
              <CardDescription>
                Defina o período de trabalho, a meta e as ações aplicadas ao cálculo e à
                publicação da Taxa de Acidentes.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">
                {publishYear} {publishSemester}
              </Badge>
              <Badge variant={coverageKnown && presentWorkingMonths.length === 6 ? "success" : "outline"}>
                {coverageKnown ? presentWorkingMonths.length : "…"}/6 meses
              </Badge>
              <Badge variant={publication ? "success" : "secondary"}>
                {publication ? "Publicado" : "Rascunho"}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PublicationPeriodField
              fieldId="accidentRatePeriodSelect"
              year={publishYear}
              semester={publishSemester}
              onChange={setPeriod}
              periodOptions={periodOptions}
              availablePeriods={availablePeriods}
              publishPeriod={publishPeriod}
              viewFilter={viewFilter}
              onViewFilterChange={setViewFilter}
              yearsInData={periodFilterYears}
              onPrepareNextSemester={prepareNextSemester}
            >
              <p className="text-xs text-muted-foreground">
                {!coverageKnown
                  ? "Carregando cobertura…"
                  : presentWorkingMonths.length
                    ? `${presentWorkingMonths.length} de 6 meses com dados · Meses disponíveis: ${joinWithAnd(
                        presentWorkingMonths.map((m) => MONTH_NAMES[m.month - 1] ?? String(m.month)),
                      )}${
                        missingWorkingMonths.length
                          ? ` · Faltam: ${joinWithAnd(
                              missingWorkingMonths.map((m) => MONTH_NAMES[m.month - 1] ?? String(m.month)),
                            )}`
                          : ""
                      }`
                    : "0 de 6 meses com dados — lance ao menos um mês deste período para habilitar a publicação."}
              </p>
            </PublicationPeriodField>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="accidentRateTarget">Meta de frequência (≤)</Label>
              <Input
                id="accidentRateTarget"
                type="number"
                min="0"
                step="0.1"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                className="w-28"
              />
              <p className="text-xs text-muted-foreground">
                Usada no cálculo e na publicação de{" "}
                {formatPeriodOptionLabel(publishYear, publishSemester)}.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void saveTarget()}>
              <Save className="size-3.5" />
              Salvar meta
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}>
              <RotateCw className="size-3.5" />
              Recalcular
            </Button>
            <Button variant="outline" size="sm" onClick={() => setUnitDialogOpen(true)}>
              <Ban className="size-3.5" />
              Ignorar unidades
              {excludedUnits.length ? (
                <Badge variant="outline" className="ml-0.5">
                  {excludedUnits.length}
                </Badge>
              ) : null}
            </Button>
            <IndicatorAnalysisDialog
              module="taxa-acidentes"
              moduleLabel="Taxa de Acidentes"
              target={
                Number.isFinite(Number(target)) && Number(target) >= 0
                  ? Number(target)
                  : ACCIDENT_RATE_DEFAULT_TARGET
              }
              targetUnit="absolute"
              years={periodFilterYears}
              defaultYear={data?.result?.latestYear ?? undefined}
              defaultMonth={data?.result?.latestMonth ?? undefined}
            />
            {canClear ? (
              <Button variant="destructive" size="sm" disabled={busy} onClick={openClearDialog}>
                <Trash2 className="size-3.5" />
                Limpar tudo
              </Button>
            ) : null}
            {canPublish ? (
              <Button
                variant="success"
                size="sm"
                className="ml-auto"
                disabled={!canPublishPeriod || busy}
                onClick={() => void publish()}
              >
                <Send className="size-3.5" />
                Publicar {publishYear} {publishSemester}
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <CheckCircle2
          className={cn(
            "size-3.5 shrink-0",
            publication ? "text-success" : "text-muted-foreground",
          )}
        />
        {publication
          ? `Já existe uma publicação ativa para ${publishSemester} ${publishYear} — versão ${publication.version}, publicada em ${new Date(publication.publishedAt).toLocaleString("pt-BR")} por ${publication.publishedBy.name}. Publicar novamente cria uma nova versão para este ciclo.`
          : "Nenhuma versão publicada ainda para este ciclo."}
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/5 px-3.5 py-3 text-sm font-medium text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="flex items-start gap-2 rounded-lg border border-success/25 bg-success/5 px-3.5 py-3 text-sm font-medium text-success">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          {message}
        </div>
      ) : null}

      {data?.result ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <AdminMetricCard
            label="Taxa do período"
            value={data.result.result === null ? "—" : decimal(data.result.result)}
            sub="média de todos os meses carregados"
            icon={Gauge}
          />
          <AdminMetricCard
            label="Acidentes CAF"
            value={String(data.result.totalCaf)}
            sub="total mensal do período"
            icon={AlertTriangle}
          />
          <AdminMetricCard
            label="Acidentes SAF por unidade"
            value={String(data.result.totalSaf)}
            sub="soma dos lançamentos por unidade"
            icon={HardHat}
          />
          <AdminMetricCard
            label="Desempenho do mês"
            value={data.result.latestRate === null ? "—" : decimal(data.result.latestRate)}
            sub="leitura mais recente"
            icon={TrendingUp}
          />
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Taxa de frequência mensal e acidentes CAF</CardTitle>
            <CardDescription>
              Informe a competência, a taxa mensal e a quantidade total de acidentes CAF.
            </CardDescription>
          </div>
          {editingMonthId ? <Badge variant="default">Editando lançamento</Badge> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Ano</Label>
              <Input
                type="number"
                min="2000"
                max="2100"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
                className="w-24"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Mês</Label>
              <Select
                value={month}
                onChange={(event) => setMonth(Number(event.target.value))}
                className="w-36"
              >
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Taxa de frequência</Label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={rate}
                onChange={(event) => setRate(event.target.value)}
                className="w-28"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Acidentes CAF</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={caf}
                onChange={(event) => setCaf(event.target.value)}
                className="w-28"
              />
            </div>
            <Button disabled={busy} onClick={() => void addMonth()}>
              {editingMonthId ? "Salvar alterações" : "Adicionar"}
            </Button>
            {editingMonthId ? (
              <Button variant="outline" disabled={busy} onClick={resetMonthForm}>
                Cancelar edição
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/20 p-3">
            <span className="text-xs font-bold text-foreground">Consultar tabela</span>
            <div className="flex flex-col gap-1.5">
              <Label>Ano</Label>
              <Select
                value={monthlyFilterYear}
                onChange={(event) => setMonthlyFilterYear(event.target.value)}
                className="w-28"
              >
                <option value="">Todos</option>
                {monthlyFilterYears.map((filterYear) => (
                  <option key={filterYear} value={filterYear}>
                    {filterYear}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Mês</Label>
              <Select
                value={monthlyFilterMonth}
                onChange={(event) => setMonthlyFilterMonth(event.target.value)}
                className="w-36"
              >
                <option value="">Todos</option>
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasMonthlyFilters}
              onClick={clearMonthlyFilters}
            >
              <FilterX className="size-3.5" />
              Limpar filtros
            </Button>
            <span className="ml-auto text-xs font-semibold text-muted-foreground">
              {filteredMonthlyRows.length}{" "}
              {filteredMonthlyRows.length === 1 ? "registro" : "registros"}
            </span>
            <ExportButtons
              fileName="taxa-acidentes-por-mes"
              title="Taxa de frequência mensal e acidentes CAF"
              subtitle={
                hasMonthlyFilters ? "Lançamentos mensais filtrados" : "Todos os lançamentos mensais"
              }
              rows={monthlyExportRows}
              columns={[
                { header: "Mês", value: (row) => row.periodo },
                { header: "Taxa de Frequência", value: (row) => row.taxa },
                { header: "Acidentes CAF", value: (row) => row.caf },
              ]}
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Taxa de Frequência</TableHead>
                <TableHead className="text-right">Acidentes CAF</TableHead>
                <TableHead className="w-24 text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMonthlyRows.length ? (
                filteredMonthlyRows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={
                      editingMonthId === row.id ? "bg-primary/5 hover:bg-primary/5" : undefined
                    }
                  >
                    <TableCell className="font-medium">
                      {periodLabel(row.year, row.month)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{decimal(row.rate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.caf}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          disabled={busy}
                          onClick={() => startMonthEdit(row)}
                          aria-label={`Editar ${row.month}/${row.year}`}
                          title="Editar"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon-sm"
                          disabled={busy}
                          onClick={() => void removeMonth(row)}
                          aria-label={`Remover ${row.month}/${row.year}`}
                          title="Excluir"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    {data?.monthly.length
                      ? "Nenhum lançamento encontrado para os filtros selecionados."
                      : "Nenhum mês adicionado ainda."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Acidentes CAF e SAF por unidade</CardTitle>
            <CardDescription>
              Informe a competência e a quantidade de acidentes de cada classificação por unidade.
            </CardDescription>
          </div>
          {editingUnitId ? <Badge variant="default">Editando unidade</Badge> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Ano</Label>
              <Input
                type="number"
                min="2000"
                max="2100"
                value={unitYear}
                onChange={(event) => setUnitYear(Number(event.target.value))}
                className="w-24"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Mês</Label>
              <Select
                value={unitMonth}
                onChange={(event) => setUnitMonth(Number(event.target.value))}
                className="w-36"
              >
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Unidade</Label>
              <Select
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                className="w-56"
              >
                <option value="">Selecione uma unidade</option>
                {unitFormOptions.map((unitCode) => (
                  <option key={unitCode} value={unitCode}>
                    {formatAccidentUnitLabel(unitCode)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Acidentes SAF</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={unitSaf}
                onChange={(event) => setUnitSaf(event.target.value)}
                className="w-28"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Acidentes CAF</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={unitCaf}
                onChange={(event) => setUnitCaf(event.target.value)}
                className="w-28"
              />
            </div>
            <Button disabled={busy} onClick={() => void addUnit()}>
              {editingUnitId ? "Salvar alterações" : "Adicionar"}
            </Button>
            {editingUnitId ? (
              <Button variant="outline" disabled={busy} onClick={resetUnitForm}>
                Cancelar edição
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/20 p-3">
            <span className="text-xs font-bold text-foreground">Consultar tabela</span>
            <div className="flex flex-col gap-1.5">
              <Label>Ano</Label>
              <Select
                value={unitFilterYear}
                onChange={(event) => setUnitFilterYear(event.target.value)}
                className="w-28"
              >
                <option value="">Todos</option>
                {unitFilterYears.map((filterYear) => (
                  <option key={filterYear} value={filterYear}>
                    {filterYear}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Mês</Label>
              <Select
                value={unitFilterMonth}
                onChange={(event) => setUnitFilterMonth(event.target.value)}
                className="w-36"
              >
                <option value="">Todos</option>
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Unidade</Label>
              <Select
                value={unitFilterUnit}
                onChange={(event) => setUnitFilterUnit(event.target.value)}
                className="w-56"
              >
                <option value="">Todas</option>
                {unitFilterUnits.map((unitCode) => (
                  <option key={unitCode} value={unitCode}>
                    {formatAccidentUnitLabel(unitCode)}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasUnitFilters}
              onClick={clearUnitFilters}
            >
              <FilterX className="size-3.5" />
              Limpar filtros
            </Button>
            <span className="ml-auto text-xs font-semibold text-muted-foreground">
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

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-right">Acidentes CAF</TableHead>
                <TableHead className="text-right">Acidentes SAF</TableHead>
                <TableHead className="w-24 text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUnitRows.length ? (
                filteredUnitRows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={
                      editingUnitId === row.id ? "bg-primary/5 hover:bg-primary/5" : undefined
                    }
                  >
                    <TableCell className="font-medium">
                      {periodLabel(row.year, row.month)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatAccidentUnitLabel(row.unit)}
                      {excludedUnits.includes(normalizeAccidentUnitCode(row.unit)) ? (
                        <Badge variant="outline" className="ml-2">
                          ignorada
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.caf}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.saf}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          disabled={busy}
                          onClick={() => startUnitEdit(row)}
                          aria-label={`Editar ${formatAccidentUnitLabel(row.unit)} de ${row.month}/${row.year}`}
                          title="Editar"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon-sm"
                          disabled={busy}
                          onClick={() => void removeUnit(row)}
                          aria-label={`Remover ${formatAccidentUnitLabel(row.unit)} de ${row.month}/${row.year}`}
                          title="Excluir"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    {data?.units.length
                      ? "Nenhum lançamento encontrado para os filtros selecionados."
                      : "Nenhum lançamento por unidade adicionado ainda."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <UnitExclusionDialog
        open={unitDialogOpen}
        onOpenChange={setUnitDialogOpen}
        units={unitDialogOptions}
        excluded={excludedUnits}
        busy={unitDialogBusy}
        onSave={(next) => void saveExcludedUnits(next)}
        description="Unidades marcadas ficam de fora das somas de acidentes CAF/SAF por unidade e do painel publicado."
      />

      <ClearRecordsDialog
        open={clearDialogOpen}
        onOpenChange={setClearDialogOpen}
        title="Limpar registros da Taxa de Acidentes"
        description="Exclui permanentemente os lançamentos da base administrativa da Taxa de Acidentes no banco de dados. O painel já publicado não é afetado."
        periodRange={clearPeriod}
        onPeriodRangeChange={setClearPeriod}
        yearsInData={periodFilterYears}
        fetchAffectedCount={fetchClearAffectedCount}
        affectedLabel="registro(s) de Taxa de Acidentes"
        busy={busy}
        onConfirm={() => void executeClear()}
      />
    </div>
  );
}
