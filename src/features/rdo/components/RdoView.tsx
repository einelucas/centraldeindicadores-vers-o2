"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  RotateCw,
  Send,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { UnitExclusionDialog } from "@/components/admin/UnitExclusionDialog";
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
import { MONTH_NAMES_FULL } from "@/lib/dates";
import { importRdoFiles, type RdoFileParseResult } from "@/features/rdo/importers";
import { exportRdoPdf } from "@/features/rdo/exports/pdf";
import type { RdoNormalizedRecord, RdoResult } from "@/features/rdo/types";

interface ApiResponse {
  total: number;
  threshold: number;
  result: RdoResult;
  detalheLimitado: boolean;
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

export function RdoView({ canPublish, canClear }: { canPublish: boolean; canClear: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [threshold, setThreshold] = useState(80);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [files, setFiles] = useState<RdoFileParseResult[]>([]);
  const [duplicates, setDuplicates] = useState(0);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [publication, setPublication] = useState<PublicationSummary | null>(null);
  const [unitFilter, setUnitFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [excludedUnits, setExcludedUnits] = useState<string[]>([]);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [unitDialogBusy, setUnitDialogBusy] = useState(false);

  const load = useCallback(
    async (nextThreshold = threshold) => {
      setError(null);
      const response = await fetch(`/api/rdo?threshold=${encodeURIComponent(nextThreshold)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Falha ao carregar os dados do RDO.");
      const body = (await response.json()) as ApiResponse;
      setData(body);
      setExcludedUnits(body.result.excludedUnits);
    },
    [threshold],
  );

  const loadPublication = useCallback(async () => {
    const response = await fetch("/api/publicacoes/rdo", { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as { publication: PublicationSummary | null };
    setPublication(body.publication);
  }, []);

  useEffect(() => {
    void Promise.all([load().catch((err: Error) => setError(err.message)), loadPublication()]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const unitOptions = useMemo(() => {
    const codes = new Set<string>([
      ...(data?.result.units.map((unit) => unit.name) ?? []),
      ...excludedUnits,
    ]);
    codes.delete("");
    return Array.from(codes)
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((code) => ({ code, label: code }));
  }, [data, excludedUnits]);

  async function saveExcludedUnits(next: string[]) {
    setUnitDialogBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rdo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedUnits: next }),
      });
      if (!response.ok) throw new Error("Falha ao salvar as unidades ignoradas.");
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

  async function processFiles(fileList: FileList | File[]) {
    const selected = Array.from(fileList);
    if (!selected.length) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setProgress(null);

    try {
      const parsed = await importRdoFiles(selected);
      setFiles(parsed.perFile);
      setDuplicates(parsed.duplicates);

      const valid = parsed.records;
      if (!valid.length) {
        throw new Error(
          parsed.perFile.find((file) => file.error)?.error ?? "Nenhum registro válido encontrado.",
        );
      }

      const known = new Set(unitOptions.map((option) => option.code));
      const detected = new Set(valid.map((record) => record.empresaNome.trim()));
      const hasNewUnit = Array.from(detected).some((code) => code && !known.has(code));

      const batches = chunk(valid, DEFAULT_IMPORT_BATCH_SIZE);
      setProgress({
        totalFound: valid.length,
        currentBatch: 0,
        totalBatches: batches.length,
        inserted: 0,
        ignored: 0,
        updated: 0,
        rejected: 0,
      });

      const start = await fetch("/api/importacoes/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: "rdo",
          fileName: selected.map((file) => file.name).join(", "),
          totalFound: valid.length,
        }),
      });
      if (!start.ok) throw new Error("Falha ao iniciar a importação no servidor.");
      const { importJobId } = (await start.json()) as { importJobId: string };

      let totals = { inserted: 0, ignored: 0, updated: 0, rejected: 0 };
      for (let index = 0; index < batches.length; index++) {
        const records = (batches[index] ?? []).map((record: RdoNormalizedRecord) => ({
          dataReferencia: record.dataReferencia.toISOString(),
          empresaNome: record.empresaNome,
          statusDescricao: record.statusDescricao,
          relatorioId: record.relatorioId,
          grupo: record.grupo,
          disciplina: record.disciplina,
          year: record.year,
          month: record.month,
          raw: record.raw,
        }));
        const response = await fetch(`/api/importacoes/${importJobId}/lotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchNumber: index + 1, records }),
        });
        if (!response.ok) throw new Error(`Falha ao processar o lote ${index + 1}.`);
        const current = (await response.json()) as typeof totals;
        totals = {
          inserted: totals.inserted + current.inserted,
          ignored: totals.ignored + current.ignored,
          updated: totals.updated + current.updated,
          rejected: totals.rejected + current.rejected,
        };
        setProgress({
          totalFound: valid.length,
          currentBatch: index + 1,
          totalBatches: batches.length,
          ...totals,
        });
      }

      const finish = await fetch(`/api/importacoes/${importJobId}/finalizar`, { method: "POST" });
      if (!finish.ok) throw new Error("Os lotes foram enviados, mas a finalização falhou.");

      setMessage(
        `Importação concluída: ${totals.inserted} inserido(s), ${totals.updated} atualizado(s), ${totals.ignored} ignorado(s).`,
      );
      await load();
      if (hasNewUnit) setUnitDialogOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na importação.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function publish() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/publicacoes/rdo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        publication?: PublicationSummary;
      };
      if (!response.ok) throw new Error(body.error ?? "Falha ao publicar o RDO.");
      if (body.publication) setPublication(body.publication);
      setMessage("RDO publicado no painel com sucesso.");
      window.dispatchEvent(new Event("rdo:published"));
      window.dispatchEvent(new Event("indicator:published"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao publicar.");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (
      !window.confirm(
        "Excluir todos os registros administrativos de RDO? O painel já publicado continuará preservado.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rdo/registros", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        deleted?: number;
      };
      if (!response.ok) throw new Error(body.error ?? "Falha ao limpar os registros.");
      setMessage(`${body.deleted ?? 0} registro(s) removido(s).`);
      setFiles([]);
      setDuplicates(0);
      setProgress(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao limpar os registros.");
    } finally {
      setBusy(false);
    }
  }

  const result = data?.result;
  const pct = progress?.totalBatches
    ? Math.round((progress.currentBatch / progress.totalBatches) * 100)
    : 0;
  const filteredUnits = useMemo(() => {
    if (!result) return [];
    return unitFilter === "all"
      ? result.units
      : result.units.filter((unit) => unit.name === unitFilter);
  }, [result, unitFilter]);
  const filteredUnitAverage = useMemo(() => {
    if (!filteredUnits.length) return 0;
    return filteredUnits.reduce((sum, unit) => sum + unit.aderencia, 0) / filteredUnits.length;
  }, [filteredUnits]);
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
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!busy) void processFiles(event.dataTransfer.files);
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
          Arraste os arquivos de RDOs aqui, ou clique para escolher
        </h4>
        <p className="max-w-md text-xs text-muted-foreground">
          Pode soltar vários arquivos de uma vez (uma unidade por arquivo, ou exportações de
          períodos diferentes). Aceita .xlsx ou .csv com as colunas: data, status_descricao,
          empresa_nome.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(event) => event.target.files && void processFiles(event.target.files)}
        />
      </div>

      {busy && progress ? (
        <div className="rounded-lg border border-border bg-muted/30 px-3.5 py-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
            Processando lote {progress.currentBatch}/{progress.totalBatches} — {pct}%
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : null}

      {files.length ? (
        <div className="flex flex-wrap gap-2">
          {files.map((file) => (
            <Badge
              key={`${file.fileName}-${file.count}`}
              variant={file.error ? "destructive" : "secondary"}
              className="gap-1.5 py-1.5 font-medium"
            >
              <FileSpreadsheet className="size-3" />
              {file.fileName} ·{" "}
              {file.error ? `erro: ${file.error}` : `${file.count.toLocaleString("pt-BR")} linhas`}
            </Badge>
          ))}
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

      {result && data.total > 0 ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rdoThreshold">Meta de aderência (%)</Label>
                <Input
                  id="rdoThreshold"
                  type="number"
                  min={0}
                  max={100}
                  value={threshold}
                  onChange={(event) => setThreshold(Number(event.target.value))}
                  className="w-24"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void load(threshold).catch((err: Error) => setError(err.message))}
              >
                <RotateCw className="size-3.5" />
                Recalcular
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportRdoPdf(result, threshold)}>
                <Download className="size-3.5" />
                Baixar PDF
              </Button>
              {canClear ? (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => void clearAll()}
                >
                  <Trash2 className="size-3.5" />
                  Limpar tudo
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => setUnitDialogOpen(true)}>
                <Ban className="size-3.5" />
                Ignorar unidades
                {excludedUnits.length ? (
                  <Badge variant="outline" className="ml-0.5">
                    {excludedUnits.length}
                  </Badge>
                ) : null}
              </Button>
            </div>
            {canPublish ? (
              <Button variant="success" disabled={busy} onClick={() => void publish()}>
                <Send className="size-3.5" />
                Publicar no Painel
              </Button>
            ) : null}
          </div>

          {duplicates > 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-xs font-semibold text-accent-foreground">
              <Info className="size-3.5 shrink-0 text-accent" />
              {duplicates.toLocaleString("pt-BR")} linha(s) idêntica(s) repetida(s) entre os
              arquivos — contadas uma única vez.
            </div>
          ) : null}
          {publication ? (
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <CheckCircle2 className="size-3.5 shrink-0 text-success" />
              Publicado em {new Date(publication.publishedAt).toLocaleString("pt-BR")} por{" "}
              {publication.publishedBy.name} · versão {publication.version}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <AdminMetricCard
              label="Total emitidos"
              value={result.totalEmitidos.toLocaleString("pt-BR")}
              icon={FileSpreadsheet}
            />
            <AdminMetricCard
              label="Aprovados"
              value={formatPct(
                result.totalEmitidos ? result.totalAprovados / result.totalEmitidos : 0,
              )}
              sub={`${result.totalAprovados.toLocaleString("pt-BR")} relatórios`}
              icon={CheckCircle2}
              tone="success"
            />
            <AdminMetricCard
              label="A revisar"
              value={formatPct(
                result.totalEmitidos ? result.totalRevisar / result.totalEmitidos : 0,
              )}
              sub={`${result.totalRevisar.toLocaleString("pt-BR")} relatórios`}
              icon={AlertTriangle}
              tone="warning"
            />
            <AdminMetricCard
              label="Preenchendo"
              value={formatPct(
                result.totalEmitidos ? result.totalPreenchendo / result.totalEmitidos : 0,
              )}
              sub={`${result.totalPreenchendo.toLocaleString("pt-BR")} relatórios`}
              icon={Loader2}
            />
          </div>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 space-y-0">
              <div>
                <CardTitle>Aderência por unidade</CardTitle>
                <CardDescription>Nº RDO emitidos x aprovados, por obra/unidade.</CardDescription>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rdoUnitFilter">Unidade</Label>
                <Select
                  id="rdoUnitFilter"
                  value={unitFilter}
                  onChange={(event) => setUnitFilter(event.target.value)}
                  className="w-48"
                >
                  <option value="all">Todas as unidades</option>
                  {result.units.map((unit) => (
                    <option value={unit.name} key={unit.name}>
                      {unit.name}
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
                    <TableHead className="text-right">Emitidos</TableHead>
                    <TableHead className="text-right">Aprovados</TableHead>
                    <TableHead className="text-right">Aderência</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUnits.length ? (
                    filteredUnits.map((unit) => {
                      const ok = unit.aderencia >= threshold / 100;
                      return (
                        <TableRow key={unit.name}>
                          <TableCell className="font-medium">{unit.name}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {unit.emitidos.toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {unit.aprovados.toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            {formatPct(unit.aderencia)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={unit.excluded ? "outline" : ok ? "success" : "destructive"}
                            >
                              {unit.excluded
                                ? "Ignorada"
                                : ok
                                  ? "Dentro da meta"
                                  : "Abaixo da meta"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Nenhuma unidade encontrada para o filtro selecionado.
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredUnits.length ? (
                    <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                      <TableCell>
                        {unitFilter === "all" ? "Média das unidades" : "Unidade selecionada"}
                      </TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell className="text-right tabular-nums">
                        {formatPct(filteredUnitAverage)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 space-y-0">
              <div>
                <CardTitle>Aderência por mês</CardTitle>
                <CardDescription>Consolidado mensal de todas as unidades.</CardDescription>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rdoMonthFilter">Mês</Label>
                  <Select
                    id="rdoMonthFilter"
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
                  <Label htmlFor="rdoYearFilter">Ano</Label>
                  <Select
                    id="rdoYearFilter"
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
                    <TableHead className="text-right">Emitidos</TableHead>
                    <TableHead className="text-right">Aprovados</TableHead>
                    <TableHead className="text-right">Aderência</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMonths.length ? (
                    filteredMonths.map((month) => {
                      const ok = month.aderencia >= threshold / 100;
                      return (
                        <TableRow key={`${month.year}-${month.month}`}>
                          <TableCell className="font-medium">{month.label}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {month.emitidos.toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {month.aprovados.toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            {formatPct(month.aderencia)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={ok ? "success" : "destructive"}>
                              {ok ? "Dentro da meta" : "Abaixo da meta"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
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
        </div>
      ) : (
        <Card className="flex flex-col items-center gap-3 border-dashed px-8 py-14 text-center">
          <Badge variant="secondary" className="uppercase tracking-wide">
            Aguardando dados
          </Badge>
          <CardTitle className="text-base">RDO</CardTitle>
          <CardDescription className="max-w-sm">
            Importe um ou mais arquivos para calcular a aprovação por unidade e por mês.
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
        description="Unidades marcadas continuam visíveis na tabela por unidade, mas ficam de fora dos totais, da aderência média e do painel publicado."
      />
    </div>
  );
}

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
