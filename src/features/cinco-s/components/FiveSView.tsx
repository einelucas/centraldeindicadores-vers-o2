"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FilterX,
  Info,
  ListChecks,
  Loader2,
  Percent,
  RotateCw,
  Send,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { ClearRecordsDialog } from "@/components/admin/ClearRecordsDialog";
import { UnitExclusionDialog } from "@/components/admin/UnitExclusionDialog";
import { ViewFilterPopover } from "@/components/admin/ViewFilterPopover";
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
import { chunk, DEFAULT_IMPORT_BATCH_SIZE } from "@/lib/batching";
import { fmtPct } from "@/lib/currency";
import { MONTH_NAMES, MONTH_NAMES_FULL } from "@/lib/dates";
import { INDICATOR_DATA_CHANGED_EVENT, notifyIndicatorDataChanged } from "@/lib/browser-events";
import {
  enumeratePeriodMonths,
  formatPeriodOptionLabel,
  getOperationalPeriod,
  nextPeriod as nextOperationalPeriod,
  periodToOptionalFields,
  toMonthIndex,
  yearSemesterFromCycle,
  type PeriodRange,
  type Semester,
} from "@/lib/period";
import { importFiveSFiles } from "@/features/cinco-s/importers";
import { exportFiveSPdf } from "@/features/cinco-s/exports/pdf";
import { IndicatorAnalysisDialog } from "@/features/justifications/components/IndicatorAnalysisDialog";
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
  FIVES_UNITS,
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

/** "Jun, Jul e Ago" — usado na linha de cobertura mensal do card de contexto. */
function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

function periodOptionKey(year: number, semester: Semester): string {
  return `${year}:${semester}`;
}

export function FiveSView({ canPublish, canClear }: { canPublish: boolean; canClear: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState(FIVES_DEFAULT_TARGET * 100);
  const [excludedUnits, setExcludedUnits] = useState<string[]>([...FIVES_DEFAULT_EXCLUDED]);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [unitDialogBusy, setUnitDialogBusy] = useState(false);
  /** Período travado (Ano + Semestre) — é sempre o que vai ser publicado. */
  const { year, semester, cycle: publishPeriod, setPeriod } = useReadingContextCycle();
  /** Filtro de "Consulta": undefined = segue o período de publicação; null =
      Tudo; PeriodRange = recorte específico. Nunca afeta o que é publicado. */
  const [viewFilter, setViewFilter] = useState<PeriodRange | null | undefined>(undefined);
  const effectivePeriod = viewFilter === undefined ? publishPeriod : viewFilter;
  const effectivePeriodKey = effectivePeriod
    ? `${effectivePeriod.startYear}-${effectivePeriod.startMonth}:${effectivePeriod.endYear}-${effectivePeriod.endMonth}`
    : "all";
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
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearPeriod, setClearPeriod] = useState<PeriodRange | null>(null);
  /** Ciclos com pelo menos um mês real importado — fonte do seletor único de
      período de trabalho. Vem do mesmo endpoint que o painel publicado usa. */
  const [availablePeriods, setAvailablePeriods] = useState<
    Array<{ year: number; semester: Semester }>
  >([]);
  /** Meses do ciclo de PUBLICAÇÃO com dado real — sempre relativo a
      `publishPeriod`, nunca ao filtro de "Detalhar meses", para a cobertura e
      o botão "Publicar" nunca refletirem um período diferente do que será
      publicado. */
  const [narrowedCoverageMonths, setNarrowedCoverageMonths] = useState<Set<string> | null>(null);

  const loadAvailablePeriods = useCallback(async () => {
    try {
      const response = await fetch("/api/available-periods?source=cinco-s", {
        cache: "no-store",
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { periods?: PeriodRange[] };
      const next = (body.periods ?? []).map(yearSemesterFromCycle);
      setAvailablePeriods(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void loadAvailablePeriods();
    window.addEventListener(INDICATOR_DATA_CHANGED_EVENT, loadAvailablePeriods);
    return () => window.removeEventListener(INDICATOR_DATA_CHANGED_EVENT, loadAvailablePeriods);
  }, [loadAvailablePeriods]);

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
      const response = await fetch(`/api/cinco-s${suffix ? `?${suffix}` : ""}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw await responseError(response, "Falha ao carregar os dados do 5S.");
      }
      const body = (await response.json()) as FiveSApiResponse;
      setData(body);
      setTarget(body.threshold * 100);
      setExcludedUnits(body.excludedUnits);
    },
    [effectivePeriod],
  );

  const loadPublication = useCallback(async () => {
    const response = await fetch(`/api/publicacoes/cinco-s?${periodQueryString(publishPeriod)}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const body = (await response.json()) as {
      publication: PublicationSummary | null;
    };
    setPublication(body.publication);
  }, [publishPeriod]);

  const loadCoverage = useCallback(async () => {
    const params = new URLSearchParams(
      Object.fromEntries(
        Object.entries(periodToOptionalFields(publishPeriod)).map(([key, value]) => [
          key,
          String(value),
        ]),
      ),
    );
    const response = await fetch(`/api/cinco-s?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as FiveSApiResponse;
    setNarrowedCoverageMonths(new Set(body.result.months.map((m) => periodKey(m.year, m.month))));
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
      return new Set(data.result.months.map((m) => periodKey(m.year, m.month)));
    }
    return narrowedCoverageMonths;
  }, [viewFilter, data, narrowedCoverageMonths]);

  const workingMonths = useMemo(() => enumeratePeriodMonths(publishPeriod), [publishPeriod]);
  const presentWorkingMonths = useMemo(
    () => workingMonths.filter((m) => coverageMonthSet?.has(periodKey(m.year, m.month))),
    [workingMonths, coverageMonthSet],
  );
  const missingWorkingMonths = useMemo(
    () => workingMonths.filter((m) => !coverageMonthSet?.has(periodKey(m.year, m.month))),
    [workingMonths, coverageMonthSet],
  );
  const coverageKnown = coverageMonthSet !== null;
  const canPublishPeriod = coverageKnown && presentWorkingMonths.length > 0;

  const viewFilterOutsideWorkingPeriod =
    !!viewFilter &&
    (viewFilter.startYear !== publishPeriod.startYear ||
      viewFilter.startMonth !== publishPeriod.startMonth ||
      viewFilter.endYear !== publishPeriod.endYear ||
      viewFilter.endMonth !== publishPeriod.endMonth);

  const currentPeriodHasData = availablePeriods.some(
    (item) => item.year === year && item.semester === semester,
  );

  const periodOptions = useMemo(() => {
    const merged = currentPeriodHasData
      ? availablePeriods
      : [...availablePeriods, { year, semester }];
    // Ordem cronológica decrescente pela data real de início do ciclo — S1
    // do "ano do período" começa em dezembro do ano ANTERIOR, então não dá
    // pra comparar direto pelo `year` do rótulo (ver cycleFromYearSemester).
    return [...merged].sort((a, b) => {
      const startA = a.semester === "S2" ? toMonthIndex(a.year, 6) : toMonthIndex(a.year - 1, 12);
      const startB = b.semester === "S2" ? toMonthIndex(b.year, 6) : toMonthIndex(b.year - 1, 12);
      return startB - startA;
    });
  }, [availablePeriods, currentPeriodHasData, year, semester]);

  const units = useMemo(() => {
    if (!data) return [];
    return Array.from(
      new Set(data.result.unitMonths.map((item) => normalizeFiveSUnitCode(item.unit))),
    ).sort(compareFiveSUnits);
  }, [data]);

  const unitOptions = useMemo(() => {
    const codes = new Set<string>([
      ...FIVES_UNITS.map((unit) => unit.code),
      ...units,
      ...excludedUnits,
      ...(prepared?.records.map((record) => normalizeFiveSUnitCode(record.unit)) ?? []),
    ]);
    codes.delete("");
    return Array.from(codes)
      .sort(compareFiveSUnits)
      .map((code) => ({ code, label: formatFiveSUnitLabel(code) }));
  }, [excludedUnits, prepared, units]);

  async function saveExcludedUnits(next: string[]) {
    setUnitDialogBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/cinco-s", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, excludedUnits: next }),
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
    return Array.from(new Set(data.result.months.map((month) => month.year))).sort((a, b) => b - a);
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
      const matchesYear = matrixYearFilter === "all" || period.year === Number(matrixYearFilter);
      const matchesMonth =
        matrixMonthFilter === "all" || period.month === Number(matrixMonthFilter);
      return matchesYear && matchesMonth;
    });
  }, [data, matrixMonthFilter, matrixYearFilter]);

  useEffect(() => {
    if (matrixUnitFilter !== "all" && !units.includes(matrixUnitFilter)) {
      setMatrixUnitFilter("all");
    }
    if (matrixYearFilter !== "all" && !availableYears.includes(Number(matrixYearFilter))) {
      setMatrixYearFilter("all");
    }
    if (matrixMonthFilter !== "all" && !availableMonths.includes(Number(matrixMonthFilter))) {
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
        (item) => item.unit === detailUnit && item.year === year && item.month === month,
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
          new Set(file.records.map((record) => periodLabel(record.year, record.month))),
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
        const known = new Set(unitOptions.map((option) => option.code));
        const detected = new Set(
          parsed.records.map((record) => normalizeFiveSUnitCode(record.unit)),
        );
        const hasNewUnit = Array.from(detected).some((code) => code && !known.has(code));
        if (hasNewUnit) setUnitDialogOpen(true);
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
    const importedRecords = prepared.records;
    const periodsBeforeImport = availablePeriods;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await saveSettings();
      const batches = chunk(importedRecords, DEFAULT_IMPORT_BATCH_SIZE);
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
      notifyIndicatorDataChanged();

      let importMessage = `Importação concluída: ${totals.inserted} inserido(s), ${totals.updated} atualizado(s), ${totals.ignored} ignorado(s) e ${totals.rejected} rejeitado(s).`;

      // Se os arquivos importados pertencem a um único período e esse
      // período não tinha dado nenhum antes desta importação, é um semestre
      // novo — avisa e segue para lá automaticamente. Se o período já tinha
      // dados (o usuário está corrigindo um período histórico), a seleção
      // atual não é alterada.
      const importedPeriodKeys = new Set(
        importedRecords.map((record) => {
          const period = getOperationalPeriod(record.year, record.month);
          return periodOptionKey(period.periodYear, period.semester);
        }),
      );
      if (importedPeriodKeys.size === 1) {
        const [key] = importedPeriodKeys;
        const [periodYearText, periodSemester] = (key ?? "").split(":");
        const periodYear = Number(periodYearText);
        const isNewPeriod = !periodsBeforeImport.some(
          (item) => periodOptionKey(item.year, item.semester) === key,
        );
        if (isNewPeriod && periodSemester) {
          const semesterValue = periodSemester as Semester;
          importMessage += ` Novo período detectado: ${formatPeriodOptionLabel(periodYear, semesterValue)}.`;
          setPeriod(periodYear, semesterValue);
        }
      }

      setMessage(importMessage);
      setPrepared(null);
      await load();
      void loadAvailablePeriods();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao importar o 5S.");
    } finally {
      setBusy(false);
    }
  }

  /** Só muda o período de trabalho na tela — nunca cria registro nenhum.
      Assim que o primeiro arquivo válido do novo semestre for importado, ele
      passa a aparecer normalmente em `availablePeriods` e substitui esta
      opção "preparada". */
  function prepareNextSemester() {
    const next = nextOperationalPeriod(year, semester);
    setPeriod(next.year, next.semester);
    setMessage(`Período de trabalho preparado: ${formatPeriodOptionLabel(next.year, next.semester)} · Sem dados.`);
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
        body: JSON.stringify({ target, excludedUnits, ...periodToOptionalFields(publishPeriod) }),
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
    const response = await fetch(`/api/cinco-s/registros?${params.toString()}`, {
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
      const response = await fetch("/api/cinco-s/registros", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw await responseError(response, "Falha ao limpar a base do 5S.");
      }
      const responseBody = (await response.json()) as { deleted: number };
      notifyIndicatorDataChanged();
      setPrepared(null);
      setProgress(null);
      setMessage(`${responseBody.deleted} registro(s) removido(s) da Administração.`);
      setClearDialogOpen(false);
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
          item.year === result.latestYear && item.month === result.latestMonth && !item.excluded,
      ).length
    : 0;

  const hasMatrixFilters =
    matrixUnitFilter !== "all" || matrixMonthFilter !== "all" || matrixYearFilter !== "all";

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-card px-6 py-9 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "hover:border-primary/50 hover:bg-muted/30",
        )}
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
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
      >
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <UploadCloud className="size-5" />
        </div>
        <h4 className="text-sm font-semibold text-foreground">
          Arraste o(s) arquivo(s) PPR - 5S aqui, ou clique para escolher
        </h4>
        <p className="max-w-md text-xs text-muted-foreground">
          Pode selecionar vários meses. Cada arquivo deve possuir uma aba por unidade e o padrão
          Divisão, Área, Meta e Nota.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.xltx"
          disabled={busy}
          className="hidden"
          onChange={(event) => void prepareFiles(event.target.files ?? [])}
        />
      </div>

      {busy && !progress ? (
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
          Processando…
        </div>
      ) : null}

      {prepared ? (
        <div className="flex flex-wrap gap-2">
          {prepared.perFile.map((file) => (
            <Badge
              key={file.fileName}
              variant={file.error ? "destructive" : "secondary"}
              className="gap-1.5 py-1.5 font-medium"
            >
              <FileSpreadsheet className="size-3" />
              {file.fileName} ·{" "}
              {file.error ?? `${file.count} unidade(s) · ${file.periods.join(", ")}`}
            </Badge>
          ))}
        </div>
      ) : null}

      {prepared?.duplicates ? (
        <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-xs font-semibold text-accent-foreground">
          <Info className="size-3.5 shrink-0 text-accent" />
          {prepared.duplicates} unidade(s)/mês repetida(s) na seleção; somente a última versão de
          cada unidade e período será enviada.
        </div>
      ) : null}

      {progress ? (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-3 text-xs font-medium text-primary">
          <div className="flex items-center gap-1.5">
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
            Lote {progress.currentBatch}/{progress.totalBatches} · Inseridos: {progress.inserted} ·
            Atualizados: {progress.updated} · Ignorados: {progress.ignored} · Rejeitados:{" "}
            {progress.rejected}
          </div>
        </div>
      ) : null}

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

      {prepared?.records.length ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={busy} onClick={() => void importPrepared()}>
            <UploadCloud className="size-3.5" />
            Importar arquivos
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setPrepared(null)}>
            <X className="size-3.5" />
            Descartar seleção
          </Button>
        </div>
      ) : null}

      <Card className="p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Contexto de publicação</CardTitle>
              <CardDescription>
                Defina o período de trabalho, a meta e as ações aplicadas ao cálculo e à
                publicação do 5S.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">
                {year} {semester}
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fiveSPeriodSelect">Período de trabalho</Label>
              <Select
                id="fiveSPeriodSelect"
                value={periodOptionKey(year, semester)}
                onChange={(event) => {
                  const [nextYearText, nextSemesterText] = event.target.value.split(":");
                  if (!nextYearText || !nextSemesterText) return;
                  setPeriod(Number(nextYearText), nextSemesterText as Semester);
                }}
              >
                {periodOptions.map((option) => {
                  const hasData = availablePeriods.some(
                    (item) => item.year === option.year && item.semester === option.semester,
                  );
                  return (
                    <option
                      key={periodOptionKey(option.year, option.semester)}
                      value={periodOptionKey(option.year, option.semester)}
                    >
                      {formatPeriodOptionLabel(option.year, option.semester)}
                      {hasData ? "" : " · Sem dados"}
                    </option>
                  );
                })}
              </Select>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto px-1.5 py-1 text-xs text-muted-foreground"
                  onClick={prepareNextSemester}
                >
                  <CalendarPlus className="size-3.5" />
                  Preparar próximo semestre
                </Button>
                <ViewFilterPopover
                  value={viewFilter}
                  onChange={setViewFilter}
                  yearsInData={availableYears}
                  publishedLabel={formatPeriodOptionLabel(year, semester)}
                  label="Detalhar meses"
                />
              </div>
              {viewFilterOutsideWorkingPeriod ? (
                <p className="text-xs font-medium text-accent-foreground">
                  “Detalhar meses” está fora do período de trabalho (
                  {formatPeriodOptionLabel(year, semester)}) — isso só restringe a tabela abaixo; a
                  publicação sempre usa o período de trabalho.
                </p>
              ) : null}
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
                    : "0 de 6 meses com dados — importe arquivos deste período para habilitar a publicação."}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fiveSTarget">Meta de aderência (%)</Label>
              <Input
                id="fiveSTarget"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={target}
                onChange={(event) => setTarget(Number(event.target.value))}
                className="w-28"
              />
              <p className="text-xs text-muted-foreground">
                Usada no cálculo e na publicação de {formatPeriodOptionLabel(year, semester)}.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void recalculate()}>
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
              module="cinco-s"
              moduleLabel="5S"
              target={target}
              years={availableYears}
              defaultYear={result?.latestYear ?? undefined}
              defaultMonth={result?.latestMonth ?? undefined}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!result?.unitMonths.length || busy}
              onClick={() => result && exportFiveSPdf(result)}
            >
              <Download className="size-3.5" />
              Baixar PDF
            </Button>
            {canClear ? (
              <Button
                variant="destructive"
                size="sm"
                disabled={!data?.total || busy}
                onClick={openClearDialog}
              >
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
                Publicar {year} {semester}
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {publication ? (
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <CheckCircle2 className="size-3.5 shrink-0 text-success" />
          Já existe uma publicação ativa para <strong>{semester} {year}</strong> — versão{" "}
          {publication.version}, publicada em{" "}
          {new Date(publication.publishedAt).toLocaleString("pt-BR")} por{" "}
          {publication.publishedBy.name}. Publicar novamente cria uma nova versão para este ciclo.
        </div>
      ) : null}

      <UnitExclusionDialog
        open={unitDialogOpen}
        onOpenChange={setUnitDialogOpen}
        units={unitOptions}
        excluded={excludedUnits}
        busy={unitDialogBusy}
        onSave={(next) => void saveExcludedUnits(next)}
        description="Unidades marcadas continuam visíveis na tabela e no detalhamento, mas não entram na média GERAL nem no painel publicado."
      />

      <ClearRecordsDialog
        open={clearDialogOpen}
        onOpenChange={setClearDialogOpen}
        title="Limpar registros do 5S"
        description="Exclui permanentemente os registros da base administrativa do 5S no banco de dados. O painel já publicado não é afetado."
        periodRange={clearPeriod}
        onPeriodRangeChange={setClearPeriod}
        yearsInData={availableYears}
        fetchAffectedCount={fetchClearAffectedCount}
        affectedLabel="registro(s) de 5S"
        busy={busy}
        onConfirm={() => void executeClear()}
      />

      {result?.unitMonths.length ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <AdminMetricCard
              label={`GERAL (${result.periodLabel})`}
              value={fmtPct(result.geral)}
              icon={Percent}
              tone={result.passaMeta ? "success" : "destructive"}
              badge={
                <Badge variant={result.passaMeta ? "success" : "destructive"}>
                  {result.passaMeta ? "Dentro da meta" : "Fora da meta"}
                </Badge>
              }
            />
            <AdminMetricCard
              label="Unidades carregadas"
              value={result.unitsCount.toLocaleString("pt-BR")}
              icon={ListChecks}
            />
            <AdminMetricCard
              label="Unidades no GERAL atual"
              value={latestEligibleUnits.toLocaleString("pt-BR")}
              icon={CheckCircle2}
            />
            <AdminMetricCard
              label="Meses carregados"
              value={result.monthsCount.toLocaleString("pt-BR")}
              icon={CalendarDays}
            />
          </div>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 space-y-0">
              <div>
                <CardTitle>Por unidade e mês</CardTitle>
                <CardDescription>
                  Aderência média das áreas, com filtros independentes por unidade, mês e ano.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fiveSMatrixUnitFilter">Unidade</Label>
                  <Select
                    id="fiveSMatrixUnitFilter"
                    value={matrixUnitFilter}
                    onChange={(event) => setMatrixUnitFilter(event.target.value)}
                    className="w-44"
                  >
                    <option value="all">Todas as unidades</option>
                    {units.map((unit) => (
                      <option key={unit} value={unit}>
                        {formatFiveSUnitLabel(unit)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fiveSMatrixMonthFilter">Mês</Label>
                  <Select
                    id="fiveSMatrixMonthFilter"
                    value={matrixMonthFilter}
                    onChange={(event) => setMatrixMonthFilter(event.target.value)}
                    className="w-36"
                  >
                    <option value="all">Todos os meses</option>
                    {availableMonths.map((month) => (
                      <option key={month} value={month}>
                        {MONTH_NAMES_FULL[month - 1] ?? month}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fiveSMatrixYearFilter">Ano</Label>
                  <Select
                    id="fiveSMatrixYearFilter"
                    value={matrixYearFilter}
                    onChange={(event) => setMatrixYearFilter(event.target.value)}
                    className="w-28"
                  >
                    <option value="all">Todos</option>
                    {availableYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </Select>
                </div>
                {hasMatrixFilters ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMatrixUnitFilter("all");
                      setMatrixMonthFilter("all");
                      setMatrixYearFilter("all");
                    }}
                  >
                    <FilterX className="size-3.5" />
                    Limpar filtros
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 min-w-[220px] bg-muted/60">
                      Unidade
                    </TableHead>
                    {filteredMatrixPeriods.map((month) => (
                      <TableHead
                        className="min-w-[100px] text-right"
                        key={periodKey(month.year, month.month)}
                      >
                        {month.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMatrixUnits.length && filteredMatrixPeriods.length ? (
                    <>
                      {filteredMatrixUnits.map((unit) => {
                        const excluded = result.excludedUnits.includes(unit);
                        return (
                          <TableRow key={unit}>
                            <TableCell className="sticky left-0 z-10 min-w-[220px] bg-card font-medium">
                              {formatFiveSUnitLabel(unit)}{" "}
                              {excluded ? <Badge variant="outline">excluída</Badge> : null}
                            </TableCell>
                            {filteredMatrixPeriods.map((month) => {
                              const item = result.unitMonths.find(
                                (row) =>
                                  row.unit === unit &&
                                  row.year === month.year &&
                                  row.month === month.month,
                              );
                              return (
                                <TableCell
                                  className="text-right tabular-nums"
                                  key={periodKey(month.year, month.month)}
                                >
                                  {item ? fmtPct(item.aderencia) : "—"}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                        <TableCell className="sticky left-0 z-10 bg-muted/40">GERAL</TableCell>
                        {filteredMatrixPeriods.map((month) => (
                          <TableCell
                            className="text-right tabular-nums"
                            key={periodKey(month.year, month.month)}
                          >
                            {fmtPct(month.geral)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </>
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={Math.max(filteredMatrixPeriods.length + 1, 1)}
                        className="py-8 text-center text-muted-foreground"
                      >
                        Nenhum resultado encontrado para os filtros selecionados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 space-y-0">
              <div>
                <CardTitle>Detalhamento por unidade</CardTitle>
                <CardDescription>
                  Divisão, área, meta, nota e aderência do período selecionado.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fiveSDetailUnit">Unidade</Label>
                  <Select
                    id="fiveSDetailUnit"
                    value={detailUnit}
                    onChange={(event) => setDetailUnit(event.target.value)}
                    className="w-44"
                  >
                    {units.map((unit) => (
                      <option key={unit} value={unit}>
                        {formatFiveSUnitLabel(unit)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fiveSDetailPeriod">Mês</Label>
                  <Select
                    id="fiveSDetailPeriod"
                    value={detailPeriod}
                    onChange={(event) => setDetailPeriod(event.target.value)}
                    className="w-40"
                  >
                    {periods.map((period) => (
                      <option key={period.key} value={period.key}>
                        {period.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Divisão</TableHead>
                    <TableHead>Área</TableHead>
                    <TableHead className="text-right">Meta</TableHead>
                    <TableHead className="text-right">Nota</TableHead>
                    <TableHead className="text-right">Aderência</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailGroups.length ? (
                    detailGroups.map(([division, areas]) => {
                      const average =
                        areas.reduce((sum, area) => sum + aderenciaArea(area), 0) / areas.length;
                      return (
                        <Fragment key={division}>
                          {areas.map((area, index) => (
                            <TableRow key={`${division}-${area.area}-${index}`}>
                              <TableCell className="font-medium">{division}</TableCell>
                              <TableCell>{area.area}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {numberText(area.meta)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {numberText(area.nota)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {fmtPct(aderenciaArea(area))}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                            <TableCell colSpan={4}>Média {division}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtPct(average)}
                            </TableCell>
                          </TableRow>
                        </Fragment>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Sem dados reais para esta unidade e mês.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {data?.lastImport ? (
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Info className="size-3.5 shrink-0" />
              Última importação: {data.lastImport.fileName} · {data.lastImport.totalFound}{" "}
              encontrado(s), {data.lastImport.totalInserted} inserido(s),{" "}
              {data.lastImport.totalUpdated} atualizado(s), {data.lastImport.totalIgnored}{" "}
              ignorado(s) e {data.lastImport.totalRejected} rejeitado(s).
            </div>
          ) : null}
        </>
      ) : (
        <Card className="flex flex-col items-center gap-3 border-dashed px-8 py-14 text-center">
          <Badge variant="secondary" className="uppercase tracking-wide">
            Aguardando dados
          </Badge>
          <CardTitle className="text-base">Nenhuma auditoria 5S importada</CardTitle>
          <CardDescription className="max-w-sm">
            Os cards e tabelas serão montados somente após registros reais serem gravados no Neon.
          </CardDescription>
        </Card>
      )}
    </div>
  );
}
