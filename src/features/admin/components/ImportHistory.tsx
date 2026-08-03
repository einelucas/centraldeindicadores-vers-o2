"use client";

import { useCallback, useEffect, useState } from "react";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { StatusBadge } from "@/components/indicators/StatusBadge";
import { fmtDateTimeBR } from "@/lib/dates";

interface ImportJob {
  id: string;
  module: string;
  fileName: string;
  status: string;
  totalFound: number;
  totalInserted: number;
  totalIgnored: number;
  totalUpdated: number;
  totalRejected: number;
  startedAt: string;
  completedAt: string | null;
}

export function ImportHistory() {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/importacoes?page=${page}&pageSize=20`);
      if (!res.ok) {
        setError("Sem permissão para ver importações ou falha ao carregar.");
        return;
      }
      const data = (await res.json()) as {
        items: ImportJob[];
        total: number;
        pageSize: number;
      };
      setJobs(data.items);
      setTotal(data.total);
      setPageSize(data.pageSize);
    } catch {
      setError("Falha ao carregar as importações.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const statusOk = (s: string) =>
    s === "COMPLETED" || s === "COMPLETO" || s === "SUCCESS";

  const columns: Array<Column<ImportJob>> = [
    { key: "startedAt", header: "Início", cell: (j) => fmtDateTimeBR(j.startedAt) },
    { key: "module", header: "Módulo", cell: (j) => j.module },
    {
      key: "status",
      header: "Status",
      cell: (j) => <StatusBadge ok={statusOk(j.status)}>{j.status}</StatusBadge>,
    },
    { key: "found", header: "Encontrados", align: "right", cell: (j) => j.totalFound },
    { key: "ins", header: "Inseridos", align: "right", cell: (j) => j.totalInserted },
    { key: "upd", header: "Atualizados", align: "right", cell: (j) => j.totalUpdated },
    { key: "ign", header: "Ignorados", align: "right", cell: (j) => j.totalIgnored },
    {
      key: "rej",
      header: "Rejeitados",
      align: "right",
      cell: (j) =>
        j.totalRejected > 0 ? (
          <span className="font-semibold text-danger">{j.totalRejected}</span>
        ) : (
          "0"
        ),
    },
  ];

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : loading ? (
        <p className="text-sm text-neutralbrand">Carregando…</p>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={jobs}
            rowKey={(j) => j.id}
            empty="Nenhuma importação registrada ainda."
          />
          {totalPages > 1 ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutralbrand">
                Página {page} de {totalPages} · {total} importações
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-neutralbrand/50 px-3 py-1 disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-neutralbrand/50 px-3 py-1 disabled:opacity-40"
                >
                  Próxima
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
