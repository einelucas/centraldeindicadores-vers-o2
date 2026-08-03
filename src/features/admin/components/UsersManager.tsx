"use client";

import { useCallback, useEffect, useState } from "react";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { StatusBadge } from "@/components/indicators/StatusBadge";
import { fmtDateTimeBR } from "@/lib/dates";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: "VIEWER" | "ANALYST" | "ADMIN";
  active: boolean;
  authProvider: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLES = ["VIEWER", "ANALYST", "ADMIN"] as const;

export function UsersManager() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Formulário de criação.
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "VIEWER" as (typeof ROLES)[number],
  });
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/usuarios");
      if (!res.ok) {
        setError("Sem permissão para ver usuários ou falha ao carregar.");
        return;
      }
      const data = (await res.json()) as { items: UserRow[] };
      setUsers(data.items);
    } catch {
      setError("Falha ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function updateUser(id: string, patch: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/usuarios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const { user } = (await res.json()) as { user: UserRow };
        setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...user } : u)));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function createUser() {
    setCreating(true);
    setCreateMsg(null);
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setCreateMsg("Usuário criado.");
        setForm({ name: "", email: "", password: "", role: "VIEWER" });
        await load();
      } else {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setCreateMsg(data?.error ?? "Falha ao criar usuário.");
      }
    } finally {
      setCreating(false);
    }
  }

  const columns: Array<Column<UserRow>> = [
    { key: "name", header: "Nome", cell: (u) => u.name || "—" },
    { key: "email", header: "E-mail", cell: (u) => u.email },
    {
      key: "role",
      header: "Perfil",
      cell: (u) => (
        <select
          value={u.role}
          disabled={busyId === u.id}
          onChange={(e) => updateUser(u.id, { role: e.target.value })}
          className="rounded border border-neutralbrand/50 px-2 py-1 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "active",
      header: "Status",
      cell: (u) => (
        <button
          disabled={busyId === u.id}
          onClick={() => updateUser(u.id, { active: !u.active })}
          title="Clique para alternar"
        >
          <StatusBadge ok={u.active}>{u.active ? "Ativo" : "Inativo"}</StatusBadge>
        </button>
      ),
    },
    {
      key: "lastLoginAt",
      header: "Último acesso",
      cell: (u) => fmtDateTimeBR(u.lastLoginAt),
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-neutralbrand/30 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-brand-dark">
          Novo usuário
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            placeholder="Nome"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="rounded border border-neutralbrand/50 px-2 py-1 text-sm"
          />
          <input
            placeholder="E-mail"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="rounded border border-neutralbrand/50 px-2 py-1 text-sm"
          />
          <input
            placeholder="Senha (mín. 8)"
            type="password"
            value={form.password}
            onChange={(e) =>
              setForm((f) => ({ ...f, password: e.target.value }))
            }
            className="rounded border border-neutralbrand/50 px-2 py-1 text-sm"
          />
          <select
            value={form.role}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                role: e.target.value as (typeof ROLES)[number],
              }))
            }
            className="rounded border border-neutralbrand/50 px-2 py-1 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={createUser}
            disabled={
              creating ||
              !form.name ||
              !form.email ||
              form.password.length < 8
            }
            className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            Criar usuário
          </button>
          {createMsg ? (
            <span className="text-sm text-neutralbrand">{createMsg}</span>
          ) : null}
        </div>
      </section>

      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : loading ? (
        <p className="text-sm text-neutralbrand">Carregando…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={users}
          rowKey={(u) => u.id}
          empty="Nenhum usuário cadastrado."
        />
      )}
    </div>
  );
}
