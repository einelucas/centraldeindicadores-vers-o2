"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
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
import { parseIdpFile } from "@/features/idp/importers";
import { exportIdpPdf } from "@/features/idp/exports/pdf";
import type { IdpDetailedResult, IdpNormalizedRecord } from "@/features/idp/types";

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
  historyMonthStart: number;
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
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [historyMonthStart, setHistoryMonthStart] = useState(1);
  const [historyMonthEnd, setHistoryMonthEnd] = useState(12);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [excludedDisciplinesDraft, setExcludedDisciplinesDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [publication, setPublication] = useState<PublicationSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load(
    filters?: Partial<{
      year: number;
      month: number;
      historyStart: number;
      historyEnd: number;
      threshold: number;
    }>,
    useCurrentSelection = true,
  ) {
    setError(null);
    const params = new URLSearchParams();
    const year = filters?.year ?? (useCurrentSelection ? selectedYear : undefined);
    const month = filters?.month ?? (useCurrentSelection ? selectedMonth : undefined);
    const historyStart =
      filters?.historyStart ?? (useCurrentSelection ? historyMonthStart : undefined);
    const historyEnd = filters?.historyEnd ?? (useCurrentSelection ? historyMonthEnd : undefined);
    const target = filters?.threshold ?? (useCurrentSelection ? threshold : undefined);
    if (year !== undefined) params.set("year", String(year));
    if (month !== undefined) params.set("month", String(month));
    if (historyStart !== undefined) params.set("historyStart", String(historyStart));
    if (historyEnd !== undefined) params.set("historyEnd", String(historyEnd));
    if (target !== undefined) params.set("threshold", String(target));
    const suffix = params.toString();
    const response = await fetch(`/api/idp${suffix ? `?${suffix}` : ""}`, { cache: "no-store" });
    if (!response.ok) throw await responseError(response, "Falha ao carregar o IDP.");
    const body = (await response.json()) as ApiResponse;
    setData(body);
    setSelectedYear(body.selectedYear);
    setSelectedMonth(body.selectedMonth);
    setHistoryMonthStart(body.historyMonthStart);
    setHistoryMonthEnd(body.historyMonthEnd);
    setThreshold(body.threshold * 100);
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
    void Promise.all([
      load(undefined, false).catch((err: Error) => setError(err.message)),
      loadPublication(),
    ]);
    // A primeira leitura não envia mês/ano: a API abre a competência mais recente realmente armazenada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      setMessage(
        `Importação concluída: ${totals.inserted} nova(s) versão(ões), ${totals.updated} corrigida(s), ${totals.ignored} idêntica(s) e ${totals.rejected} rejeitada(s).`,
      );
      setPendingFiles([]);
      const importedCompetence = records
        .filter((record) => record.referenceYear && record.referenceMonth)
        .map((record) => ({ year: record.referenceYear!, month: record.referenceMonth! }))
        .sort((a, b) => b.year - a.year || b.month - a.month)[0];
      if (importedCompetence) {
        await load({
          year: importedCompetence.year,
          month: importedCompetence.month,
          historyStart: Math.min(historyMonthStart, importedCompetence.month),
          historyEnd: Math.max(historyMonthEnd, importedCompetence.month),
          threshold,
        });
      } else {
        await load(undefined, false);
      }
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
          month: selectedMonth,
          historyStart: historyMonthStart,
          historyEnd: historyMonthEnd,
          threshold,
        }),
      });
      if (!response.ok) throw await responseError(response, "Falha ao publicar o IDP.");
      const body = (await response.json()) as { publication: PublicationSummary };
      setPublication(body.publication);
      setMessage("IDP publicado com os RSOs exatos do mês analisado.");
      window.dispatchEvent(new Event("idp:published"));
      window.dispatchEvent(new Event("indicator:published"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao publicar o IDP.");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (
      !window.confirm(
        "Excluir todo o histórico administrativo de RSOs do IDP? A publicação ativa será preservada.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/idp/registros", { method: "DELETE" });
      if (!response.ok) throw await responseError(response, "Falha ao limpar os RSOs.");
      const body = (await response.json()) as { deleted: number };
      setMessage(`${body.deleted} versão(ões) de RSO removida(s).`);
      setPendingFiles([]);
      setProgress(null);
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
          <CardTitle>Mês analisado e ajustes de cálculo</CardTitle>
          <CardDescription>
            Dois grupos com papéis diferentes: um define quais RSOs entram na conta e vão para o
            Painel; o outro só ajusta como esse resultado é exibido, sem trocar os dados usados.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <h4 className="text-sm font-semibold text-foreground">
                Mês analisado — define os dados do Painel
              </h4>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Escolha o ano e o mês. São os RSOs deste mês que alimentam todas as tabelas abaixo e
                são exatamente os que vão para o Painel quando você clicar em
                &ldquo;Publicar&rdquo;.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Ano</Label>
                  <Select
                    value={selectedYear}
                    onChange={(event) => setSelectedYear(Number(event.target.value))}
                  >
                    {(data?.years ?? [selectedYear]).map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Mês analisado</Label>
                  <Select
                    value={selectedMonth}
                    onChange={(event) => setSelectedMonth(Number(event.target.value))}
                  >
                    {MONTH_NAMES_FULL.map((month, index) => (
                      <option key={month} value={index + 1}>
                        {month}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border-l-4 border-primary bg-primary/5 px-3 py-2.5 text-xs">
                <strong className="font-bold text-foreground">
                  Mês analisado:{" "}
                  {competenceLabel(
                    data?.selectedYear ?? selectedYear,
                    data?.selectedMonth ?? selectedMonth,
                  )}
                </strong>
                <span className="text-muted-foreground">
                  {result?.activeDocuments ?? 0} RSO(s) ativo(s). Nenhuma versão de outro mês é
                  reutilizada.
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <h4 className="text-sm font-semibold text-foreground">Intervalo do gráfico e meta</h4>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Não mudam quais RSOs são usados. &ldquo;De / Até&rdquo; define quais meses aparecem
                no gráfico de tendência do Painel publicado. &ldquo;Meta&rdquo; define a aderência
                mínima para marcar &ldquo;Dentro da meta&rdquo; aqui e no Painel.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Gráfico — de</Label>
                  <Select
                    value={historyMonthStart}
                    onChange={(event) => setHistoryMonthStart(Number(event.target.value))}
                  >
                    {MONTH_NAMES_FULL.map((month, index) => (
                      <option key={month} value={index + 1}>
                        {month}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Gráfico — até</Label>
                  <Select
                    value={historyMonthEnd}
                    onChange={(event) => setHistoryMonthEnd(Number(event.target.value))}
                  >
                    {MONTH_NAMES_FULL.map((month, index) => (
                      <option key={month} value={index + 1}>
                        {month}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Meta (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={200}
                    value={threshold}
                    onChange={(event) => setThreshold(Number(event.target.value))}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void load({
                    year: selectedYear,
                    month: selectedMonth,
                    historyStart: historyMonthStart,
                    historyEnd: historyMonthEnd,
                    threshold,
                  })
                }
              >
                <RotateCw className="size-3.5" />
                Recalcular
              </Button>
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
                  onClick={() => void clearAll()}
                >
                  <Trash2 className="size-3.5" />
                  Limpar histórico
                </Button>
              ) : null}
            </div>
            {canPublish ? (
              <Button
                variant="success"
                disabled={busy || !result?.activeDocuments}
                onClick={() => void publish()}
              >
                <Send className="size-3.5" />
                Publicar
              </Button>
            ) : null}
          </div>
          {publication ? (
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <CheckCircle2 className="size-3.5 shrink-0 text-success" />
              Última publicação: versão {publication.version} ·{" "}
              {new Date(publication.publishedAt).toLocaleString("pt-BR")} ·{" "}
              {publication.publishedBy.name}
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
                          <TableCell className="font-medium">{unit.unit}</TableCell>
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
                            <Badge variant={ok ? "success" : "destructive"}>
                              {ok ? "Dentro da meta" : "Fora da meta"}
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
                                  {group.unit}
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
                      {unit.unit}
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
            {competenceLabel(
              data?.selectedYear ?? selectedYear,
              data?.selectedMonth ?? selectedMonth,
            )}
          </CardTitle>
          <CardDescription className="max-w-sm">
            O sistema não reutiliza automaticamente RSOs de meses anteriores. Importe um RSO para
            este mês ou selecione outro mês analisado.
          </CardDescription>
        </Card>
      )}
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
