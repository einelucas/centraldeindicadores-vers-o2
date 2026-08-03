import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  /** Renderiza a célula. Recebe a linha inteira. */
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}

interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T, index: number) => string;
  empty?: ReactNode;
}

/**
 * Tabela genérica com o visual padrão do sistema. Mantém as telas de gestão
 * consistentes sem repetir marcação de tabela em cada página.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
}: DataTableProps<T>) {
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-neutralbrand/30 bg-white p-8 text-center text-sm text-neutralbrand">
        {empty ?? "Nenhum registro encontrado."}
      </div>
    );
  }

  const alignClass = (a?: "left" | "right" | "center") =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  return (
    <div className="overflow-x-auto rounded-lg border border-neutralbrand/30 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-canvas text-left">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-3 py-2 font-semibold ${alignClass(c.align)}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              className="border-t border-neutralbrand/20"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-2 ${alignClass(c.align)} ${c.className ?? ""}`}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
