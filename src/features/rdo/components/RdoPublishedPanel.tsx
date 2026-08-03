"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RdoPublishedPayload } from "@/features/rdo/publications";
import { PublishedPanelPlaceholder } from "@/components/layout/PublishedPanelPlaceholder";

interface PublicationResponse {
  publication: null | {
    id: string;
    version: number;
    target: number | null;
    result: number | null;
    status: string | null;
    payload: RdoPublishedPayload;
    publishedAt: string;
    publishedBy: { id: string; name: string; email: string };
  };
}

const BLUE = "#304F7E";
const GOLD = "#EAA239";
const GREEN = "#609346";
const RED = "#CC5121";

function formatPublishedAt(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function RdoPublishedPanel() {
  const [data, setData] = useState<PublicationResponse["publication"]>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/publicacoes/rdo", { cache: "no-store" });
      if (!response.ok) throw new Error("Falha ao carregar o painel publicado.");
      const body = (await response.json()) as PublicationResponse;
      setData(body.publication);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar o painel.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("rdo:published", refresh);
    return () => window.removeEventListener("rdo:published", refresh);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="painel-frontend">
        <div className="content" style={{ padding: "14px 0 0" }}>
          <div className="empty"><p className="ps">Carregando painel publicado…</p></div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return <PublishedPanelPlaceholder title="Não foi possível carregar o painel" description={error} />;
  }

  if (!data) return <PublishedPanelPlaceholder />;

  const d = data.payload;
  const result = Math.round(d.resultado);
  const resultOk = result >= d.meta;
  const reviewingCount = Math.round((d.emRevisaoPct / 100) * d.emitidos);
  const fillingCount = Math.round((d.preenchendoPct / 100) * d.emitidos);

  return (
    <div className="painel-frontend">
      <div className="content" style={{ padding: "14px 0 0" }}>
        <div className="ph">Aprovação de RDO</div>
        <div className="ps rdo-panel-summary">
          <span className="rdo-panel-target">META: &gt;{d.meta}%</span>
          <span>
            Resultado: <strong style={{ color: resultOk ? GREEN : RED, fontSize: 14 }}>{result}%</strong>
          </span>
          <span style={{ color: "#bbb" }}>
            — publicado em {formatPublishedAt(data.publishedAt)} por {data.publishedBy.name}
          </span>
        </div>

        <div className="mgrid">
          <PanelMetric label="Resultado" value={`${result}%`} meta={`Meta >${d.meta}%`} tone={resultOk ? "G" : "R"} ok={resultOk} />
          <PanelMetric label="Relatórios aprovados" value={d.aprovados.toLocaleString("pt-BR")} meta={`De ${d.emitidos.toLocaleString("pt-BR")} emitidos`} tone="G" />
          <PanelMetric label="Em revisão" value={`${d.emRevisaoPct.toFixed(1)}%`} meta={`${reviewingCount.toLocaleString("pt-BR")} relatórios`} tone="A" />
          <PanelMetric label="Preenchendo" value={`${d.preenchendoPct.toFixed(1)}%`} meta={`${fillingCount.toLocaleString("pt-BR")} relatórios`} tone="A" />
        </div>

        <div className="g2">
          <div className="card">
            <div className="ct">Aprovação mensal</div>
            <div className="cw" style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={d.mensal} margin={{ top: 8, right: 12, bottom: 2, left: -16 }}>
                  <CartesianGrid stroke="#f4f4f4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontFamily: "Montserrat", fontSize: 10 }} />
                  <YAxis tick={{ fontFamily: "Montserrat", fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(value) => [`${value}%`, "Aprovação"]} />
                  <Legend wrapperStyle={{ fontFamily: "Montserrat", fontSize: 10 }} />
                  <ReferenceLine y={d.meta} stroke={GOLD} strokeDasharray="5 4" label={{ value: `Meta (${d.meta}%)`, position: "insideTopRight", fontSize: 9 }} />
                  <Line type="monotone" dataKey="v" name="Aprovação (%)" stroke={BLUE} strokeWidth={2} dot={{ r: 5, fill: BLUE }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="ct">Aprovação por unidade</div>
            {d.unidades.length ? d.unidades.map((unit) => {
              const ok = unit.v >= d.meta;
              return (
                <div className="urow" key={unit.n}>
                  <div className="uname">{unit.n}</div>
                  <div className="utrack">
                    <div className="ufill" style={{ width: `${Math.min(100, Math.max(0, unit.v))}%`, background: ok ? GREEN : RED }} />
                  </div>
                  <div className="uval" style={{ color: ok ? GREEN : RED }}>{unit.v}%</div>
                </div>
              );
            }) : <p className="ps">Sem unidades publicadas.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelMetric({ label, value, meta, tone, ok }: {
  label: string;
  value: string;
  meta: string;
  tone: "G" | "A" | "R";
  ok?: boolean;
}) {
  const success = ok ?? tone === "G";
  return (
    <div className={`mc ${tone}`}>
      <div className="ml">{label}</div>
      <div className={`mv ${tone}`}>{value}</div>
      <div className="mm">{meta}</div>
      {ok !== undefined ? (
        <div className={`ms ${success ? "ok" : "no"}`}>{success ? "✓ Atingida" : "✗ Abaixo"}</div>
      ) : null}
    </div>
  );
}
