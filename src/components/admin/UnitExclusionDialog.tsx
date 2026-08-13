"use client";

import { useEffect, useState } from "react";
import { Ban, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface UnitExclusionOption {
  code: string;
  label: string;
}

export function UnitExclusionDialog({
  open,
  onOpenChange,
  units,
  excluded,
  onSave,
  busy = false,
  title = "Ignorar unidades",
  description = "Unidades marcadas continuam visíveis nas tabelas, mas ficam de fora dos cálculos consolidados e do painel publicado.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  units: UnitExclusionOption[];
  excluded: readonly string[];
  onSave: (next: string[]) => void | Promise<void>;
  busy?: boolean;
  title?: string;
  description?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(excluded));

  useEffect(() => {
    if (open) setSelected(new Set(excluded));
  }, [open, excluded]);

  function toggle(code: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col">
        <DialogHeader>
          <div>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </div>
          <DialogCloseButton onClick={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto p-4">
          {units.length ? (
            units.map((unit) => (
              <label
                key={unit.code}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Checkbox checked={selected.has(unit.code)} onChange={() => toggle(unit.code)} />
                {unit.label}
              </label>
            ))
          ) : (
            <p className="px-2.5 py-2 text-sm text-muted-foreground">
              Nenhuma unidade reconhecida ainda.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={busy} onClick={() => void onSave(Array.from(selected))}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
