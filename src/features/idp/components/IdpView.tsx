"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Info,
  Loader2,
  Percent,
  RotateCw,
  Save,
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { chunk, DEFAULT_IMPORT_BATCH_SIZE } from "@/lib/batching";
import { fmtPct } from "@/lib/currency";
import { MONTH_NAMES_FULL } from "@/lib/dates";
import { notifyIndicatorDataChanged } from "@/lib/browser-events";
import { IndicatorAnalysisDialog } from "@/features/justifications/components/IndicatorAnalysisDialog";
import { parseIdpFile } from "@/features/idp/importers";
import { formatIdpUnitLabel, normalizeIdpUnitCode } from "@/features/idp/utils/units";
import { exportIdpPdf } from "@/features/idp/exports/pdf";
import type { IdpDetailedResult, IdpNormalizedRecord } from "@/features/idp/types";
import { formatPeriodOptionLabel, periodToOptionalFields, type PeriodRange } from "@/lib/period";

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
  historyStartYear: number;
  historyMonthStart: number;
  historyEndYear: number;
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
  /** Período travado (Ano + Semestre) — é sempre o que vai ser publicado. A
      competência efetiva (mês exato usado no cálculo) é resolvida pelo
      servidor como a mais recente com RSO dentro desse intervalo. */
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
  const [selectedUnit, setSelectedUnit] = useState("");
  const [excludedDisciplinesDraft, setExcludedDisciplinesDraft] = useState("");
  const [excludedUnits, setExcludedUnits] = useState<string[]>([]);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [unitDialogBusy, setUnitDialogBusy] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [publication, setPublication] = useState<PublicationSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearPeriod, setClearPeriod] = useState<PeriodRange | null>(null);
  const { availablePeriods, periodOptions, loadAvailablePeriods, detectNewPeriod } =
    usePublicationPeriodOptions("idp", publishYear, publishSemester);

  function prepareNextSemester() {
    const next = nextWorkingPeriod(publishYear, publishSemester);
    setPeriod(next.year, next.semester);
    setMessage(
      `Período de trabalho preparado: ${formatPeriodOptionLabel(next.year, next.semester)} · Sem dados.`,
    );
  }

  async function load(period: PeriodRange | null = effectivePeriod, nextThreshold = threshold) {
    setError(null);
    const params = new URLSearchParams();
    if (period) {
      params.set("periodStartYear", String(period.startYear));
      params.set("periodStartMonth", String(period.startMonth));
      params.set("periodEndYear", String(period.endYear));
      params.set("periodEndMonth", String(period.endMonth));
    }
    params.set("threshold", String(nextThreshold));
    const suffix = params.toString();
    const response = await fetch(`/api/idp${suffix ? `?${suffix}` : ""}`, { cache: "no-store" });
    if (!response.ok) throw await responseError(response, "Falha ao carregar o IDP.");
    const body = (await response.json()) as ApiResponse;
    setData(body);
    setThreshold(body.threshold * 100);
    setExcludedDisciplinesDraft(body.excludedDisciplines.join("\n"));
    setExcludedUnits(body.result.excludedUnits);
    setSelectedUnit((current) =>
      body.result.unitDetails.some((item) => item.unit === current)
        ? current
        : (body.result.unitDetails[0]?.unit ?? ""),
    );
  }

  async function loadPublication() {
    const response = await fetch(`/api/publicacoes/idp?${periodQueryString(publishPeriod)}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const body = (await response.json()) as { publication: PublicationSummary | null };
    setPublication(body.publication);
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePeriodKey]);

  useEffect(() => {
    void loadPublication();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishPeriod]);

  function updatePending(
    id: string,
    updater: (record: IdpNormalizedRecord) => IdpNormalizedRecord,
  ) {
    setPendingFiles((current) =>
      current.map((item) =>
        item.id === id && item.record ? { ...item, record: updater(item.record) } : item,
      ),
    );
  }

  const unitOptions = useMemo(() => {
    const codes = new Set<string>([
      ...(data?.documents.map((document) => normalizeIdpUnitCode(document.unit)) ?? []),
      ...excludedUnits.map(normalizeIdpUnitCode),
    ]);
    codes.delete("");
    return Array.from(codes)
      .sort((a, b) => formatIdpUnitLabel(a).localeCompare(formatIdpUnitLabel(b), "pt-BR"))
      .map((code) => ({ code, label: formatIdpUnitLabel(code) }));
  }, [data, excludedUnits]);

  async function saveExcludedUnits(next: string[]) {
    setUnitDialogBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/configuracoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "idp.excludedUnits", value: next }),
      });
      if (!response.ok)
        throw await responseError(response, "Falha ao salvar as unidades ignoradas.");
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
        const known = new Set(unitOptions.map((option) => option.code));
        const detected = parsed
          .map((item) => item.record?.unit)
          .filter((unit): unit is string => Boolean(unit));
        const hasNewUnit = detected.some((unit) => !known.has(normalizeIdpUnitCode(unit)));
        if (hasNewUnit) setUnitDialogOpen(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ler os PDFs RSO.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const validPendingCount = pendingFiles.filter((item) => isPendingRecordValid(item.record)).length;
  const invalidPendingCount = pendingFiles.filter(
    (item) => item.record && !isPendingRecordValid(item.record),
  ).length;

  async function importPendingFiles() {
    const records = pendingFiles.map((item) => item.record).filter(isPendingRecordValid);
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
      notifyIndicatorDataChanged();

      let importMessage = `Importação concluída: ${totals.inserted} nova(s) versão(ões), ${totals.updated} corrigida(s), ${totals.ignored} idêntica(s) e ${totals.rejected} rejeitada(s).`;
      const newPeriodMessage = detectNewPeriod(
        records.map((record) => ({ year: record.referenceYear!, month: record.referenceMonth! })),
        setPeriod,
      );
      if (newPeriodMessage) importMessage += ` ${newPeriodMessage}`;
      setMessage(importMessage);
      setPendingFiles([]);
      await load();
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
      const response = await fetch("/api/publicacoes/idp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodStartYear: publishPeriod.startYear,
          periodStartMonth: publishPeriod.startMonth,
          periodEndYear: publishPeriod.endYear,
          periodEndMonth: publishPeriod.endMonth,
          threshold,
        }),
      });
      if (!response.ok) throw await responseError(response, "Falha ao publicar o IDP.");
      const body = (await response.json()) as { publication: PublicationSummary };
      setPublication(body.publication);
      setMessage("IDP publicado com os RSOs exatos da competência mais recente do semestre.");
      window.dispatchEvent(new Event("idp:published"));
      window.dispatchEvent(new Event("indicator:published"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao publicar o IDP.");
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
    const response = await fetch(`/api/idp/registros?${params.toString()}`, {
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
      const response = await fetch("/api/idp/registros", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw await responseError(response, "Falha ao limpar os RSOs.");
      const responseBody = (await response.json()) as { deleted: number };
      notifyIndicatorDataChanged();
      setMessage(`${responseBody.deleted} versão(ões) de RSO removida(s).`);
      setPendingFiles([]);
      setProgress(null);
      setClearDialogOpen(false);
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
    <div className="flex flex-col gap-5">
      {data?.setupRequired ? (
        <div className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/5 px-3.5 py-3 text-sm font-medium text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            A tabela de versões do RSO ainda não existe. Execute{" "}
            <strong className="font-bold">pnpm db:upgrade:idp-rso</strong> no banco conectado.
          </span>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>RSO — controle semanal</CardTitle>
          <CardDescription>
            Cada PDF é uma versão semanal independente. O número do RSO identifica a versão; mês de
            referência, período e emissão são armazenados separadamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-card px-6 py-9 text-center transition-colors",
              dragging
                ? "border-primary bg-primary/5"
                : "hover:border-primary/50 hover:bg-muted/30",
            )}
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
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <UploadCloud className="size-5" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">
              Arraste os PDFs do RSO aqui, ou clique para escolher
            </h4>
            <p className="max-w-md text-xs text-muted-foreground">
              O sistema lê Unidade, RSO Nº, Mês ref., Período, Emissão, Execução e disciplinas.
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(event) => event.target.files && void prepareFiles(event.target.files)}
            />
          </div>
        </CardContent>
      </Card>

      {busy && !progress ? (
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
          Processando…
        </div>
      ) : null}

      {pendingFiles.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Pré-validação dos documentos</CardTitle>
            <CardDescription>
              Nenhum mês de referência é inferido por período, emissão ou data de upload. Se
              &ldquo;Mês ref.&rdquo; não for localizado, a definição manual é obrigatória.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-0">
            {pendingFiles.map((file) => {
              const record = file.record;
              if (file.error || !record) {
                return (
                  <div
                    key={file.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3"
                  >
                    <div className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
                      <div>
                        <div className="font-semibold text-foreground">{file.fileName}</div>
                        <div className="text-xs text-danger">
                          {file.error ?? "Falha ao interpretar o arquivo."}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPendingFiles((items) => items.filter((item) => item.id !== file.id))
                      }
                    >
                      <X className="size-3.5" />
                      Remover
                    </Button>
                  </div>
                );
              }

              const valid = isPendingRecordValid(record);
              const detectedCompetence =
                record.detectedReferenceYear && record.detectedReferenceMonth
                  ? competenceLabel(record.detectedReferenceYear, record.detectedReferenceMonth)
                  : "Não identificada";

              return (
                <div
                  key={file.id}
                  className={cn(
                    "rounded-lg border px-4 py-4",
                    valid ? "border-border bg-card" : "border-accent/40 bg-accent/5",
                  )}
                >
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{file.fileName}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Fonte do mês de referência:{" "}
                        {record.referenceOriginalText ?? "Mês ref. não localizado"}
                      </div>
                    </div>
                    <Badge variant={valid ? "success" : "warning"}>
                      {valid ? "Pronto para importar" : "Revisão obrigatória"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>Unidade</Label>
                      <Input
                        value={record.unit}
                        onChange={(event) =>
                          updatePending(file.id, (current) => ({
                            ...current,
                            unit: event.target.value,
                            unitAdjusted:
                              event.target.value.trim() !== (current.detectedUnit ?? "").trim(),
                          }))
                        }
                      />
                      <span className="text-[11px] text-muted-foreground">
                        Detectado: {record.detectedUnit ?? "—"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Número do RSO</Label>
                      <Input
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
                      <span className="text-[11px] text-muted-foreground">
                        Detectado: {record.detectedRsoNumero ?? "—"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Mês de referência</Label>
                      <Input
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
                              referenceSource:
                                adjusted || !current.detectedReferenceYear
                                  ? "MANUAL"
                                  : "PDF_MES_REF",
                            };
                          });
                        }}
                      />
                      <span className="text-[11px] text-muted-foreground">
                        Detectado: {detectedCompetence}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <ReadonlyField
                      label="Período"
                      value={periodLabel(record.periodStart, record.periodEnd)}
                      hint="Não altera o mês de referência"
                    />
                    <ReadonlyField
                      label="Emissão"
                      value={shortDate(record.emissionDate)}
                      hint="Data formal do documento"
                    />
                    <ReadonlyField
                      label="Execução"
                      value={`${record.execucaoFases.length} fase(s)`}
                      hint={`${record.areas.length} área(s) reconhecida(s)`}
                    />
                  </div>

                  {record.referenceAdjusted || record.unitAdjusted || record.rsoAdjusted ? (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">
                      <Info className="size-3.5 shrink-0" />
                      Ajuste manual rastreado: o valor detectado no PDF será preservado junto do
                      valor usado.
                    </div>
                  ) : null}

                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() =>
                      setPendingFiles((items) => items.filter((item) => item.id !== file.id))
                    }
                  >
                    <X className="size-3.5" />
                    Remover arquivo
                  </Button>
                </div>
              );
            })}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                disabled={busy || validPendingCount === 0}
                onClick={() => void importPendingFiles()}
              >
                <UploadCloud className="size-3.5" />
                Importar {validPendingCount} RSO(s)
              </Button>
              {invalidPendingCount ? (
                <Badge variant="warning">
                  {invalidPendingCount} documento(s) aguardando revisão
                </Badge>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {progress ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-3 text-xs font-medium text-primary">
          <span className="flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" />
            Processando lote {progress.currentBatch}/{progress.totalBatches} — {progressPct}%
          </span>
          <span>Inseridos: {progress.inserted}</span>
          <span>Atualizados: {progress.updated}</span>
          <span>Ignorados: {progress.ignored}</span>
          <span>Rejeitados: {progress.rejected}</span>
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

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Contexto de publicação</CardTitle>
              <CardDescription>
                Defina o período de trabalho, a meta e as ações aplicadas ao cálculo e à
                publicação do IDP. A competência efetiva é sempre o RSO mais recente dentro do
                semestre — &ldquo;Detalhar meses&rdquo; só restringe a visualização.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">
                {publishYear} {publishSemester}
              </Badge>
              <Badge variant={result?.activeDocuments ? "success" : "outline"}>
                {result?.activeDocuments ?? 0} RSO(s) ativo(s)
              </Badge>
              <Badge variant={publication ? "success" : "secondary"}>
                {publication ? "Publicado" : "Rascunho"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PublicationPeriodField
              fieldId="idpPeriodSelect"
              year={publishYear}
              semester={publishSemester}
              onChange={setPeriod}
              periodOptions={periodOptions}
              availablePeriods={availablePeriods}
              publishPeriod={publishPeriod}
              viewFilter={viewFilter}
              onViewFilterChange={setViewFilter}
              yearsInData={data?.years ?? []}
              onPrepareNextSemester={prepareNextSemester}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-l-4 border-primary bg-primary/5 px-3 py-2.5 text-xs">
                <strong className="font-bold text-foreground">
                  Competência efetiva:{" "}
                  {competenceLabel(data?.selectedYear ?? publishYear, data?.selectedMonth ?? 1)}
                </strong>
                <span className="text-muted-foreground">
                  {result?.activeDocuments ?? 0} RSO(s) ativo(s). Nenhuma versão de outro mês é
                  reutilizada.
                </span>
              </div>
            </PublicationPeriodField>

            <div className="flex flex-col gap-1.5">
              <Label>Meta (%)</Label>
              <Input
                type="number"
                min={0}
                max={200}
                value={threshold}
                onChange={(event) => setThreshold(Number(event.target.value))}
                className="w-28"
              />
              <p className="text-xs text-muted-foreground">
                Não muda quais RSOs são usados. Define a aderência mínima para marcar
                &ldquo;Dentro da meta&rdquo; aqui e no Painel de{" "}
                {formatPeriodOptionLabel(publishYear, publishSemester)}.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
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
              module="idp"
              moduleLabel="IDP — Cronograma"
              target={threshold}
              years={data?.years ?? []}
              defaultYear={data?.selectedYear ?? publishYear}
              defaultMonth={data?.selectedMonth ?? 1}
            />
            {result?.activeDocuments ? (
              <Button variant="outline" size="sm" onClick={() => exportIdpPdf(result)}>
                <Download className="size-3.5" />
                Baixar PDF
              </Button>
            ) : null}
            {canClear ? (
              <Button
                variant="destructive"
                size="sm"
                disabled={busy || !data?.total}
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
                disabled={busy || !result?.activeDocuments}
                onClick={() => void publish()}
              >
                <Send className="size-3.5" />
                Publicar {publishYear} {publishSemester}
              </Button>
            ) : null}
          </div>
          {publication ? (
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <CheckCircle2 className="size-3.5 shrink-0 text-success" />
              Já existe uma publicação ativa para{" "}
              <strong>
                {publishSemester} {publishYear}
              </strong>{" "}
              — versão {publication.version}, publicada em{" "}
              {new Date(publication.publishedAt).toLocaleString("pt-BR")} por{" "}
              {publication.publishedBy.name}. Publicar novamente cria uma nova versão para este
              ciclo.
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canPublish ? (
        <Card>
          <CardHeader>
            <CardTitle>Disciplinas desconsideradas</CardTitle>
            <CardDescription>
              As versões continuam armazenadas; a exclusão afeta apenas os cálculos por disciplina.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-start gap-3 pt-0">
            <Textarea
              rows={3}
              value={excludedDisciplinesDraft}
              onChange={(event) => setExcludedDisciplinesDraft(event.target.value)}
              className="min-w-[320px] flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void saveExcludedDisciplines()}
            >
              <Save className="size-3.5" />
              Salvar exclusões
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {data?.documents.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Histórico de versões RSO</CardTitle>
            <CardDescription>
              Todos os documentos permanecem no banco. &ldquo;Em cálculo&rdquo; marca a maior versão
              de cada unidade no mês analisado.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unidade</TableHead>
                  <TableHead>RSO</TableHead>
                  <TableHead>Ref.</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Emissão</TableHead>
                  <TableHead>Origem ref.</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>1ª importação</TableHead>
                  <TableHead>Última atualização</TableHead>
                  <TableHead>Uso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell className="font-medium">
                      {document.unit}
                      {document.unitAdjusted ? <InlineAudit>ajustada</InlineAudit> : null}
                    </TableCell>
                    <TableCell>
                      RSO {document.rsoNumero}
                      {document.rsoAdjusted ? <InlineAudit>ajustado</InlineAudit> : null}
                    </TableCell>
                    <TableCell>
                      {competenceLabel(document.referenceYear, document.referenceMonth)}
                      {document.referenceAdjusted ? <InlineAudit>manual</InlineAudit> : null}
                    </TableCell>
                    <TableCell>{periodLabel(document.periodStart, document.periodEnd)}</TableCell>
                    <TableCell>{shortDate(document.emissionDate)}</TableCell>
                    <TableCell>
                      <div>
                        {document.referenceSource === "PDF_MES_REF"
                          ? "Mês ref. do PDF"
                          : "Ajuste manual"}
                      </div>
                      {document.referenceOriginalText ? (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {document.referenceOriginalText}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate" title={document.fileName}>
                      {document.fileName}
                    </TableCell>
                    <TableCell>
                      <div>{new Date(document.createdAt).toLocaleString("pt-BR")}</div>
                      {document.firstImportedBy ? (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          por {document.firstImportedBy}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div>{new Date(document.updatedAt).toLocaleString("pt-BR")}</div>
                      {document.lastUpdatedBy ? (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          por {document.lastUpdatedBy}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {document.active ? (
                        <Badge variant="success">Em cálculo</Badge>
                      ) : document.sameCompetence ? (
                        <Badge variant="outline">Histórico do mês analisado</Badge>
                      ) : (
                        <Badge variant="outline">Outro mês</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {result?.activeDocuments ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <AdminMetricCard
              label="Aderência geral (Execução)"
              value={fmtPct(result.aderenciaGeral)}
              icon={Percent}
              tone="success"
            />
            <AdminMetricCard
              label="RSOs ativos"
              value={String(result.activeDocuments)}
              icon={FileText}
            />
            <DisciplineMetric
              label="Civil"
              value={rowByName.get("01 - Civil")?.aderencia ?? null}
              threshold={result.threshold}
            />
            <DisciplineMetric
              label="Mecânica"
              value={rowByName.get("02 - Mecânica")?.aderencia ?? null}
              threshold={result.threshold}
            />
            <DisciplineMetric
              label="Elétrica"
              value={rowByName.get("04 - Elétrica")?.aderencia ?? null}
              threshold={result.threshold}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Execução geral por unidade</CardTitle>
              <CardDescription>
                Fonte: página 1 → Avanços por Etapa → linha Execução → acumulado. A maior versão
                semanal do mês analisado é usada.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Unidade</TableHead>
                    <TableHead>RSO utilizado</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Ref.</TableHead>
                    <TableHead className="text-right">Fases</TableHead>
                    <TableHead className="text-right">Prev. acum.</TableHead>
                    <TableHead className="text-right">Real acum.</TableHead>
                    <TableHead className="text-right">Aderência</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.unitRows.map((unit) => {
                    const key = `unit-${unit.unit}`;
                    const open = expanded.has(key);
                    const ok = unit.aderencia >= result.threshold;
                    return (
                      <Fragment key={key}>
                        <TableRow
                          className="group cursor-pointer"
                          onClick={() => toggle(key)}
                          aria-expanded={open}
                          title={open ? "Clique para recolher" : "Clique para expandir"}
                        >
                          <TableCell>
                            <ExpandIcon open={open} />
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatIdpUnitLabel(unit.unit)}
                          </TableCell>
                          <TableCell className="font-semibold">RSO {unit.rsoNumero}</TableCell>
                          <TableCell>{periodLabel(unit.periodStart, unit.periodEnd)}</TableCell>
                          <TableCell>
                            {competenceLabel(unit.referenceYear, unit.referenceMonth)}
                            {unit.referenceAdjusted ? <InlineAudit>manual</InlineAudit> : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{unit.nFases}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {accumulated(unit.prevAcum)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {accumulated(unit.realAcum)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            {fmtPct(unit.aderencia)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={unit.excluded ? "outline" : ok ? "success" : "destructive"}
                            >
                              {unit.excluded ? "Ignorada" : ok ? "Dentro da meta" : "Fora da meta"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                        {open ? (
                          <>
                            <TableRow className="bg-primary/5 hover:bg-primary/5">
                              <TableCell />
                              <TableCell colSpan={9} className="text-xs text-muted-foreground">
                                <strong className="font-semibold text-foreground">
                                  Rastreabilidade:
                                </strong>{" "}
                                arquivo {unit.fileName} · emissão {shortDate(unit.emissionDate)} ·
                                mês de referência{" "}
                                {unit.referenceSource === "PDF_MES_REF"
                                  ? `lida de ${unit.referenceOriginalText ?? "Mês ref."}`
                                  : `ajustada manualmente (original: ${unit.referenceOriginalText ?? "não identificado"})`}
                                .
                              </TableCell>
                            </TableRow>
                            {unit.fases.map((phase, phaseIndex) => (
                              <TableRow
                                className="bg-muted/30 text-xs hover:bg-muted/30"
                                key={`${key}-${phaseIndex}`}
                              >
                                <TableCell />
                                <TableCell className="text-muted-foreground">
                                  {phase.label}
                                </TableCell>
                                <TableCell />
                                <TableCell />
                                <TableCell />
                                <TableCell />
                                <TableCell className="text-right tabular-nums text-muted-foreground">
                                  {accumulated(phase.prevAcum)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">
                                  {accumulated(phase.realAcum)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">
                                  {fmtPct(phase.prevAcum ? phase.realAcum / phase.prevAcum : 0)}
                                </TableCell>
                                <TableCell />
                              </TableRow>
                            ))}
                          </>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Aderência por disciplina</CardTitle>
              <CardDescription>
                Média das áreas do RSO ativo de cada unidade no mês analisado.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Disciplina</TableHead>
                    <TableHead className="text-right">Áreas usadas</TableHead>
                    <TableHead className="text-right">Prev. médio</TableHead>
                    <TableHead className="text-right">Real médio</TableHead>
                    <TableHead className="text-right">Aderência</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.disciplineRows.map((row, rowIndex) => {
                    const key = `discipline-${rowIndex}`;
                    const open = expanded.has(key);
                    if (row.aderencia === null || row.prevAvg === null || row.realAvg === null) {
                      return (
                        <TableRow key={key}>
                          <TableCell />
                          <TableCell className="font-medium">{row.discipline}</TableCell>
                          <TableCell className="text-right tabular-nums">0</TableCell>
                          <TableCell className="text-right">—</TableCell>
                          <TableCell className="text-right">—</TableCell>
                          <TableCell className="text-right">—</TableCell>
                          <TableCell>
                            <Badge variant="outline">Sem dados</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    }
                    const ok = row.aderencia >= result.threshold;
                    return (
                      <Fragment key={key}>
                        <TableRow
                          className="group cursor-pointer"
                          onClick={() => toggle(key)}
                          aria-expanded={open}
                          title={open ? "Clique para recolher" : "Clique para expandir"}
                        >
                          <TableCell>
                            <ExpandIcon open={open} />
                          </TableCell>
                          <TableCell className="font-medium">{row.discipline}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.entries.length}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {accumulated(row.prevAvg)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {accumulated(row.realAvg)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            {fmtPct(row.aderencia)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={ok ? "success" : "destructive"}>
                              {ok ? "Dentro da meta" : "Fora da meta"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                        {open
                          ? row.unitGroups.map((group) => (
                              <TableRow
                                className="bg-muted/30 text-xs hover:bg-muted/30"
                                key={`${key}-${group.unit}`}
                              >
                                <TableCell />
                                <TableCell className="text-muted-foreground">
                                  {formatIdpUnitLabel(group.unit)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">
                                  {group.entries.length}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">
                                  {accumulated(group.prevAvg)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">
                                  {accumulated(group.realAvg)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">
                                  {fmtPct(group.aderencia)}
                                </TableCell>
                                <TableCell />
                              </TableRow>
                            ))
                          : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 space-y-0">
              <div>
                <CardTitle>Detalhamento por unidade</CardTitle>
                <CardDescription>
                  Expanda as disciplinas para chegar às áreas originais do RSO ativo.
                </CardDescription>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="idpUnitDetailSelect">Unidade</Label>
                <Select
                  id="idpUnitDetailSelect"
                  value={selectedUnit}
                  onChange={(event) => setSelectedUnit(event.target.value)}
                  className="w-48"
                >
                  {result.unitDetails.map((unit) => (
                    <option value={unit.unit} key={unit.unit}>
                      {formatIdpUnitLabel(unit.unit)}
                    </option>
                  ))}
                </Select>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Disciplina / área</TableHead>
                    <TableHead className="text-right">Áreas usadas</TableHead>
                    <TableHead className="text-right">Prev. acum.</TableHead>
                    <TableHead className="text-right">Real acum.</TableHead>
                    <TableHead className="text-right">Aderência</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail?.disciplines.length ? (
                    detail.disciplines.map((discipline, index) => {
                      const key = `area-${detail.unit}-${index}`;
                      const open = expanded.has(key);
                      return (
                        <Fragment key={key}>
                          <TableRow
                            className="group cursor-pointer"
                            onClick={() => toggle(key)}
                            aria-expanded={open}
                            title={open ? "Clique para recolher" : "Clique para expandir"}
                          >
                            <TableCell>
                              <ExpandIcon open={open} />
                            </TableCell>
                            <TableCell className="font-medium">{discipline.discipline}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {discipline.n}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {accumulated(discipline.prevAvg)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {accumulated(discipline.realAvg)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-semibold">
                              {fmtPct(discipline.aderencia)}
                            </TableCell>
                          </TableRow>
                          {open
                            ? discipline.areas.map((area, areaIndex) => (
                                <TableRow
                                  className="bg-muted/30 text-xs hover:bg-muted/30"
                                  key={`${key}-${areaIndex}`}
                                >
                                  <TableCell />
                                  <TableCell className="text-muted-foreground">
                                    {area.area}
                                  </TableCell>
                                  <TableCell />
                                  <TableCell className="text-right tabular-nums text-muted-foreground">
                                    {accumulated(area.prevAcum)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-muted-foreground">
                                    {accumulated(area.realAcum)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-muted-foreground">
                                    {fmtPct(area.prevAcum ? area.realAcum / area.prevAcum : 0)}
                                  </TableCell>
                                </TableRow>
                              ))
                            : null}
                        </Fragment>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Nenhuma disciplina reconhecida para esta unidade.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="flex flex-col items-center gap-3 border-dashed px-8 py-14 text-center">
          <Badge variant="secondary" className="uppercase tracking-wide">
            Sem RSO neste mês
          </Badge>
          <CardTitle className="text-base">
            {competenceLabel(data?.selectedYear ?? publishYear, data?.selectedMonth ?? 1)}
          </CardTitle>
          <CardDescription className="max-w-sm">
            O sistema não reutiliza automaticamente RSOs de meses anteriores. Importe um RSO para
            este semestre ou selecione outro semestre em &ldquo;Período de publicação&rdquo;.
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
        description="Unidades marcadas continuam visíveis no histórico de RSOs, mas ficam de fora da execução geral, das disciplinas e do painel publicado."
      />

      <ClearRecordsDialog
        open={clearDialogOpen}
        onOpenChange={setClearDialogOpen}
        title="Limpar registros do IDP"
        description="Exclui permanentemente os RSOs da base administrativa do IDP no banco de dados. O painel já publicado não é afetado."
        periodRange={clearPeriod}
        onPeriodRangeChange={setClearPeriod}
        yearsInData={data?.years ?? []}
        fetchAffectedCount={fetchClearAffectedCount}
        affectedLabel="RSO(s) de IDP"
        busy={busy}
        onConfirm={() => void executeClear()}
      />
    </div>
  );
}

function ReadonlyField({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex h-9 items-center rounded-lg border border-border bg-muted/40 px-3 text-sm font-medium text-foreground">
        {value}
      </div>
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    </div>
  );
}

function InlineAudit({ children }: { children: ReactNode }) {
  return <span className="ml-1 text-[10px] font-bold text-accent-foreground/70">{children}</span>;
}

function ExpandIcon({ open }: { open: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted/60 text-muted-foreground transition-colors",
        "group-hover:border-primary/40 group-hover:bg-primary/10 group-hover:text-primary",
        open && "border-primary/40 bg-primary/10 text-primary",
      )}
    >
      <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
    </span>
  );
}

function DisciplineMetric({
  label,
  value,
  threshold,
}: {
  label: string;
  value: number | null;
  threshold: number;
}) {
  const hasData = value !== null;
  const ok = hasData && value >= threshold;
  return (
    <AdminMetricCard
      label={label}
      value={value !== null ? fmtPct(value) : "—"}
      valueClassName="text-xl"
      icon={Percent}
      tone={hasData ? (ok ? "success" : "destructive") : "default"}
      badge={
        <Badge variant={hasData ? (ok ? "success" : "destructive") : "outline"}>
          {hasData ? (ok ? "Dentro da meta" : "Fora da meta") : "Sem dados"}
        </Badge>
      }
    />
  );
}
