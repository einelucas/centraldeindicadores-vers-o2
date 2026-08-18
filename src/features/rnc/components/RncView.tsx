"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
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
import { chunk, DEFAULT_IMPORT_BATCH_SIZE } from "@/lib/batching";
import { fmtPct } from "@/lib/currency";
import { MONTH_NAMES, MONTH_NAMES_FULL } from "@/lib/dates";
import { notifyIndicatorDataChanged } from "@/lib/browser-events";
import {
  enumeratePeriodMonths,
  formatPeriodOptionLabel,
  periodToOptionalFields,
  type PeriodRange,
} from "@/lib/period";
import { importRncFiles } from "@/features/rnc/importers";
import { exportRncPdf } from "@/features/rnc/exports/pdf";
import { IndicatorAnalysisDialog } from "@/features/justifications/components/IndicatorAnalysisDialog";
import {
  RNC_DEFAULT_MAX_DIAS,
  type RncNormalizedRecord,
  type RncResult,
} from "@/features/rnc/types";
import { formatRncUnitLabel, normalizeRncUnitCode, RNC_UNITS } from "@/features/rnc/utils/units";

interface ApiResponse {
  total: number;
  metaDias: number;
  result: RncResult;
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

interface PublicationSummary {
  publishedAt: string;
  publishedBy: { name: string };
  version: number;
}

interface PreparedImport {
  fileNames: string[];
  records: RncNormalizedRecord[];
  duplicates: number;
  perFile: Array<{
    fileName: string;
    count: number;
    error: string | null;
  }>;
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

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? fallback);
}

function monthKey(year: number, monthZeroBased: number): string {
  return `${year}-${String(monthZeroBased + 1).padStart(2, "0")}`;
}

function formatDays(value: number | null): string {
  return value === null ? "—" : String(Math.round(value));
}

export function RncView({ canPublish, canClear }: { canPublish: boolean; canClear: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [metaDias, setMetaDias] = useState(RNC_DEFAULT_MAX_DIAS);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [unitFilter, setUnitFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [prepared, setPrepared] = useState<PreparedImport | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [publication, setPublication] = useState<PublicationSummary | null>(null);
  const [excludedUnits, setExcludedUnits] = useState<string[]>([]);
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
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearPeriod, setClearPeriod] = useState<PeriodRange | null>(null);
  const { availablePeriods, periodOptions, loadAvailablePeriods, detectNewPeriod } =
    usePublicationPeriodOptions("rnc", year, semester);
  /** Meses do ciclo de PUBLICAÇÃO com dado real — sempre relativo a
      `publishPeriod`, nunca ao filtro de "Detalhar meses", para a cobertura e
      o botão "Publicar" nunca refletirem um período diferente do publicado. */
  const [narrowedCoverageMonths, setNarrowedCoverageMonths] = useState<Set<string> | null>(null);

  const loadCoverage = useCallback(async () => {
    const params = new URLSearchParams({
      meta: String(metaDias),
      ...Object.fromEntries(
        Object.entries(periodToOptionalFields(publishPeriod)).map(([key, value]) => [
          key,
          String(value),
        ]),
      ),
    });
    const response = await fetch(`/api/rnc?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as ApiResponse;
    setNarrowedCoverageMonths(new Set(body.result.months.map((m) => `${m.year}-${m.month}`)));
  }, [publishPeriod, metaDias]);

  const load = useCallback(
    async (meta = metaDias, nextPeriod = effectivePeriod) => {
      setError(null);
      const params = new URLSearchParams({
        meta: String(meta),
        ...Object.fromEntries(
          Object.entries(periodToOptionalFields(nextPeriod)).map(([key, value]) => [
            key,
            String(value),
          ]),
        ),
      });
      const response = await fetch(`/api/rnc?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw await responseError(response, "Falha ao carregar os dados do RNC.");
      }
      const body = (await response.json()) as ApiResponse;
      setData(body);
      setMetaDias(body.metaDias);
      setExcludedUnits(body.result.excludedUnits);
      setSelectedMonth((current) => {
        const keys = body.result.months.map((month) => monthKey(month.year, month.month));
        return keys.includes(current) ? current : (keys.at(-1) ?? "");
      });
    },
    [metaDias, effectivePeriod],
  );

  async function loadPublication() {
    const response = await fetch(`/api/publicacoes/rnc?${periodQueryString(publishPeriod)}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const body = (await response.json()) as {
      publication: PublicationSummary | null;
    };
    setPublication(body.publication);
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
    // A primeira leitura usa a meta padrão real do módulo; refaz a busca sempre que o período muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePeriodKey]);

  useEffect(() => {
    void loadPublication();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishPeriod]);

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
      return new Set(data.result.months.map((m) => `${m.year}-${m.month}`));
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

  function prepareNextSemester() {
    const next = nextWorkingPeriod(year, semester);
    setPeriod(next.year, next.semester);
    setMessage(
      `Período de trabalho preparado: ${formatPeriodOptionLabel(next.year, next.semester)} · Sem dados.`,
    );
  }

  const unitOptions = useMemo(() => {
    const codes = new Set<string>([
      ...RNC_UNITS.map((unit) => unit.code),
      ...(data?.result.units.map((unit) => unit.name) ?? []),
      ...excludedUnits,
      ...(prepared?.records.map((record) => normalizeRncUnitCode(record.unidade)) ?? []),
    ]);
    codes.delete("");
    return Array.from(codes).map((code) => ({ code, label: formatRncUnitLabel(code) }));
  }, [data, excludedUnits, prepared]);

  async function saveExcludedUnits(next: string[]) {
    setUnitDialogBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rnc", {
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

  async function prepareFiles(files: FileList | File[]) {
    const selected = Array.from(files);
    if (!selected.length) return;

    setBusy(true);
    setError(null);
    setMessage(null);
    setProgress(null);
    try {
      const parsed = await importRncFiles(selected);
      setPrepared({
        fileNames: selected.map((file) => file.name),
        records: parsed.records,
        duplicates: parsed.duplicates,
        perFile: parsed.perFile.map((file) => ({
          fileName: file.fileName,
          count: file.count,
          error: file.error,
        })),
      });
      if (parsed.records.length) {
        setMessage(
          "Arquivos lidos e validados. Clique em “Importar arquivos” para gravar os registros no Neon.",
        );
        const known = new Set(unitOptions.map((option) => option.code));
        const detected = new Set(
          parsed.records.map((record) => normalizeRncUnitCode(record.unidade)),
        );
        const hasNewUnit = Array.from(detected).some((code) => code && !known.has(code));
        if (hasNewUnit) setUnitDialogOpen(true);
      } else {
        setError("Nenhum registro válido foi encontrado nos arquivos selecionados.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ler os arquivos.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
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
    const batches = chunk(prepared.records, DEFAULT_IMPORT_BATCH_SIZE);
    setProgress({
      totalFound: prepared.records.length,
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
          module: "rnc",
          fileName: prepared.fileNames.join(", "),
          totalFound: prepared.records.length,
        }),
      });
      if (!start.ok) {
        throw await responseError(start, "Falha ao iniciar a importação.");
      }
      const { importJobId } = (await start.json()) as { importJobId: string };

      let totals = { inserted: 0, ignored: 0, updated: 0, rejected: 0 };
      for (let index = 0; index < batches.length; index++) {
        const records = (batches[index] ?? []).map((record: RncNormalizedRecord) => ({
          statusRnc: record.statusRnc,
          unidade: record.unidade,
          dataCriacao: record.dataCriacao.toISOString(),
          dataSolucao: record.dataSolucao ? record.dataSolucao.toISOString() : null,
          tempoTratativa: record.tempoTratativa,
          ofensor: record.ofensor,
          year: record.year,
          month: record.month,
          raw: record.raw,
        }));
        const response = await fetch(`/api/importacoes/${importJobId}/lotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchNumber: index + 1, records }),
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
          totalFound: prepared.records.length,
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
      const newPeriodMessage = detectNewPeriod(prepared.records, setPeriod);
      if (newPeriodMessage) importMessage += ` ${newPeriodMessage}`;
      setMessage(importMessage);
      setPrepared(null);
      await load(metaDias);
      void loadAvailablePeriods();
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
      const response = await fetch("/api/publicacoes/rnc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metaDias, ...periodToOptionalFields(publishPeriod) }),
      });
      if (!response.ok) {
        throw await responseError(response, "Falha ao publicar o RNC.");
      }
      const body = (await response.json()) as {
        publication: PublicationSummary;
      };
      setPublication(body.publication);
      setMessage("RNC publicado no painel com sucesso.");
      window.dispatchEvent(new Event("rnc:published"));
      window.dispatchEvent(new Event("indicator:published"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao publicar o RNC.");
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
    const response = await fetch(`/api/rnc/registros?${params.toString()}`, {
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
      const response = await fetch("/api/rnc/registros", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw await responseError(response, "Falha ao limpar os registros do RNC.");
      }
      const responseBody = (await response.json()) as { deleted: number };
      notifyIndicatorDataChanged();
      setMessage(`${responseBody.deleted} registro(s) removido(s).`);
      setPrepared(null);
      setProgress(null);
      setClearDialogOpen(false);
      await load(metaDias);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao limpar o RNC.");
    } finally {
      setBusy(false);
    }
  }

  const result = data?.result ?? null;
  const selected =
    result?.months.find((month) => monthKey(month.year, month.month) === selectedMonth) ?? null;
  const selectedAdherence =
    selected && selected.chamados ? selected.solucionados / selected.chamados : null;
  const progressPct = progress?.totalBatches
    ? Math.round((progress.currentBatch / progress.totalBatches) * 100)
    : 0;
  const orderedUnits = useMemo(() => {
    if (!result) return [];
    const order = new Map(RNC_UNITS.map((unit, index) => [unit.code, index]));
    return [...result.units].sort((a, b) => {
      const aOrder = order.get(a.name) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = order.get(b.name) ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder || a.name.localeCompare(b.name, "pt-BR");
    });
  }, [result]);
  const filteredUnits = useMemo(() => {
    return unitFilter === "all"
      ? orderedUnits
      : orderedUnits.filter((unit) => unit.name === unitFilter);
  }, [orderedUnits, unitFilter]);
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
    if (
      monthFilter !== "all" &&
      !result.months.some((month) => month.month === Number(monthFilter))
    ) {
      setMonthFilter("all");
    }
  }, [monthFilter, result, unitFilter, yearFilter]);

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
          Arraste os arquivos de RNC aqui, ou clique para escolher
        </h4>
        <p className="max-w-md text-xs text-muted-foreground">
          Pode selecionar vários meses. O leitor procura Status RNC, Unidade, Data de Criação, Data
          de Solução, Tempo de Tratativa e Ofensor.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.csv"
          disabled={busy}
          className="hidden"
          onChange={(event) => {
            if (event.target.files) void prepareFiles(event.target.files);
          }}
        />
      </div>

      {prepared ? (
        <>
          <div className="flex flex-wrap gap-2">
            {prepared.perFile.map((file) => (
              <Badge
                key={file.fileName}
                variant={file.error ? "destructive" : "secondary"}
                className="gap-1.5 py-1.5 font-medium"
              >
                <FileSpreadsheet className="size-3" />
                {file.fileName} ·{" "}
                {file.error
                  ? `erro: ${file.error}`
                  : `${file.count.toLocaleString("pt-BR")} linhas`}
              </Badge>
            ))}
          </div>
          {prepared.duplicates > 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-xs font-semibold text-accent-foreground">
              <Info className="size-3.5 shrink-0 text-accent" />
              {prepared.duplicates.toLocaleString("pt-BR")} linha(s) idêntica(s) repetida(s) entre
              os arquivos — contadas uma única vez.
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={busy || !prepared.records.length}
              onClick={() => void importPrepared()}
            >
              <UploadCloud className="size-3.5" />
              Importar arquivos
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setPrepared(null)}>
              <X className="size-3.5" />
              Descartar seleção
            </Button>
          </div>
        </>
      ) : null}

      {progress ? (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs font-medium text-primary">
            <span className="flex items-center gap-1.5">
              <Loader2 className="size-3.5 shrink-0 animate-spin" />
              Importação no Neon · {progress.totalFound.toLocaleString("pt-BR")} registros · lote{" "}
              {progress.currentBatch}/{progress.totalBatches} ({progressPct}%)
            </span>
            <span>
              Inseridos: {progress.inserted} · Atualizados: {progress.updated} · Ignorados:{" "}
              {progress.ignored} · Rejeitados: {progress.rejected}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progressPct}%` }}
            />
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

      <Card className="p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Contexto de publicação</CardTitle>
              <CardDescription>
                Defina o período de trabalho, a meta e as ações aplicadas ao cálculo e à
                publicação do RNC.
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
            <PublicationPeriodField
              fieldId="rncPeriodSelect"
              year={year}
              semester={semester}
              onChange={setPeriod}
              periodOptions={periodOptions}
              availablePeriods={availablePeriods}
              publishPeriod={publishPeriod}
              viewFilter={viewFilter}
              onViewFilterChange={setViewFilter}
              yearsInData={availableYears}
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
                    : "0 de 6 meses com dados — importe arquivos deste período para habilitar a publicação."}
              </p>
            </PublicationPeriodField>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rncMeta">Meta (dias, ≤)</Label>
              <Input
                id="rncMeta"
                type="number"
                min={0}
                value={metaDias}
                onChange={(event) => setMetaDias(Number(event.target.value))}
                className="w-28"
              />
              <p className="text-xs text-muted-foreground">
                Usada no cálculo e na publicação de {formatPeriodOptionLabel(year, semester)}.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void load(metaDias).catch((err: Error) => setError(err.message))}
            >
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
              module="rnc"
              moduleLabel="RNC"
              target={metaDias}
              years={availableYears}
              defaultYear={selected?.year}
              defaultMonth={selected ? selected.month + 1 : undefined}
              targetUnit="absolute"
            />
            {result ? (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => exportRncPdf(result)}>
                <Download className="size-3.5" />
                Baixar PDF
              </Button>
            ) : null}
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
          {publication.publishedBy.name}. Publicar novamente cria uma nova versão para este
          ciclo.
        </div>
      ) : null}

      {result && data && data.total > 0 ? (
        <div className="flex flex-col gap-5">
          {data.lastImport ? (
            <div className="text-xs font-medium text-muted-foreground">
              Última importação: {data.lastImport.fileName}
              {data.lastImport.completedAt
                ? ` · ${new Date(data.lastImport.completedAt).toLocaleString("pt-BR")}`
                : ""}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <AdminMetricCard
              label="RNC's Criadas"
              value={result.totalCriadas.toLocaleString("pt-BR")}
              icon={ListChecks}
            />
            <AdminMetricCard
              label="RNC's Tratadas"
              value={result.totalTratadas.toLocaleString("pt-BR")}
              sub={fmtPct(result.aderenciaTotal)}
              icon={CheckCircle2}
              tone="success"
            />
            <AdminMetricCard
              label="Dias de resolução"
              value={formatDays(selected?.diasMedios ?? null)}
              sub={selected ? selected.label : "Mês não selecionado"}
              icon={Clock}
            />
            <AdminMetricCard
              label="Aderência do mês"
              value={selectedAdherence === null ? "—" : fmtPct(selectedAdherence)}
              sub={
                selected
                  ? `${selected.solucionados}/${selected.chamados} solucionadas`
                  : "Sem dados"
              }
              icon={Percent}
            />
          </div>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 space-y-0">
              <div>
                <CardTitle>Por mês</CardTitle>
                <CardDescription>
                  RNC elaboradas, RNC tratadas e prazo médio de resolução pela data de criação.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rncMonthTableFilter">Mês</Label>
                  <Select
                    id="rncMonthTableFilter"
                    value={monthFilter}
                    onChange={(event) => setMonthFilter(event.target.value)}
                    className="w-40"
                  >
                    <option value="all">Todos os meses</option>
                    {availableMonths.map((month) => (
                      <option value={month} key={month}>
                        {MONTH_NAMES_FULL[month] ?? `Mês ${month + 1}`}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rncYearTableFilter">Ano</Label>
                  <Select
                    id="rncYearTableFilter"
                    value={yearFilter}
                    onChange={(event) => setYearFilter(event.target.value)}
                    className="w-28"
                  >
                    <option value="all">Todos</option>
                    {availableYears.map((year) => (
                      <option value={year} key={year}>
                        {year}
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
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">RNC Elaboradas</TableHead>
                    <TableHead className="text-right">RNC Tratadas</TableHead>
                    <TableHead className="text-right">Dias de resolução</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMonths.length ? (
                    filteredMonths.map((month) => (
                      <TableRow key={monthKey(month.year, month.month)}>
                        <TableCell className="font-medium">{month.label}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {month.chamados.toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {month.solucionados.toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {formatDays(month.diasMedios)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              month.diasMedios === null
                                ? "outline"
                                : month.dentroMeta
                                  ? "success"
                                  : "destructive"
                            }
                          >
                            {month.diasMedios === null
                              ? "Sem tratativa"
                              : month.dentroMeta
                                ? "Dentro da meta"
                                : "Fora da meta"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Nenhum mês encontrado para os filtros selecionados.
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
                <CardTitle>Por unidade</CardTitle>
                <CardDescription>
                  RNC criadas, tratadas e aderência consolidada por unidade.
                </CardDescription>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rncUnitFilter">Unidade</Label>
                <Select
                  id="rncUnitFilter"
                  value={unitFilter}
                  onChange={(event) => setUnitFilter(event.target.value)}
                  className="w-48"
                >
                  <option value="all">Todas as unidades</option>
                  {orderedUnits.map((unit) => (
                    <option value={unit.name} key={unit.name}>
                      {formatRncUnitLabel(unit.name)}
                    </option>
                  ))}
                </Select>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unidade</TableHead>
                    <TableHead className="text-right">Criadas</TableHead>
                    <TableHead className="text-right">Tratadas</TableHead>
                    <TableHead className="text-right">Aderência</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUnits.length ? (
                    filteredUnits.map((unit) => (
                      <TableRow key={unit.name}>
                        <TableCell className="font-medium">
                          {formatRncUnitLabel(unit.name)}
                          {unit.excluded ? (
                            <Badge variant="outline" className="ml-2">
                              ignorada
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {unit.criadas.toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {unit.tratadas.toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {fmtPct(unit.aderencia)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        Nenhuma unidade encontrada para o filtro selecionado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Por Ofensor (causa raiz)</CardTitle>
              <CardDescription>
                Distribuição das não conformidades por origem identificada.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ofensor</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.ofensores.map((offender) => (
                    <TableRow key={offender.name}>
                      <TableCell className="font-medium">{offender.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {offender.count.toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {fmtPct(offender.pct)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="flex flex-col items-center gap-3 border-dashed px-8 py-14 text-center">
          <Badge variant="secondary" className="uppercase tracking-wide">
            Aguardando dados
          </Badge>
          <CardTitle className="text-base">RNC</CardTitle>
          <CardDescription className="max-w-sm">
            Importe um ou mais arquivos para calcular os prazos de tratativa, unidades e ofensores.
          </CardDescription>
        </Card>
      )}

      <UnitExclusionDialog
        open={unitDialogOpen}
        onOpenChange={setUnitDialogOpen}
        units={unitOptions}
        excluded={excludedUnits}
        busy={unitDialogBusy}
        onSave={(next) => void saveExcludedUnits(next)}
      />

      <ClearRecordsDialog
        open={clearDialogOpen}
        onOpenChange={setClearDialogOpen}
        title="Limpar registros do RNC"
        description="Exclui permanentemente os registros da base administrativa do RNC no banco de dados. O painel já publicado não é afetado."
        periodRange={clearPeriod}
        onPeriodRangeChange={setClearPeriod}
        yearsInData={availableYears}
        fetchAffectedCount={fetchClearAffectedCount}
        affectedLabel="registro(s) de RNC"
        busy={busy}
        onConfirm={() => void executeClear()}
      />
    </div>
  );
}
