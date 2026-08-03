"use client";

import { useCallback, useEffect, useState } from "react";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { fmtDateTimeBR } from "@/lib/dates";

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: string;
  user: { name: string | null; email: string } | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function AuditViewer() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (entity.trim()) params.set("entity", entity.trim());
      if (action.trim()) params.set("action", action.trim());
      const res = await fetch(`/api/auditoria?${params.toString()}`);
      if (!res.ok) {
        setError("Sem permissão para ver a auditoria ou falha ao carregar.");
        return;
      }
      const data = (await res.json()) as {
        items: AuditRow[];
        pagination: Pagination;
      };
      setRows(data.items);
      setPagination(data.pagination);
    } catch {
      setError("Falha ao carregar a auditoria.");
    } finally {
      setLoading(false);
    }
  }, [page, entity, action]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: Array<Column<AuditRow>> = [
    { key: "createdAt", header: "Quando", cell: (r) => fmtDateTimeBR(r.createdAt) },
    {
      key: "user",
      header: "Usuário",
      cell: (r) => r.user?.name || r.user?.email || "sistema",
    },
    { key: "action", header: "Ação", cell: (r) => r.action },
    { key: "entity", header: "Entidade", cell: (r) => r.entity },
    {
      key: "entityId",
      header: "Registro",
      cell: (r) => r.entityId ?? "—",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="auEntity">
            Entidade
          </label>
          <input
            id="auEntity"
            value={entity}
            placeholder="ex.: User, ImportJob"
            onChange={(e) => {
              setPage(1);
              setEntity(e.target.value);
            }}
            className="rounded border border-neutralbrand/50 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="auAction">
            Ação
          </label>
          <input
            id="auAction"
            value={action}
            placeholder="ex.: scorecard.save"
            onChange={(e) => {
              setPage(1);
              setAction(e.target.value);
            }}
            className="rounded border border-neutralbrand/50 px-2 py-1 text-sm"
          />
        </div>
      </div>

      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : loading ? (
        <p className="text-sm text-neutralbrand">Carregando…</p>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            empty="Nenhum evento de auditoria encontrado."
          />
          {pagination && pagination.totalPages > 1 ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutralbrand">
                Página {pagination.page} de {pagination.totalPages} ·{" "}
                {pagination.total} eventos
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
                  disabled={page >= pagination.totalPages}
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
