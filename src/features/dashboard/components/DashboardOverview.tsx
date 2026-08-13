"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PublishedPanelPlaceholder } from "@/components/layout/PublishedPanelPlaceholder";
import type { GeneralPanelData, GeneralPanelIndicator } from "@/features/scorecard/publications";

const BLUE = "#304F7E";

// Uma cor bem distinta por mês (modelo colorido, no estilo do resto do app:
// azul, laranja, verde... em vez de um único matiz em degradê), em ordem
// fixa Jun→Nov — a ordem nunca muda, é o que garante que as cores sigam
// distinguíveis mesmo sob daltonismo. Croma e luminosidade elevados pra
// ficar vívido (bem acima do tom pastel do brand default #304F7E).
// Validado com scripts/validate_palette.js (checks categóricos: banda de
// luminosidade, piso de croma, separação CVD adjacente ≥8, piso de visão
// normal ≥15, contraste ≥3:1 — todos OK nesta ordem).
const MONTH_COLORS = ["#0074ca", "#c37a00", "#008f7b", "#c53732", "#7a4db5", "#48871e"];

function monthColor(index: number): string {
  return MONTH_COLORS[index % MONTH_COLORS.length] ?? BLUE;
}

// Legenda própria em vez do <Legend> automático do Recharts: para BarChart,
// o Recharts às vezes lista as séries na ordem inversa à declarada — no
// gráfico por mês isso inverte a cronologia e é exatamente a ambiguidade
// reportada ("Jul" aparecendo antes de "Jun" na legenda). Renderizar a
// lista nós mesmos garante Jun→Nov sempre na mesma ordem das barras.
function MonthLegend({ monthKeys, monthLabels }: { monthKeys: string[]; monthLabels: string[] }) {
  return (
    <ul className="month-legend">
      {monthKeys.map((key, index) => (
        <li key={key}>
          <span className="month-legend-swatch" style={{ background: monthColor(index) }} />
          {monthLabels[index]}
        </li>
      ))}
    </ul>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatPoints(value: number, decimals = 2): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function unitSuffix(indicator: Pick<GeneralPanelIndicator, "unit">): string {
  if (indicator.unit === "dias") return " dias";
  return indicator.unit;
}

function formatValue(indicator: Pick<GeneralPanelIndicator, "unit">, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (indicator.unit === "dias") return `${value.toFixed(1)} dias`;
  if (indicator.unit === "%") return `${value.toFixed(1)}%`;
  return value.toFixed(1);
}

function formatMeta(indicator: GeneralPanelIndicator): string {
  const operator = indicator.direction === "lower" ? "≤" : "≥";
  return `${operator}${indicator.meta}${unitSuffix(indicator)}`;
}

function Dot({ state }: { state: "G" | "A" | "R" | "X" }) {
  return (
    <span
      className={`dot ${state}`}
      aria-label={
        state === "G"
          ? "Dentro da meta"
          : state === "R"
            ? "Fora da meta"
            : state === "A"
              ? "Atenção"
              : "Sem dados"
      }
    />
  );
}

function ResultBadge({ pass }: { pass: boolean | null }) {
  if (pass === null) return <span className="badge X">Sem dados</span>;
  return <span className={`badge ${pass ? "G" : "R"}`}>{pass ? "OK" : "Atenção"}</span>;
}

function SummaryMetric({
  label,
  value,
  sub,
  state,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  state?: "G" | "A" | "R";
  /** Cor exata (sobrepõe `state`) — usada quando a faixa vem de uma escala
      com mais níveis do que G/A/R, ex.: o degradê de 5 faixas da legenda
      setorial. */
  color?: string;
}) {
  return (
    <div
      className={`mc${state ? ` ${state}` : ""}`}
      style={color ? { borderLeftColor: color } : undefined}
    >
      <div className="ml">{label}</div>
      <div className={`mv${state ? ` ${state}` : ""}`} style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="mm">{sub}</div>
    </div>
  );
}

/** Mesmas faixas da "Legenda · Indicadores setoriais" — 5 níveis em vez do
    G/A/R de 3 níveis usado no resto do painel. */
function sectoralTone(value: number): string {
  if (value >= 95) return "#609346";
  if (value >= 90) return "#168A86";
  if (value >= 80) return "#1382C4";
  if (value >= 70) return "#EAA239";
  return "#CC5121";
}

export function DashboardOverview() {
  const [data, setData] = useState<GeneralPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      if (!response.ok) throw new Error("Falha ao carregar o Painel Geral.");
      setData((await response.json()) as GeneralPanelData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar o Painel Geral.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("rdo:published", refresh);
    window.addEventListener("indicator:published", refresh);
    return () => {
      window.removeEventListener("rdo:published", refresh);
      window.removeEventListener("indicator:published", refresh);
    };
  }, [load]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.indicators.map((indicator) => {
      const row: Record<string, string | number | null> = {
        indicador: indicator.shortLabel,
      };
      indicator.months.forEach((month, index) => {
        row[`month_${index}`] = month.pctOfMeta;
      });
      return row;
    });
  }, [data]);

  if (loading && !data) {
    return (
      <div className="painel-frontend">
        <div className="content" style={{ padding: "14px 0 0" }}>
          <div className="empty">
            <p className="ps">Carregando Painel Geral…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <PublishedPanelPlaceholder
        title="Não foi possível carregar o Painel Geral"
        description={error}
      />
    );
  }

  if (!data?.hasData) {
    return (
      <PublishedPanelPlaceholder
        title="Nenhum indicador publicado ainda"
        description='Vá em cada aba, carregue os dados na Administração e clique em "Publicar no Painel". O Painel Geral será montado somente com os snapshots publicados.'
      />
    );
  }

  // Arredonda antes de classificar a faixa de cor — senão um valor como
  // 89,6% aparece como "90%" na tela mas ainda pinta na faixa de baixo
  // (80–89,99%), porque a cor usava o número cru e o texto usava o
  // arredondado. Os dois têm que nascer do mesmo número redondo.
  const roundedAtendimentoGeral = Math.round(data.atendimentoGeral);

  return (
    <div className="painel-frontend">
      <div className="content" style={{ padding: "14px 0 0" }}>
        <div className="mgrid">
          <SummaryMetric
            label="Pontuação Prevista — Semestre"
            value={formatPoints(data.pontuacaoPrevistaSemestre)}
            sub="Meta total dos 6 meses"
          />
          <SummaryMetric
            label="Pontuação Prevista — Período"
            value={formatPoints(data.pontuacaoPrevista)}
            sub={`Meta dos ${data.monthKeys.length} mês(es) com dados`}
          />
          <SummaryMetric
            label="Pontos Realizados"
            value={data.pontosRealizados.toLocaleString("pt-BR")}
            sub="Acumulado no período com dados"
            state="A"
          />
          <SummaryMetric
            label="Atendimento Geral"
            value={`${roundedAtendimentoGeral}%`}
            sub="Realizado ÷ previsto do período"
            color={sectoralTone(roundedAtendimentoGeral)}
          />
        </div>

        {/* Container do indicador: agrupa a tabela consolidada, as legendas
            e o gráfico mensal — mesma hierarquia usada nos painéis publicados
            (RDO, IDP, RNC, 5S, Taxa de Acidentes). */}
        <div className="card indicator-card">
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <div className="ph" style={{ margin: 0 }}>
              Resumo Executivo
            </div>
            <span style={{ fontSize: 11, color: "#999" }}>
              Referência: {formatDate(data.referenceDate)}
              {data.monthLabels.length ? (
                <>
                  {" "}
                  · Período: {data.monthLabels[0]}
                  {data.monthLabels.length > 1
                    ? ` – ${data.monthLabels[data.monthLabels.length - 1]}`
                    : ""}
                </>
              ) : null}
            </span>
          </div>

          <div className="indicator-subcard" style={{ marginTop: 14, marginBottom: 14 }}>
            <div className="ct">Resultado geral do PPR Obras</div>
            <p className="ps" style={{ margin: "-6px 0 12px" }}>
              Leitura consolidada dos indicadores e pesos mensais. Dados administrativos não
              publicados não entram neste quadro.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="dt" style={{ minWidth: 700 }}>
                <thead>
                  <tr>
                    <th>Entrega</th>
                    <th>Meta</th>
                    <th>Peso</th>
                    {data.monthLabels.map((label) => (
                      <th key={label} style={{ textAlign: "center" }}>
                        {label}
                      </th>
                    ))}
                    <th>Parcial</th>
                    <th>Consolidado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.indicators.map((indicator) => (
                    <tr key={indicator.key}>
                      <td>{indicator.label.toUpperCase()}</td>
                      <td>{formatMeta(indicator)}</td>
                      <td>{indicator.peso.toFixed(2)}%</td>
                      {indicator.months.map((month) => (
                        <td key={month.key} style={{ textAlign: "center" }}>
                          <Dot state={month.pass === null ? "X" : month.pass ? "G" : "R"} />
                        </td>
                      ))}
                      <td>{formatValue(indicator, indicator.partial)}</td>
                      <td>
                        <ResultBadge pass={indicator.partialPass} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="g2 indicator-subgrid">
            <div className="indicator-subcard">
              <div className="ct">Legenda · Indicadores gerais</div>

              <p className="ps" style={{ margin: "-6px 0 10px" }}>
                Faixas de leitura do atendimento consolidado.
              </p>

              <LegendRow dot={<Dot state="G" />} title="≥ 95%" subtitle="Valor atendido" />

              <LegendRow dot={<Dot state="A" />} title="70% a 94,99%" subtitle="Atenção" />

              <LegendRow dot={<Dot state="R" />} title="< 70%" subtitle="Fora da meta" />
            </div>

            <div className="indicator-subcard">
              <div className="ct">Legenda · Indicadores setoriais</div>

              <p className="ps" style={{ margin: "-6px 0 10px" }}>
                Faixas de leitura para os indicadores setoriais (por unidade).
              </p>

              <LegendRow
                dot={<span className="dot" style={{ background: "#609346" }} />}
                title="≥ 95%"
                subtitle="Valor atendido"
              />

              <LegendRow
                dot={<span className="dot" style={{ background: "#168A86" }} />}
                title="90% a 94,99%"
                subtitle="90%"
              />

              <LegendRow
                dot={<span className="dot" style={{ background: "#1382C4" }} />}
                title="80% a 89,99%"
                subtitle="80%"
              />

              <LegendRow
                dot={<span className="dot" style={{ background: "#EAA239" }} />}
                title="70% a 79,99%"
                subtitle="70%"
              />

              <LegendRow
                dot={<span className="dot" style={{ background: "#CC5121" }} />}
                title="< 70%"
                subtitle="Sem setorial"
              />
            </div>
          </div>

          <div className="indicator-subcard">
            <div className="ct">Desempenho mensal (% da meta atingida)</div>
            <p className="ps" style={{ margin: "-6px 0 12px" }}>
              Cada indicador mostra um mês por barra, uma cor fixa por mês (veja a legenda). A linha
              tracejada marca 100% da meta.
            </p>

            <div className="cw" style={{ height: 340, minWidth: 0 }}>
              {data.monthLabels.length ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={100}>
                  <BarChart
                    data={chartData}
                    margin={{ top: 12, right: 20, bottom: 8, left: -4 }}
                    barGap={3}
                    maxBarSize={28}
                  >
                    <CartesianGrid stroke="#f4f4f4" vertical={false} />

                    <XAxis
                      dataKey="indicador"
                      tick={{
                        fontFamily: "Montserrat",
                        fontSize: 9,
                      }}
                    />

                    <YAxis
                      tick={{
                        fontFamily: "Montserrat",
                        fontSize: 10,
                      }}
                      tickFormatter={(value: unknown) => `${value}%`}
                    />

                    <ReferenceLine
                      y={100}
                      stroke="#9CA3AF"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{
                        value: "Meta 100%",
                        position: "insideTopRight",
                        fill: "#6b7280",
                        fontFamily: "Montserrat",
                        fontSize: 9,
                      }}
                    />

                    <Tooltip
                      formatter={(value: unknown, name: unknown) => [
                        value === null ? "—" : `${Number(value).toFixed(1)}% da meta`,
                        String(name),
                      ]}
                      contentStyle={{
                        fontFamily: "Montserrat",
                        fontSize: 11,
                        borderRadius: 8,
                      }}
                    />

                    <Legend
                      verticalAlign="bottom"
                      content={
                        <MonthLegend monthKeys={data.monthKeys} monthLabels={data.monthLabels} />
                      }
                    />

                    {data.monthLabels.map((label, index) => (
                      <Bar
                        key={label}
                        dataKey={`month_${index}`}
                        name={label}
                        fill={monthColor(index)}
                        radius={[4, 4, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty">
                  <p className="ps">Nenhuma série mensal publicada.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendRow({
  dot,
  title,
  subtitle,
}: {
  dot: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="legend-row">
      <span className="legend-row-dot">{dot}</span>
      <div>
        <strong>{title}</strong>
        {subtitle ? (
          <>
            <br />
            <span style={{ color: "#999", fontSize: 11 }}>{subtitle}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
