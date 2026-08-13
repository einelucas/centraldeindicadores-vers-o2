"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  FileSearch,
  Loader2,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MONTH_NAMES_FULL } from "@/lib/dates";
import type {
  JustificationEvidenceItem,
  JustificationModule,
  JustificationSuggestion,
} from "@/features/justifications/types";

interface SavedAnalysis {
  id: string;
  module: JustificationModule;
  year: number;
  month: number;
  result: number | null;
  target: number | null;
  status: string | null;
  evidence: JustificationEvidenceItem[] | null;
  suggestedText: string | null;
  text: string;
  sourceImportId: string | null;
  sourceImportedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string };
  updatedBy: { name: string };
}

const CURRENT_DATE = new Date();
const CURRENT_YEAR = CURRENT_DATE.getFullYear();
const CURRENT_MONTH = CURRENT_DATE.getMonth() + 1;

export function IndicatorAnalysisDialog({
  module,
  moduleLabel,
  target,
  years,
  defaultYear,
  defaultMonth,
  triggerClassName,
  targetUnit = "percentage",
}: {
  module: JustificationModule;
  moduleLabel: string;
  target: number;
  years: number[];
  defaultYear?: number;
  defaultMonth?: number;
  triggerClassName?: string;
  targetUnit?: "percentage" | "absolute";
}) {
  const initialYear = defaultYear ?? years[0] ?? CURRENT_YEAR;
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(defaultMonth ?? CURRENT_MONTH);
  const [records, setRecords] = useState<SavedAnalysis[]>([]);
  const [suggestion, setSuggestion] = useState<JustificationSuggestion | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const yearOptions = useMemo(
    () =>
      Array.from(new Set([CURRENT_YEAR, ...(defaultYear ? [defaultYear] : []), ...years])).sort(
        (a, b) => b - a,
      ),
    [defaultYear, years],
  );
  const selectedRecord = records.find((record) => record.year === year && record.month === month);

  const loadRecords = useCallback(
    async (selectedYear: number) => {
      const params = new URLSearchParams({ module, year: String(selectedYear) });
      const response = await fetch(`/api/justificativas?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível carregar as análises salvas.");
      const body = (await response.json()) as { records: SavedAnalysis[] };
      setRecords(body.records);
    },
    [module],
  );

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    void loadRecords(year)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [loadRecords, open, year]);

  useEffect(() => {
    setSuggestion(null);
    setText(selectedRecord?.text ?? "");
    setError(null);
    setMessage(null);
  }, [month, selectedRecord, year]);

  async function generate() {
    if (text.trim() && text !== selectedRecord?.text) {
      const replace = window.confirm("Substituir o texto ainda não salvo pela análise gerada?");
      if (!replace) return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const params = new URLSearchParams({
        module,
        year: String(year),
        month: String(month),
        target: String(target),
      });
      const response = await fetch(`/api/justificativas/sugestao?${params}`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as {
        suggestion?: JustificationSuggestion;
        error?: string;
      };
      if (!response.ok || !body.suggestion) {
        throw new Error(body.error ?? "Não foi possível gerar a análise.");
      }
      setSuggestion(body.suggestion);
      setText(body.suggestion.suggestedText);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível gerar a análise.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!text.trim()) {
      setError("Escreva ou gere uma análise antes de salvar.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const basis = suggestion ?? selectedRecord;
      const response = await fetch("/api/justificativas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module,
          year,
          month,
          text,
          suggestedText: suggestion?.suggestedText ?? selectedRecord?.suggestedText ?? null,
          result: basis?.result ?? null,
          target: basis?.target ?? (targetUnit === "percentage" ? target / 100 : target),
          status: basis?.status ?? null,
          evidence: basis?.evidence ?? [],
          sourceImport:
            suggestion?.sourceImport ??
            (selectedRecord?.sourceImportId
              ? {
                  id: selectedRecord.sourceImportId,
                  importedAt: selectedRecord.sourceImportedAt,
                }
              : null),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar a análise.");
      await loadRecords(year);
      setSuggestion(null);
      setMessage("Análise salva com sucesso.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a análise.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(record: SavedAnalysis) {
    if (
      !window.confirm(`Apagar a análise de ${MONTH_NAMES_FULL[record.month - 1]}/${record.year}?`)
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        module,
        year: String(record.year),
        month: String(record.month),
      });
      const response = await fetch(`/api/justificativas?${params}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Não foi possível apagar a análise.");
      await loadRecords(year);
      setSuggestion(null);
      setText("");
      setMessage("Análise apagada.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível apagar a análise.");
    } finally {
      setSaving(false);
    }
  }

  const evidence = suggestion?.evidence ?? selectedRecord?.evidence ?? [];
  const status = suggestion?.status ?? selectedRecord?.status;

  function openDialog() {
    setYear(defaultYear ?? years[0] ?? CURRENT_YEAR);
    setMonth(defaultMonth ?? CURRENT_MONTH);
    setOpen(true);
  }

  return (
    <>
      <Button variant="outline" size="sm" className={triggerClassName} onClick={openDialog}>
        <FileSearch className="size-3.5" />
        Análise do resultado
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <div>
              <DialogTitle>Análise do resultado — {moduleLabel}</DialogTitle>
              <DialogDescription>
                Diagnóstico interno baseado nos dados do período. Revise e complemente o contexto
                operacional antes de salvar.
              </DialogDescription>
            </div>
            <DialogCloseButton onClick={() => setOpen(false)} />
          </DialogHeader>

          <div className="max-h-[calc(85vh-9rem)] space-y-5 overflow-y-auto p-5">
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex min-w-32 flex-col gap-1.5">
                <Label htmlFor={`${module}-analysis-year`}>Ano</Label>
                <Select
                  id={`${module}-analysis-year`}
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                >
                  {yearOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </Select>
              </div>
              <div className="flex min-w-44 flex-col gap-1.5">
                <Label htmlFor={`${module}-analysis-month`}>Mês</Label>
                <Select
                  id={`${module}-analysis-month`}
                  value={month}
                  onChange={(event) => setMonth(Number(event.target.value))}
                >
                  {MONTH_NAMES_FULL.map((name, index) => (
                    <option key={name} value={index + 1}>
                      {name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button disabled={loading || saving} onClick={() => void generate()}>
                {loading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                Gerar análise com base nos dados
              </Button>
              {status ? (
                <Badge variant={status === "BELOW_TARGET" ? "destructive" : "secondary"}>
                  {status === "BELOW_TARGET"
                    ? "Fora da meta"
                    : status === "ON_TARGET"
                      ? "Meta atingida"
                      : "Sem dados"}
                </Badge>
              ) : null}
            </div>

            {error ? (
              <div className="flex gap-2 rounded-lg border border-danger/25 bg-danger/5 p-3 text-sm text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="flex gap-2 rounded-lg border border-success/25 bg-success/5 p-3 text-sm text-success">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                {message}
              </div>
            ) : null}

            {evidence.length ? (
              <section>
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
                  <BarChart3 className="size-4 text-primary" /> Evidências encontradas
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {evidence.map((item) => (
                    <div key={item.label} className="rounded-lg border border-border p-3">
                      <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                      <p className="mt-1 text-sm font-bold text-foreground">{item.value}</p>
                      {item.detail ? (
                        <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor={`${module}-analysis-text`}>Análise e justificativa</Label>
              <Textarea
                id={`${module}-analysis-text`}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Gere uma análise ou registre o contexto operacional do resultado."
                className="min-h-52 resize-y"
              />
              <p className="text-xs text-muted-foreground">
                Os números são calculados pelo sistema; causas operacionais devem ser confirmadas
                pelo responsável.
              </p>
            </div>

            {records.length ? (
              <section className="space-y-2">
                <h4 className="text-sm font-bold text-foreground">Análises salvas em {year}</h4>
                {records.map((record) => (
                  <div
                    key={record.id}
                    onClick={() => setMonth(record.month)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/30"
                  >
                    <span>
                      <strong className="block text-sm text-foreground">
                        {MONTH_NAMES_FULL[record.month - 1]}/{record.year}
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        Atualizada por {record.updatedBy.name} em{" "}
                        {new Date(record.updatedAt).toLocaleString("pt-BR")}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="Apagar análise"
                      disabled={saving}
                      onClick={(event) => {
                        event.stopPropagation();
                        void remove(record);
                      }}
                    >
                      <Trash2 className="size-3.5 text-danger" />
                    </Button>
                  </div>
                ))}
              </section>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Fechar
            </Button>
            <Button disabled={saving || loading || !text.trim()} onClick={() => void save()}>
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              Salvar análise
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
