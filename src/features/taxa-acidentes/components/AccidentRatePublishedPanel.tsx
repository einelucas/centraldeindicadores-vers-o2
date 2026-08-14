"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileDown } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  Rectangle,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BarShapeProps } from "recharts";
import { PublishedPanelPlaceholder } from "@/components/layout/PublishedPanelPlaceholder";
import { ToolbarSlotContent } from "@/components/layout/ToolbarSlot";
import { usePanelPdfExport } from "@/lib/exports/panel-screenshot-pdf";
import type { AccidentRatePublishedPayload } from "@/features/taxa-acidentes/publications";
import { formatPeriodRangeLabel } from "@/lib/period";
import {
  compareAccidentUnits,
  formatAccidentUnitLabel,
} from "@/features/taxa-acidentes/utils/units";

interface PublicationResponse {
  publication: null | {
    version: number;
    payload: AccidentRatePublishedPayload;
    publishedAt: string;
    publishedBy: { name: string };
  };
}

const BLUE = "#304F7E";
const GREEN = "#609346";
const GOLD = "#EAA239";
const RED = "#CC5121";

function decimal(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// Uma barra de valor 0 renderiza com altura 0 — visualmente idêntica a "sem
// dado". Sem essa marca, uma unidade com zero acidentes no período (uma boa
// notícia) parece que nem foi lida. Desenha um traço fino na base em vez de
// nada quando o valor é zero.
const ZERO_STUB_PX = 3;

function ZeroAwareBar(props: BarShapeProps) {
  const { height, y } = props;
  if (typeof height === "number" && height < 1 && typeof y === "number") {
    return <Rectangle {...props} height={ZERO_STUB_PX} y={y - ZERO_STUB_PX} fillOpacity={0.45} />;
  }
  return <Rectangle {...props} />;
}

interface ZeroAwareLabelProps {
  x?: unknown;
  y?: unknown;
  width?: unknown;
  value?: unknown;
}

function ZeroAwareLabel({ x, y, width, value }: ZeroAwareLabelProps) {
  const nx = Number(x);
  const ny = Number(y);
  const nw = Number(width);
  if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nw)) return null;
  const isZero = Number(value) === 0;
  return (
    <text
      x={nx + nw / 2}
      y={isZero ? ny - ZERO_STUB_PX - 5 : ny - 6}
      textAnchor="middle"
      fontFamily="Montserrat"
      fontSize={10}
      fontWeight={700}
      fill="#475569"
    >
      {String(value)}
    </text>
  );
}

export function AccidentRatePublishedPanel() {
  const [response, setResponse] = useState<PublicationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const { exporting, error: exportError, exportPdf } = usePanelPdfExport(panelRef);

  const handleExportPdf = useCallback(
    () => exportPdf(`TaxaAcidentes_painel_${new Date().toISOString().slice(0, 10)}.pdf`),
    [exportPdf],
  );

  const load = useCallback(async () => {
    try {
      const request = await fetch("/api/publicacoes/taxa-acidentes", {
        cache: "no-store",
      });

      if (!request.ok) {
        throw new Error("Falha ao carregar a publicação.");
      }

      setResponse((await request.json()) as PublicationResponse);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar o painel.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unitPeriods = useMemo(() => {
    const units = response?.publication?.payload.unidades ?? [];
    const byKey = new Map<string, { key: string; label: string; year: number; month: number }>();

    for (const item of units) {
      const key = periodKey(item.year, item.month);
      byKey.set(key, {
        key,
        label: item.label,
        year: item.year,
        month: item.month,
      });
    }

    return Array.from(byKey.values()).sort((a, b) => b.year - a.year || b.month - a.month);
  }, [response]);

  useEffect(() => {
    const firstPeriod = unitPeriods[0];

    if (firstPeriod && !unitPeriods.some((period) => period.key === selectedPeriod)) {
      setSelectedPeriod(firstPeriod.key);
    }
  }, [selectedPeriod, unitPeriods]);

  const unitChartData = useMemo(() => {
    const units = response?.publication?.payload.unidades ?? [];
    const activePeriod = selectedPeriod || unitPeriods[0]?.key;

    if (!activePeriod) {
      return [];
    }

    return units
      .filter((item) => periodKey(item.year, item.month) === activePeriod)
      .map((item) => ({
        unidade: formatAccidentUnitLabel(item.unidade),
        caf: item.caf,
        saf: item.saf,
      }))
      .sort((a, b) => compareAccidentUnits(a.unidade, b.unidade));
  }, [response, selectedPeriod, unitPeriods]);

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

  if (error) {
    return (
      <>
        {exportButton}
        <div className="error-box">{error}</div>
      </>
    );
  }

  if (!response?.publication) {
    return (
      <>
        {exportButton}
        <PublishedPanelPlaceholder />
      </>
    );
  }

  const publication = response.publication;
  const data = publication.payload;
  const result = Math.round(data.resultado * 10) / 10;
  const resultOk = result <= data.meta;
  const latestOk = data.desempenhoMes <= data.meta;

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
            label="Taxa Semestral"
            value={decimal(result)}
            meta={`Meta ≤ ${decimal(data.meta)}`}
            tone={resultOk ? "G" : "R"}
            ok={resultOk}
          />

          <PanelMetric
            label="Meta frequência"
            value={decimal(data.metaFrequencia)}
            meta="Meta da frequência"
            tone="G"
          />

          <PanelMetric
            label="Acidentes CAF"
            value={String(data.acidentesCaf)}
            meta="Total mensal do período"
            tone="A"
          />

          <PanelMetric
            label="Desempenho mês"
            value={decimal(data.desempenhoMes)}
            meta="Leitura mais recente"
            tone={latestOk ? "G" : "R"}
            ok={latestOk}
          />
        </div>

        {/* Container do indicador: agrupa os gráficos e a leitura por unidade
            que pertencem a este mesmo indicador — mesma hierarquia usada nos
            painéis do RDO, IDP, RNC e 5S. */}
        <div className="card indicator-card">
          <div className="ph">Taxa de Acidentes</div>
          <div
            className="ps"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                background: BLUE,
                color: "white",
                fontWeight: 800,
                fontSize: 13,
                padding: "5px 12px",
                borderRadius: 20,
              }}
            >
              META: ≤ {decimal(data.meta)}
            </span>
            Resultado:{" "}
            <strong style={{ color: resultOk ? GREEN : RED, fontSize: 14 }}>
              {decimal(result)}
            </strong>
            <span style={{ color: "#bbb" }}>
              — quanto menor, melhor — versão {publication.version}, publicada por{" "}
              {publication.publishedBy.name} em{" "}
              {new Date(publication.publishedAt).toLocaleString("pt-BR")}
              {data.periodo ? ` · Período: ${formatPeriodRangeLabel(data.periodo)}` : ""}
            </span>
          </div>

          <div className="g2 indicator-subgrid">
            <div className="indicator-subcard">
              <div className="ct">Taxa de frequência mensal</div>

              <div className="cw" style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={data.mensal}
                    margin={{ top: 24, right: 45, bottom: 12, left: 0 }}
                  >
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" vertical={false} />

                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      height={42}
                      tick={{
                        fontFamily: "Montserrat",
                        fontSize: 10,
                        fontWeight: 600,
                        fill: "#475569",
                      }}
                    />

                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      width={40}
                      tick={{
                        fontFamily: "Montserrat",
                        fontSize: 10,
                        fill: "#64748b",
                      }}
                    />

                    <Tooltip
                      formatter={(value) => [decimal(Number(value)), "Taxa"]}
                      cursor={{ stroke: "#cbd5e1", strokeDasharray: "4 4" }}
                      contentStyle={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        backgroundColor: "#ffffff",
                        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
                        padding: "10px 14px",
                        fontFamily: "Montserrat",
                        fontSize: 12,
                      }}
                      labelStyle={{
                        color: "#0f172a",
                        fontWeight: 700,
                        marginBottom: 6,
                      }}
                    />

                    <ReferenceLine
                      y={data.meta}
                      stroke={GOLD}
                      strokeDasharray="5 4"
                      label={{
                        value: `Meta ${decimal(data.meta)}`,
                        position: "insideTopRight",
                        fill: GOLD,
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    />

                    <Line
                      type="monotone"
                      dataKey="taxa"
                      name="Taxa frequência"
                      stroke={BLUE}
                      strokeWidth={3}
                      dot={{ r: 4, fill: BLUE, strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: BLUE, stroke: "#ffffff", strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="indicator-subcard">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div className="ct">Correlação CAF e SAF por unidade</div>
                  <p className="ps" style={{ margin: 0 }}>
                    Barras agrupadas por unidade.
                  </p>
                </div>

                {unitPeriods.length > 1 ? (
                  <select
                    value={selectedPeriod}
                    onChange={(event) => setSelectedPeriod(event.target.value)}
                    aria-label="Selecionar competência"
                    style={{
                      minWidth: 130,
                      height: 32,
                      padding: "0 30px 0 10px",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      backgroundColor: "#ffffff",
                      color: "#0f172a",
                      fontFamily: "Montserrat",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      outline: "none",
                    }}
                  >
                    {unitPeriods.map((period) => (
                      <option key={period.key} value={period.key}>
                        {period.label}
                      </option>
                    ))}
                  </select>
                ) : unitPeriods[0] ? (
                  <strong
                    className="ps"
                    style={{
                      padding: "6px 10px",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      backgroundColor: "#ffffff",
                      color: "#0f172a",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {unitPeriods[0].label}
                  </strong>
                ) : null}
              </div>

              <div className="cw" style={{ height: 160, marginTop: 8 }}>
                {unitChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={unitChartData}
                      margin={{
                        top: 8,
                        right: 12,
                        bottom: 8,
                        left: 0,
                      }}
                      barCategoryGap="28%"
                      barGap={6}
                    >
                      <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" vertical={false} />

                      <XAxis
                        dataKey="unidade"
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        height={30}
                        tickMargin={6}
                        tick={{
                          fontFamily: "Montserrat",
                          fontSize: 9,
                          fontWeight: 600,
                          fill: "#475569",
                        }}
                      />

                      <YAxis
                        allowDecimals={false}
                        axisLine={false}
                        tickLine={false}
                        width={24}
                        tickMargin={6}
                        tick={{
                          fontFamily: "Montserrat",
                          fontSize: 9,
                          fill: "#64748b",
                        }}
                      />

                      <Tooltip
                        cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
                        contentStyle={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 12,
                          backgroundColor: "#ffffff",
                          boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
                          padding: "10px 14px",
                          fontFamily: "Montserrat",
                          fontSize: 12,
                        }}
                        labelStyle={{
                          color: "#0f172a",
                          fontWeight: 700,
                          marginBottom: 6,
                        }}
                        itemStyle={{
                          fontWeight: 600,
                        }}
                      />

                      <Legend
                        verticalAlign="top"
                        align="center"
                        iconType="circle"
                        iconSize={8}
                        height={24}
                        wrapperStyle={{
                          fontFamily: "Montserrat",
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      />

                      <Bar
                        dataKey="caf"
                        name="Acidentes CAF"
                        fill={GOLD}
                        radius={[6, 6, 0, 0]}
                        maxBarSize={32}
                        shape={ZeroAwareBar}
                      >
                        <LabelList dataKey="caf" content={ZeroAwareLabel} />
                      </Bar>

                      <Bar
                        dataKey="saf"
                        name="Acidentes SAF"
                        fill={BLUE}
                        radius={[6, 6, 0, 0]}
                        maxBarSize={32}
                        shape={ZeroAwareBar}
                      >
                        <LabelList dataKey="saf" content={ZeroAwareLabel} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="ps" style={{ margin: 0, textAlign: "center" }}>
                    Nenhuma unidade foi publicada para esta competência.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="indicator-subcard">
            <div className="ct">Acidentes mensais (CAF)</div>

            <div className="cw" style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.mensal}
                  layout="vertical"
                  margin={{
                    top: 18,
                    right: 42,
                    bottom: 12,
                    left: 12,
                  }}
                  barCategoryGap="28%"
                >
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" horizontal={false} />

                  <XAxis
                    type="number"
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fontFamily: "Montserrat",
                      fontSize: 10,
                      fill: "#64748b",
                    }}
                  />

                  <YAxis
                    type="category"
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    width={82}
                    tickMargin={10}
                    tick={{
                      fontFamily: "Montserrat",
                      fontSize: 10,
                      fontWeight: 600,
                      fill: "#475569",
                    }}
                  />

                  <Tooltip
                    cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
                    contentStyle={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 12,
                      backgroundColor: "#ffffff",
                      boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
                      padding: "10px 14px",
                      fontFamily: "Montserrat",
                      fontSize: 12,
                    }}
                    labelStyle={{
                      color: "#0f172a",
                      fontWeight: 700,
                      marginBottom: 6,
                    }}
                    itemStyle={{
                      color: BLUE,
                      fontWeight: 600,
                    }}
                  />

                  <Bar
                    dataKey="caf"
                    name="Acidentes CAF"
                    fill={BLUE}
                    radius={[0, 8, 8, 0]}
                    maxBarSize={34}
                  >
                    <LabelList
                      dataKey="caf"
                      position="right"
                      fill="#475569"
                      fontFamily="Montserrat"
                      fontSize={10}
                      fontWeight={700}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
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
  return (
    <div className={`mc ${tone}`}>
      <div className="ml">{label}</div>
      <div className={`mv ${tone}`}>{value}</div>
      <div className="mm">{meta}</div>

      {ok !== undefined ? (
        <div className={`ms ${ok ? "ok" : "no"}`}>{ok ? "✓ Atingida" : "✗ Fora da meta"}</div>
      ) : null}
    </div>
  );
}
