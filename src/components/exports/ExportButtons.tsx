"use client";

import { exportToExcel, type ExportColumn } from "@/lib/exports/excel";
import { exportToPdf } from "@/lib/exports/pdf";

interface ExportButtonsProps<T> {
  fileName: string;
  title: string;
  subtitle?: string;
  columns: Array<ExportColumn<T>>;
  rows: readonly T[];
  orientation?: "portrait" | "landscape";
  disabled?: boolean;
}

/**
 * Par de botões "Excel" e "PDF" para exportar um conjunto de linhas.
 * Reaproveitado pelos módulos que têm uma tabela de resultados.
 */
export function ExportButtons<T>({
  fileName,
  title,
  subtitle,
  columns,
  rows,
  orientation,
  disabled,
}: ExportButtonsProps<T>) {
  const isDisabled = disabled || rows.length === 0;

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => exportToExcel(fileName, columns, rows)}
        className="rounded border border-brand px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand/5 disabled:opacity-40"
      >
        Exportar Excel
      </button>
      <button
        type="button"
        disabled={isDisabled}
        onClick={() =>
          exportToPdf(fileName, columns, rows, { title, subtitle, orientation })
        }
        className="rounded border border-brand px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand/5 disabled:opacity-40"
      >
        Exportar PDF
      </button>
    </div>
  );
}
