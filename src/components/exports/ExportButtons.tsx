"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isDisabled}
        onClick={() => exportToExcel(fileName, columns, rows)}
      >
        <FileSpreadsheet className="size-3.5" />
        Exportar Excel
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isDisabled}
        onClick={() => exportToPdf(fileName, columns, rows, { title, subtitle, orientation })}
      >
        <FileText className="size-3.5" />
        Exportar PDF
      </Button>
    </div>
  );
}
