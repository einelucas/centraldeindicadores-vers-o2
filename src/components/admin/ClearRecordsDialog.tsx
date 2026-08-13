"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

import { PeriodRangeFilter } from "@/components/admin/PeriodRangeFilter";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PeriodRange } from "@/lib/period";

const CONFIRM_PHRASE = "deletar dados";

/**
 * Dialog de exclusão destrutiva compartilhado pelos módulos administrativos.
 * Sempre exige a escolha explícita do período (ou "Tudo") e a digitação da
 * frase de confirmação antes de liberar o botão de exclusão — essa ação
 * manipula o banco de dados diretamente e não pode ser desfeita.
 *
 * A contagem de registros afetados é buscada do servidor via
 * `fetchAffectedCount`, nunca derivada dos dados já carregados na tela — a
 * tabela principal pode estar com um filtro de período diferente do período
 * escolhido aqui, e mostrar uma contagem desatualizada seria pior do que não
 * mostrar nenhuma.
 */
export function ClearRecordsDialog({
  open,
  onOpenChange,
  title,
  description,
  periodRange,
  onPeriodRangeChange,
  yearsInData,
  fetchAffectedCount,
  affectedLabel,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  periodRange: PeriodRange | null;
  onPeriodRangeChange: (next: PeriodRange | null) => void;
  yearsInData: readonly number[];
  fetchAffectedCount: (period: PeriodRange | null) => Promise<number>;
  affectedLabel: string;
  busy: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (open) setConfirmText("");
  }, [open]);

  useEffect(() => {
    setConfirmText("");
  }, [periodRange]);

  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    setCount(null);
    setCountError(null);
    setCountLoading(true);
    fetchAffectedCount(periodRange)
      .then((next) => {
        if (requestId.current !== id) return;
        setCount(next);
      })
      .catch((err: Error) => {
        if (requestId.current !== id) return;
        setCountError(err.message || "Falha ao calcular os registros afetados.");
      })
      .finally(() => {
        if (requestId.current !== id) return;
        setCountLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, periodRange]);

  const canConfirm =
    !busy && !countLoading && count !== null && count > 0 && confirmText.trim() === CONFIRM_PHRASE;

  function close() {
    if (busy) return;
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </div>
          </div>
          <DialogCloseButton onClick={close} />
        </DialogHeader>

        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1.5">
            <Label>Período a excluir</Label>
            <PeriodRangeFilter
              value={periodRange}
              onChange={onPeriodRangeChange}
              yearsInData={yearsInData}
              label=""
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-sm font-semibold text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {countLoading ? (
              <span className="flex items-center gap-1.5 font-medium">
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
                Calculando registros afetados…
              </span>
            ) : countError ? (
              <span>{countError}</span>
            ) : count && count > 0 ? (
              <span>
                {count.toLocaleString("pt-BR")} {affectedLabel} serão apagados permanentemente do
                banco de dados{periodRange ? " no período selecionado." : " (toda a base)."} Essa
                ação não pode ser desfeita.
              </span>
            ) : (
              <span>Nenhum registro encontrado para o período selecionado.</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clearConfirmText">
              Para confirmar, digite <span className="text-danger">{CONFIRM_PHRASE}</span> abaixo
            </Label>
            <Input
              id="clearConfirmText"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={CONFIRM_PHRASE}
              autoComplete="off"
              disabled={busy}
              className="border-danger/40 focus-visible:ring-danger/40"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={close}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!canConfirm}
            onClick={() => void onConfirm()}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            Excluir permanentemente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
