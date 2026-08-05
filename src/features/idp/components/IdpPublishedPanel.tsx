"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
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
import { MONTH_NAMES_FULL } from "@/lib/dates";

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

function disciplineValue(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function periodLabel(payload: IdpPublishedPayload): string {
  const start = MONTH_NAMES_FULL[(payload.monthStart ?? 1) - 1] ?? "Janeiro";
  const end = MONTH_NAMES_FULL[(payload.monthEnd ?? 12) - 1] ?? "Dezembro";
  return `${start} a ${end}/${payload.selectedYear}`;
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
  const eletrica = d.eletrica ?? d.eia ?? null;
  const chartData = (d.disciplinas ?? []).map((item) => ({
    name: item.n.replace(/^\d+\s*-\s*/, ""),
    aderencia: item.v,
  }));

  return (
    <div className="painel-frontend">
      <div className="content" style={{ padding: "14px 0 0" }}>
        <div className="ph">Aderência do Cronograma — Avanço Físico (RSO)</div>
        <div className="ps rdo-panel-summary">
          <span className="rdo-panel-target">META: &gt;{d.meta}%</span>
          <span>
            Resultado: <strong style={{ color: resultOk ? GREEN : RED, fontSize: 14 }}>{result}%</strong>
          </span>
          <span style={{ color: "#bbb" }}>
            — período {periodLabel(d)} · {d.documentosAtivos ?? d.unidades.length} RSO(s) ativo(s) · publicado em {formatPublishedAt(data.publishedAt)} por {data.publishedBy.name} · versão {data.version}
          </span>
        </div>

        <div className="mgrid">
          <PanelMetric label="Execução geral" value={`${result}%`} meta={`Meta >${d.meta}%`} tone={resultOk ? "G" : "R"} ok={resultOk} />
          <PanelMetric label="Civil" value={disciplineValue(d.civil)} meta="Por disciplina" tone={(d.civil ?? 0) >= d.meta ? "G" : "A"} ok={d.civil !== null && d.civil >= d.meta} />
          <PanelMetric label="Mecânica" value={disciplineValue(d.mecanica)} meta="Por disciplina" tone={(d.mecanica ?? 0) >= d.meta ? "G" : "A"} ok={d.mecanica !== null && d.mecanica >= d.meta} />
          <PanelMetric label="Elétrica" value={disciplineValue(eletrica)} meta="Por disciplina" tone={(eletrica ?? 0) >= d.meta ? "G" : "A"} ok={eletrica !== null && eletrica >= d.meta} />
        </div>

        <div className="idp-published-analysis-grid">
          <div className="card idp-published-discipline-card">
            <div className="ct">Aderência por disciplina (%)</div>
            <div className="cw idp-published-discipline-chart">
              {chartData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 12, bottom: 42, left: -12 }}>
                    <CartesianGrid stroke="#f1f3f6" vertical={false} />
                    <XAxis dataKey="name" interval={0} angle={-24} textAnchor="end" height={64} tick={{ fontFamily: "Montserrat", fontSize: 9 }} />
                    <YAxis tickFormatter={(value) => `${value}%`} tick={{ fontFamily: "Montserrat", fontSize: 9 }} />
                    <Tooltip formatter={(value) => [`${value}%`, "Aderência"]} />
                    <ReferenceLine y={d.meta} stroke={RED} strokeDasharray="5 4" />
                    <Bar dataKey="aderencia" name="Aderência (%)" fill={BLUE} radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="ps">Sem disciplinas publicadas.</p>}
            </div>
          </div>

          <div className="idp-published-side-stack">
            <div className="card idp-published-units-card">
              <div className="ct">Execução por unidade</div>
              <div className="idp-published-units-list">
                {d.unidades.length ? d.unidades.map((unit) => {
                  const ok = unit.v >= d.meta;
                  return (
                    <div className="urow" key={`${unit.n}-${unit.rsoNumero ?? "sem-rso"}`}>
                      <div className="uname">
                        {unit.n}
                        {unit.rsoNumero === undefined ? null : (
                          <small className="idp-panel-rso">
                            {unit.rsoNumero === null ? "RSO não identificado" : `RSO ${unit.rsoNumero}`}
                            {unit.referenceDate ? ` · ${new Date(`${unit.referenceDate}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}
                          </small>
                        )}
                      </div>
                      <div className="utrack">
                        <div className="ufill" style={{ width: `${Math.min(100, Math.max(0, unit.v))}%`, background: ok ? GREEN : RED }} />
                      </div>
                      <div className="uval" style={{ color: ok ? GREEN : RED }}>{Math.round(unit.v)}%</div>
                    </div>
                  );
                }) : <p className="ps">Sem unidades publicadas.</p>}
              </div>
            </div>

            <div className="card idp-published-monthly-card">
              <div className="ct">Aderência mensal (%)</div>
              <div className="cw idp-published-monthly-chart">
                {d.mensal?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={d.mensal} margin={{ top: 8, right: 12, bottom: 2, left: -16 }}>
                      <CartesianGrid stroke="#f4f4f4" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontFamily: "Montserrat", fontSize: 10 }} />
                      <YAxis tick={{ fontFamily: "Montserrat", fontSize: 10 }} tickFormatter={(value) => `${value}%`} />
                      <Tooltip formatter={(value) => [value === null ? "Sem dados" : `${value}%`, "Aderência"]} />
                      <Legend wrapperStyle={{ fontFamily: "Montserrat", fontSize: 10 }} />
                      <ReferenceLine y={d.meta} stroke={RED} strokeDasharray="5 4" label={{ value: `Meta (${d.meta}%)`, position: "insideTopRight", fontSize: 9 }} />
                      <Line connectNulls={false} type="monotone" dataKey="v" name="Aderência (%)" stroke={BLUE} strokeWidth={2} fill={`${BLUE}22`} dot={{ r: 5, fill: BLUE }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <p className="ps">Sem dados mensais publicados.</p>}
              </div>
            </div>
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
