"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileDown } from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RdoPublishedPayload } from "@/features/rdo/publications";
import { PublishedPanelPlaceholder } from "@/components/layout/PublishedPanelPlaceholder";
import { ToolbarSlotContent } from "@/components/layout/ToolbarSlot";
import { usePanelPdfExport } from "@/lib/exports/panel-screenshot-pdf";
import { formatPeriodRangeLabel } from "@/lib/period";

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
/** Tinta de gráfico (não a marca) — a navy da marca falha o piso de croma como preenchimento categórico. */
const CHART_BLUE = "#2E6DB4";

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
  const panelRef = useRef<HTMLDivElement>(null);
  const { exporting, error: exportError, exportPdf } = usePanelPdfExport(panelRef);

  const handleExportPdf = useCallback(
    () => exportPdf(`RDO_painel_${new Date().toISOString().slice(0, 10)}.pdf`),
    [exportPdf],
  );

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

  const exportButton = (
    <ToolbarSlotContent>
      <button
        type="button"
        disabled={exporting}
        onClick={() => void handleExportPdf()}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground disabled:cursor-wait disabled:opacity-60"
      >
        <FileDown className="size-3.5" />
        {exporting ? "Gerando PDF…" : "Exportar PDF"}
      </button>
    </ToolbarSlotContent>
  );

  if (loading && !data) {
    return (
      <div className="painel-frontend">
        {exportButton}
        <div className="content" style={{ padding: "14px 0 0" }}>
          <div className="empty">
            <p className="ps">Carregando painel publicado…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <PublishedPanelPlaceholder title="Não foi possível carregar o painel" description={error} />
    );
  }

  if (!data) return <PublishedPanelPlaceholder />;

  const d = data.payload;
  const result = Math.round(d.resultado);
  const resultOk = result >= d.meta;
  const reviewingCount = Math.round((d.emRevisaoPct / 100) * d.emitidos);
  const fillingCount = Math.round((d.preenchendoPct / 100) * d.emitidos);
  const statusChartData = [
    { name: "Aprovado", value: result, color: GREEN },
    { name: "Em revisão", value: Math.round(d.emRevisaoPct), color: GOLD },
    { name: "Preenchendo", value: Math.round(d.preenchendoPct), color: CHART_BLUE },
  ];

  return (
    <div className="painel-frontend" ref={panelRef}>
      {exportButton}
      {exportError ? (
        <div className="content" style={{ padding: "8px 0 0" }}>
          <p className="ps" style={{ color: RED }}>
            {exportError}
          </p>
        </div>
      ) : null}

      <div className="content" style={{ padding: "14px 0 0" }}>
        <div className="mgrid">
          <PanelMetric
            label="Resultado"
            value={`${result}%`}
            meta={`Meta >${d.meta}%`}
            tone={resultOk ? "G" : "R"}
            ok={resultOk}
          />
          <PanelMetric
            label="Relatórios aprovados"
            value={d.aprovados.toLocaleString("pt-BR")}
            meta={`De ${d.emitidos.toLocaleString("pt-BR")} emitidos`}
            tone="G"
          />
          <PanelMetric
            label="Em revisão"
            value={`${d.emRevisaoPct.toFixed(1)}%`}
            meta={`${reviewingCount.toLocaleString("pt-BR")} relatórios`}
            tone="A"
          />
          <PanelMetric
            label="Preenchendo"
            value={`${d.preenchendoPct.toFixed(1)}%`}
            meta={`${fillingCount.toLocaleString("pt-BR")} relatórios`}
            tone="A"
          />
        </div>

        {/* Container do indicador: agrupa os gráficos e a leitura por unidade
            que pertencem a este mesmo indicador, em vez de espalhá-los como
            cards soltos — mesma hierarquia do RDO no hub de referência. */}
        <div className="card indicator-card">
          <div className="ph">Aprovação de RDO</div>
          <div className="ps rdo-panel-summary">
            <span className="rdo-panel-target">META: &gt;{d.meta}%</span>
            <span>
              Resultado:{" "}
              <strong style={{ color: resultOk ? GREEN : RED, fontSize: 14 }}>{result}%</strong>
            </span>
            <span style={{ color: "#bbb" }}>
              — publicado em {formatPublishedAt(data.publishedAt)} por {data.publishedBy.name}
              {d.periodo ? ` · Período: ${formatPeriodRangeLabel(d.periodo)}` : ""}
            </span>
          </div>

          <div className="g2 indicator-subgrid">
            <div className="indicator-subcard">
              <div className="ct">Distribuição de status</div>
              <div className="cw" style={{ height: 130 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 2, right: 4, bottom: 2, left: 4 }}>
                    <Pie
                      data={statusChartData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="46%"
                      outerRadius="70%"
                      paddingAngle={2}
                      stroke="#fff"
                      strokeWidth={2}
                      label={({ value }) => `${value}%`}
                      labelLine={false}
                    >
                      {statusChartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [`${value}%`, name]} />
                    <Legend
                      verticalAlign="bottom"
                      height={20}
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontFamily: "Montserrat", fontSize: 9 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="indicator-subcard">
              <div className="ct">Aprovação mensal</div>
              <div className="cw" style={{ height: 130 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={d.mensal} margin={{ top: 8, right: 12, bottom: 2, left: -16 }}>
                    <CartesianGrid stroke="#f4f4f4" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontFamily: "Montserrat", fontSize: 10 }} />
                    <YAxis
                      tick={{ fontFamily: "Montserrat", fontSize: 10 }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip formatter={(value) => [`${value}%`, "Aprovação"]} />
                    <Legend wrapperStyle={{ fontFamily: "Montserrat", fontSize: 10 }} />
                    <ReferenceLine
                      y={d.meta}
                      stroke={GOLD}
                      strokeDasharray="5 4"
                      label={{
                        value: `Meta (${d.meta}%)`,
                        position: "insideTopRight",
                        fontSize: 9,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="v"
                      name="Aprovação (%)"
                      stroke={BLUE}
                      strokeWidth={2}
                      dot={{ r: 5, fill: BLUE }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="indicator-subcard">
            <div className="ct">Aprovação por unidade</div>
            {d.unidades.length ? (
              d.unidades.map((unit) => {
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
                    <div className="uval" style={{ color: ok ? GREEN : RED }}>
                      {unit.v}%
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="ps">Sem unidades publicadas.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelMetric({
  label,
  value,
  meta,
  tone,
  ok,
}: {
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
