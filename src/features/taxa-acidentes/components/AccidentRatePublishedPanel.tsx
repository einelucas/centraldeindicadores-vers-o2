"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
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
import type { AccidentRatePublishedPayload } from "@/features/taxa-acidentes/publications";
import {
  compareAccidentUnits,
  normalizeAccidentUnitCode,
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

export function AccidentRatePublishedPanel() {
  const [response, setResponse] = useState<PublicationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState("");

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
        unidade: normalizeAccidentUnitCode(item.unidade),
        caf: item.caf,
        saf: item.saf,
      }))
      .sort((a, b) => compareAccidentUnits(a.unidade, b.unidade));
  }, [response, selectedPeriod, unitPeriods]);

  if (error) {
    return <div className="error-box">{error}</div>;
  }

  if (!response?.publication) {
    return <PublishedPanelPlaceholder />;
  }

  const publication = response.publication;
  const data = publication.payload;
  const result = Math.round(data.resultado * 10) / 10;
  const resultOk = result <= data.meta;
  const latestOk = data.desempenhoMes <= data.meta;

  return (
    <div className="painel-frontend">
      <div className="content" style={{ padding: "14px 0 0" }}>
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
          <strong
            style={{
              color: resultOk ? GREEN : RED,
              fontSize: 14,
            }}
          >
            {decimal(result)}
          </strong>
          <span style={{ color: "#bbb" }}>
            — quanto menor, melhor — versão {publication.version}, publicada por{" "}
            {publication.publishedBy.name} em{" "}
            {new Date(publication.publishedAt).toLocaleString("pt-BR")}
          </span>
        </div>

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

        <div className="g2">
          <div className="card">
            <div className="ct">Taxa de frequência mensal</div>

            <div className="cw" style={{ height: 290 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.mensal} margin={{ top: 24, right: 20, bottom: 12, left: 0 }}>
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

          <div className="card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                <div className="ct">Correlação entre acidentes CAF e SAF por unidade</div>

                <div className="ps">
                  Barras agrupadas para comparar as duas classificações em cada unidade.
                </div>
              </div>

              {unitPeriods.length > 1 ? (
                <select
                  value={selectedPeriod}
                  onChange={(event) => setSelectedPeriod(event.target.value)}
                  aria-label="Selecionar competência"
                  style={{
                    minWidth: 145,
                    height: 38,
                    padding: "0 36px 0 12px",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    backgroundColor: "#ffffff",
                    color: "#0f172a",
                    fontFamily: "Montserrat",
                    fontSize: 12,
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
                    padding: "8px 12px",
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

            {unitChartData.length > 0 ? (
              <div
                className="cw"
                style={{
                  width: "100%",
                  height: 380,
                  marginTop: 16,
                  padding: "12px 14px 6px",
                  backgroundColor: "#ffffff",
                  borderRadius: 12,
                  overflow: "hidden",
                  boxSizing: "border-box",
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={unitChartData}
                    margin={{
                      top: 8,
                      right: 20,
                      bottom: 20,
                      left: 0,
                    }}
                    barCategoryGap="28%"
                    barGap={8}
                  >
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" vertical={false} />

                    <XAxis
                      dataKey="unidade"
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      height={48}
                      tickMargin={10}
                      tick={{
                        fontFamily: "Montserrat",
                        fontSize: 10,
                        fontWeight: 600,
                        fill: "#475569",
                      }}
                    />

                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                      tickMargin={8}
                      tick={{
                        fontFamily: "Montserrat",
                        fontSize: 10,
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
                      iconSize={9}
                      height={42}
                      wrapperStyle={{
                        paddingTop: 2,
                        paddingBottom: 12,
                        fontFamily: "Montserrat",
                        fontSize: 11,
                        fontWeight: 600,
                        lineHeight: "20px",
                      }}
                    />

                    <Bar
                      dataKey="caf"
                      name="Acidentes CAF"
                      fill={GOLD}
                      radius={[8, 8, 0, 0]}
                      maxBarSize={42}
                    >
                      <LabelList
                        dataKey="caf"
                        position="top"
                        fill="#475569"
                        fontFamily="Montserrat"
                        fontSize={10}
                        fontWeight={700}
                      />
                    </Bar>

                    <Bar
                      dataKey="saf"
                      name="Acidentes SAF"
                      fill={BLUE}
                      radius={[8, 8, 0, 0]}
                      maxBarSize={42}
                    >
                      <LabelList
                        dataKey="saf"
                        position="top"
                        fill="#475569"
                        fontFamily="Montserrat"
                        fontSize={10}
                        fontWeight={700}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div
                className="cw"
                style={{
                  marginTop: 16,
                  padding: "28px 20px",
                  backgroundColor: "#ffffff",
                  borderRadius: 12,
                  textAlign: "center",
                }}
              >
                <p className="ps" style={{ margin: 0 }}>
                  Nenhuma unidade foi publicada para esta competência.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="ct">Acidentes mensais (CAF)</div>

          <div className="cw" style={{ height: 290 }}>
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
