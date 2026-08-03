"use client";

import { useCallback, useEffect, useState } from "react";

interface Setting {
  key: string;
  value: unknown;
}

/** Rótulos amigáveis para as chaves conhecidas. */
const LABELS: Record<string, string> = {
  "rdo.target": "RDO — meta de aprovação (fração)",
  "idp.target": "IDP/Cronograma — meta (fração)",
  "idp.excludedDisciplines": "IDP — disciplinas excluídas",
  "fiveS.target": "5S — meta (fração)",
  "rnc.maxPrazoDias": "RNC — prazo máximo (dias)",
  "taxa-acidentes.target": "Taxa de Acidentes — meta",
  "fiveS.excludedUnits": "5S — unidades excluídas",
};

export function SettingsManager() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/configuracoes");
      if (!res.ok) {
        setError("Falha ao carregar as configurações.");
        return;
      }
      const data = (await res.json()) as { items: Setting[] };
      setSettings(data.items);
      const d: Record<string, string> = {};
      for (const s of data.items) {
        d[s.key] =
          typeof s.value === "string"
            ? s.value
            : JSON.stringify(s.value, null, 0);
      }
      setDrafts(d);
    } catch {
      setError("Falha ao carregar as configurações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(key: string) {
    setSavingKey(key);
    setMsg(null);
    try {
      let value: unknown;
      const raw = drafts[key] ?? "";
      // Tenta interpretar como JSON (número, array, objeto); senão, texto.
      try {
        value = JSON.parse(raw);
      } catch {
        value = raw;
      }
      const res = await fetch("/api/configuracoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (res.ok) {
        setMsg(`"${key}" salvo.`);
      } else if (res.status === 403) {
        setCanEdit(false);
        setMsg("Apenas administradores podem alterar configurações.");
      } else {
        setMsg(`Falha ao salvar "${key}".`);
      }
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) return <p className="text-sm text-neutralbrand">Carregando…</p>;
  if (error) return <p className="text-sm text-danger">{error}</p>;

  return (
    <div className="space-y-4">
      {msg ? <p className="text-sm text-neutralbrand">{msg}</p> : null}
      <div className="space-y-3">
        {settings.map((s) => (
          <div
            key={s.key}
            className="rounded-lg border border-neutralbrand/30 bg-white p-4"
          >
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <label
                className="text-sm font-semibold text-brand-dark"
                htmlFor={`set-${s.key}`}
              >
                {LABELS[s.key] ?? s.key}
              </label>
              <code className="text-xs text-neutralbrand">{s.key}</code>
            </div>
            <div className="flex gap-2">
              <input
                id={`set-${s.key}`}
                value={drafts[s.key] ?? ""}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [s.key]: e.target.value }))
                }
                disabled={!canEdit}
                className="flex-1 rounded border border-neutralbrand/50 px-2 py-1 font-mono text-sm"
              />
              <button
                onClick={() => save(s.key)}
                disabled={savingKey === s.key || !canEdit}
                className="rounded bg-brand px-3 py-1 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-neutralbrand">
        Valores são interpretados como JSON quando possível (ex.: <code>0.80</code>,{" "}
        <code>[&quot;SP&quot;,&quot;CSC&quot;]</code>); caso contrário, como texto.
        Metas em fração (0.80 = 80%).
      </p>
    </div>
  );
}
