"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileDown } from "lucide-react";
import { usePanelPdfExport } from "@/lib/exports/panel-screenshot-pdf";
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
import { PublishedPanelPlaceholder } from "@/components/layout/PublishedPanelPlaceholder";
import { ToolbarSlotContent } from "@/components/layout/ToolbarSlot";
import type { RncPublishedPayload } from "@/features/rnc/publications";

interface PublicationResponse {
  publication: null | {
    id: string;
    version: number;
    target: number | null;
    result: number | null;
    status: string | null;
    payload: RncPublishedPayload;
    publishedAt: string;
    publishedBy: {
      id: string;
      name: string;
      email: string;
    };
  };
}

const BLUE = "#304F7E";
const GOLD = "#EAA239";
const GREEN = "#609346";
const RED = "#CC5121";
const GRAY = "#BDBFC1";

const PIE_COLORS = [BLUE, GOLD, GREEN, GRAY, "#7B5EA7"];

function formatPublishedAt(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function RncPublishedPanel() {
  const [publication, setPublication] = useState<PublicationResponse["publication"]>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { exporting, error: exportError, exportPdf } = usePanelPdfExport(panelRef);

  const handleExportPdf = useCallback(
    () => exportPdf(`RNC_painel_${new Date().toISOString().slice(0, 10)}.pdf`),
    [exportPdf],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/publicacoes/rnc", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Falha ao carregar o painel publicado.");
      }

      const body = (await response.json()) as PublicationResponse;

      setPublication(body.publication);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar o painel.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    const refresh = () => void load();

    window.addEventListener("rnc:published", refresh);

    return () => {
      window.removeEventListener("rnc:published", refresh);
    };
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

  if (loading && !publication) {
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

  if (error && !publication) {
    return (
      <PublishedPanelPlaceholder title="Não foi possível carregar o painel" description={error} />
    );
  }

  if (!publication) {
    return <PublishedPanelPlaceholder />;
  }

  const data = publication.payload;

  const result = Math.round(data.resultado * 10) / 10;
  const resultOk = result <= data.meta;

  const semesterPct = data.semestreTotal
    ? Math.round((data.semestreResolvidas / data.semestreTotal) * 100)
    : 0;

  const chartMonths = data.mensal.filter((month) => month.v !== null);

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
            value={`${result.toFixed(1).replace(".", ",")} dias`}
            meta={`Meta ≤${data.meta} dias`}
            tone={resultOk ? "G" : "R"}
            ok={resultOk}
          />
          <PanelMetric
            label="Semestre"
            value={`${semesterPct}%`}
            meta={`${data.semestreResolvidas}/${data.semestreTotal} tratadas`}
            tone="G"
          />
        </div>

        {/* Container do indicador: agrupa os gráficos e a leitura por unidade
            que pertencem a este mesmo indicador — mesma hierarquia usada nos
            painéis do RDO e do IDP. */}
        <div className="card indicator-card">
          <div className="ph">RNC — Tempo para Resolução</div>
          <div className="ps rdo-panel-summary">
            <span className="rdo-panel-target">META: ≤{data.meta} dias</span>
            <span>
              Resultado:{" "}
              <strong style={{ color: resultOk ? GREEN : RED, fontSize: 14 }}>
                {result.toFixed(1).replace(".", ",")} dias
              </strong>
            </span>
            <span style={{ color: "#bbb" }}>
              — quanto menor, melhor — publicado em {formatPublishedAt(publication.publishedAt)} por{" "}
              {publication.publishedBy.name}
            </span>
          </div>
          <p className="ps" style={{ margin: "-4px 0 12px" }}>
            Prazo médio consolidado calculado pela média simples dos resultados mensais do período
            selecionado.
          </p>

          <div className="g2 indicator-subgrid">
            <div className="indicator-subcard">
              <div className="ct">Tempo médio por mês (dias)</div>
              <div className="cw" style={{ height: 160 }}>
                {chartMonths.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={data.mensal}
                      margin={{
                        top: 8,
                        right: 12,
                        bottom: 2,
                        left: -16,
                      }}
                    >
                      <CartesianGrid stroke="#f4f4f4" vertical={false} />

                      <XAxis
                        dataKey="label"
                        tick={{
                          fontFamily: "Montserrat",
                          fontSize: 10,
                        }}
                      />

                      <YAxis
                        tick={{
                          fontFamily: "Montserrat",
                          fontSize: 10,
                        }}
                        tickFormatter={(value) => `${value}d`}
                      />

                      <Tooltip
                        formatter={(value) => [
                          `${Number(value).toFixed(1).replace(".", ",")} dias`,
                          "Tempo médio",
                        ]}
                      />

                      <Legend
                        wrapperStyle={{
                          fontFamily: "Montserrat",
                          fontSize: 9,
                        }}
                      />

                      <ReferenceLine
                        y={data.meta}
                        stroke={GOLD}
                        strokeDasharray="5 4"
                        label={{
                          value: `Meta (${data.meta} dias)`,
                          position: "insideTopRight",
                          fontSize: 9,
                        }}
                      />

                      <Line
                        type="monotone"
                        dataKey="v"
                        name="Tempo médio (dias)"
                        stroke={BLUE}
                        strokeWidth={2}
                        dot={{
                          r: 5,
                          fill: BLUE,
                        }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="ps">Sem meses com tempo de tratativa publicado.</p>
                )}
              </div>
            </div>

            <div className="indicator-subcard">
              <div className="ct">Origem das não conformidades</div>
              <div className="cw" style={{ height: 160 }}>
                {data.ofensores.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 2, right: 4, bottom: 2, left: 4 }}>
                      <Pie
                        data={data.ofensores}
                        dataKey="pct"
                        nameKey="n"
                        cx="50%"
                        cy="45%"
                        innerRadius={56}
                        outerRadius={92}
                        paddingAngle={2}
                        label={({ value }) => `${Number(value).toFixed(1)}%`}
                        labelLine={false}
                      >
                        {data.ofensores.map((offender, index) => (
                          <Cell key={offender.n} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>

                      <Tooltip
                        formatter={(value) => [`${Number(value).toFixed(1)}%`, "Participação"]}
                      />

                      <Legend
                        wrapperStyle={{
                          fontFamily: "Montserrat",
                          fontSize: 9,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="ps">Sem ofensores publicados.</p>
                )}
              </div>
            </div>
          </div>

          <div className="indicator-subcard">
            <div className="ct">Aderência de tratativa por unidade</div>

            {data.unidades.length ? (
              data.unidades.map((unit) => {
                const ok = unit.v >= 80;

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

                    <div
                      className="uval"
                      style={{
                        color: ok ? GREEN : RED,
                      }}
                    >
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
  const hasStatus = ok !== undefined;

  return (
    <div className={`mc ${tone}`}>
      <div className="ml">{label}</div>

      <div className={`mv ${tone}`}>{value}</div>

      <div className="mm">{meta}</div>

      <div
        className={`ms ${success ? "ok" : "no"}`}
        style={{
          visibility: hasStatus ? "visible" : "hidden",
        }}
        aria-hidden={!hasStatus}
      >
        {success ? "✓ Atingida" : "✗ Fora da meta"}
      </div>
    </div>
  );
}
