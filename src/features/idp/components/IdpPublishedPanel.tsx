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
import { PublishedPanelPlaceholder } from "@/components/layout/PublishedPanelPlaceholder";
import type { IdpPublishedPayload } from "@/features/idp/publications";

interface PublicationResponse {
  publication: null | {
    id: string;
    version: number;
    target: number | null;
    result: number | null;
    status: string | null;
    payload: IdpPublishedPayload;
    publishedAt: string;
    publishedBy: { id: string; name: string; email: string };
  };
}

const BLUE = "#304F7E";
const GREEN = "#609346";
const RED = "#CC5121";

function formatPublishedAt(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function IdpPublishedPanel() {
  const [data, setData] = useState<PublicationResponse["publication"]>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/publicacoes/idp", { cache: "no-store" });
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
    window.addEventListener("idp:published", refresh);
    return () => window.removeEventListener("idp:published", refresh);
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

  return (
    <div className="painel-frontend">
      <div className="content" style={{ padding: "14px 0 0" }}>
        <div className="ph">Aderência do Cronograma</div>
        <div className="ps rdo-panel-summary">
          <span className="rdo-panel-target">META: &gt;{d.meta}%</span>
          <span>
            Resultado: <strong style={{ color: resultOk ? GREEN : RED, fontSize: 14 }}>{result}%</strong>
          </span>
          <span style={{ color: "#bbb" }}>
            — publicado em {formatPublishedAt(data.publishedAt)} por {data.publishedBy.name} · versão {data.version}
          </span>
        </div>

        <div className="mgrid">
          <PanelMetric label="Semestral" value={`${result}%`} meta={`Meta >${d.meta}%`} tone={resultOk ? "G" : "R"} ok={resultOk} />
          <PanelMetric label="Civil" value={`${Math.round(d.civil)}%`} meta="Por disciplina" tone={d.civil >= d.meta ? "G" : "A"} ok={d.civil >= d.meta} />
          <PanelMetric label="Mecânica" value={`${Math.round(d.mecanica)}%`} meta="Por disciplina" tone={d.mecanica >= d.meta ? "G" : "A"} ok={d.mecanica >= d.meta} />
          <PanelMetric label="EIA" value={`${Math.round(d.eia)}%`} meta="Elétrica + Instrumentação + Automação" tone={d.eia >= d.meta ? "G" : "A"} ok={d.eia >= d.meta} />
        </div>

        <div className="g2">
          <div className="card">
            <div className="ct">Aderência mensal (%)</div>
            <div className="cw" style={{ height: 220 }}>
              {d.mensal.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={d.mensal} margin={{ top: 8, right: 12, bottom: 2, left: -16 }}>
                    <CartesianGrid stroke="#f4f4f4" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontFamily: "Montserrat", fontSize: 10 }} />
                    <YAxis tick={{ fontFamily: "Montserrat", fontSize: 10 }} tickFormatter={(value) => `${value}%`} />
                    <Tooltip formatter={(value) => [`${value}%`, "Aderência"]} />
                    <Legend wrapperStyle={{ fontFamily: "Montserrat", fontSize: 10 }} />
                    <ReferenceLine y={d.meta} stroke={RED} strokeDasharray="5 4" label={{ value: `Meta (${d.meta}%)`, position: "insideTopRight", fontSize: 9 }} />
                    <Line type="monotone" dataKey="v" name="Aderência (%)" stroke={BLUE} strokeWidth={2} fill={`${BLUE}22`} dot={{ r: 5, fill: BLUE }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <p className="ps">Sem dados mensais publicados.</p>}
            </div>
          </div>

          <div className="card">
            <div className="ct">Aderência por unidade</div>
            {d.unidades.length ? d.unidades.map((unit) => {
              const ok = unit.v >= d.meta;
              return (
                <div className="urow" key={unit.n}>
                  <div className="uname">{unit.n}</div>
                  <div className="utrack">
                    <div
                      className="ufill"
                      style={{
                        width: `${Math.min(100, Math.max(0, unit.v))}%`,
                        background: ok ? GREEN : RED,
                      }}
                    />
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
  ok: boolean;
}) {
  return (
    <div className={`mc ${tone}`}>
      <div className="ml">{label}</div>
      <div className={`mv ${tone}`}>{value}</div>
      <div className="mm">{meta}</div>
      <div className={`ms ${ok ? "ok" : "no"}`}>{ok ? "✓ Atingida" : "✗ Abaixo"}</div>
    </div>
  );
}
