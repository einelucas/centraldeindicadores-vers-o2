"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
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
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleExportPdf = useCallback(async () => {
    if (!panelRef.current) return;

    setExporting(true);
    setExportError(null);

    try {
      const canvas = await html2canvas(panelRef.current, {
        backgroundColor: "#eff2f7",
        scale: 2,
        useCORS: true,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
        unit: "px",
        format: [canvas.width, canvas.height],
      });

      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save(`RNC_painel_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Falha ao gerar o PDF do painel.",
      );
    } finally {
      setExporting(false);
    }
  }, []);

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

  if (loading && !publication) {
    return (
      <div className="painel-frontend">
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
      <div className="content" style={{ padding: "14px 0 0" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div className="ph">RNC — Tempo para Resolução</div>

          <button
            className="btn btn-gold"
            type="button"
            disabled={exporting}
            data-html2canvas-ignore="true"
            onClick={() => void handleExportPdf()}
          >
            {exporting ? "Gerando PDF…" : "Baixar PDF"}
          </button>
        </div>

        {exportError ? (
          <p className="ps" style={{ color: RED }}>
            {exportError}
          </p>
        ) : null}

        <div className="ps rdo-panel-summary">
          <span className="rdo-panel-target">META: ≤{data.meta} dias</span>

          <span>
            Resultado:{" "}
            <strong
              style={{
                color: resultOk ? GREEN : RED,
                fontSize: 14,
              }}
            >
              {result.toFixed(1).replace(".", ",")} dias
            </strong>
          </span>

          <span style={{ color: "#bbb" }}>
            — quanto menor, melhor — publicado em {formatPublishedAt(publication.publishedAt)} por{" "}
            {publication.publishedBy.name}
          </span>
        </div>

        <p className="ps" style={{ margin: "-4px 0 12px" }}>
          Prazo médio consolidado calculado pela média simples dos resultados mensais do período selecionado.
        </p>

        <div className="g2">
          {/* Coluna esquerda: resultado e gráfico mensal */}
          <div
            style={{
              display: "grid",
              alignContent: "start",
              gap: 12,
            }}
          >
            <PanelMetric
              label="Resultado"
              value={`${result.toFixed(1).replace(".", ",")} dias`}
              meta={`Meta ≤${data.meta} dias`}
              tone={resultOk ? "G" : "R"}
              ok={resultOk}
            />

            <div className="card" style={{ marginBottom: 0 }}>
              <div className="ct">Tempo médio por mês (dias)</div>

              <div className="cw" style={{ height: 220 }}>
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
                          fontSize: 10,
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
          </div>

          {/* Coluna direita: semestre e origem das não conformidades */}
          <div
            style={{
              display: "grid",
              alignContent: "start",
              gap: 12,
            }}
          >
            <PanelMetric
              label="Semestre"
              value={`${semesterPct}%`}
              meta={`${data.semestreResolvidas}/${data.semestreTotal} tratadas`}
              tone="G"
            />

            <div className="card" style={{ marginBottom: 0 }}>
              <div className="ct">Origem das não conformidades</div>

              <div className="cw" style={{ height: 260 }}>
                {data.ofensores.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.ofensores}
                        dataKey="pct"
                        nameKey="n"
                        cx="50%"
                        cy="45%"
                        innerRadius={45}
                        outerRadius={84}
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
        </div>

        <div className="card">
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
