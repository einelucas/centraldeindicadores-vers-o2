"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PublishedPanelPlaceholder } from "@/components/layout/PublishedPanelPlaceholder";
import type {
  GeneralPanelData,
  GeneralPanelIndicator,
} from "@/features/scorecard/publications";

const BLUE = "#304F7E";
const CHART_COLORS = [
  "#304F7E",
  "#EAA239",
  "#609346",
  "#7B5EA7",
  "#E07B39",
  "#2E8B57",
  "#007CC5",
  "#C0392B",
];

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

function formatValue(
  indicator: Pick<GeneralPanelIndicator, "unit">,
  value: number | null,
): string {
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
  return <span className={`dot ${state}`} aria-label={state === "G" ? "Dentro da meta" : state === "R" ? "Fora da meta" : state === "A" ? "Atenção" : "Sem dados"} />;
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
}: {
  label: string;
  value: string;
  sub: string;
  state?: "G" | "A" | "R";
}) {
  return (
    <div className={`mc${state ? ` ${state}` : ""}`}>
      <div className="ml">{label}</div>
      <div className={`mv${state ? ` ${state}` : ""}`}>{value}</div>
      <div className="mm">{sub}</div>
    </div>
  );
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
          <div className="empty"><p className="ps">Carregando Painel Geral…</p></div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return <PublishedPanelPlaceholder title="Não foi possível carregar o Painel Geral" description={error} />;
  }

  if (!data?.hasData) {
    return (
      <PublishedPanelPlaceholder
        title="Nenhum indicador publicado ainda"
        description='Vá em cada aba, carregue os dados na Administração e clique em "Publicar no Painel". O Painel Geral será montado somente com os snapshots publicados.'
      />
    );
  }

  const attendanceState =
    data.atendimentoGeral >= 95 ? "G" : data.atendimentoGeral >= 70 ? "A" : "R";

  return (
    <div className="painel-frontend">
      <div className="content" style={{ padding: "14px 0 0" }}>
        <div className="mgrid">
          <SummaryMetric
            label="Pontuação Prevista"
            value={formatPoints(data.pontuacaoPrevista)}
            sub={`${data.monthKeys.length} mês(es) publicado(s)`}
          />
          <SummaryMetric
            label="Pontos Realizados"
            value={data.pontosRealizados.toLocaleString("pt-BR")}
            sub="Execução acumulada do painel"
            state="A"
          />
          <SummaryMetric
            label="Atendimento Geral"
            value={`${data.atendimentoGeral.toFixed(0)}%`}
            sub="Percentual consolidado do PPR"
            state={attendanceState}
          />
          <SummaryMetric
            label="Status de Referência"
            value={formatDate(data.referenceDate)}
            sub="Última publicação considerada"
          />
        </div>

        <div className="subtitle-block" style={{ margin: "18px 0 8px" }}>
          <h3 style={{ color: BLUE }}>Resumo Executivo</h3>
        </div>

        <div className="card">
          <div className="ct">Resultado geral do PPR Obras</div>
          <p className="ps" style={{ margin: "-6px 0 12px" }}>
            Leitura consolidada dos indicadores e pesos mensais. Dados administrativos não publicados não entram neste quadro.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="dt" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th>Entrega</th>
                  <th>Meta</th>
                  <th>Peso</th>
                  {data.monthLabels.map((label) => (
                    <th key={label} style={{ textAlign: "center" }}>{label}</th>
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
                    <td><ResultBadge pass={indicator.partialPass} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="g2">
          <div className="card">
            <div className="ct">Legenda · Indicadores gerais</div>

            <p className="ps" style={{ margin: "-6px 0 10px" }}>
              Faixas de leitura do atendimento consolidado.
            </p>

            <LegendRow
              dot={<Dot state="G" />}
              title="≥ 95%"
              subtitle="Valor atendido"
            />

            <LegendRow
              dot={<Dot state="A" />}
              title="70% a 94,99%"
              subtitle="Atenção"
            />

            <LegendRow
              dot={<Dot state="R" />}
              title="< 70%"
              subtitle="Fora da meta"
            />
          </div>

          <div className="card">
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

        <div className="card">
          <div className="ct">Desempenho mensal (% da meta atingida)</div>

          <div className="cw" style={{ height: 340, minWidth: 0 }}>
            {data.monthLabels.length ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                debounce={100}
              >
                <BarChart
                  data={chartData}
                  margin={{ top: 12, right: 20, bottom: 8, left: -4 }}
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

                  <Tooltip
                    formatter={(value: unknown) => [
                      value === null ? "—" : `${Number(value).toFixed(1)}%`,
                      "% da meta",
                    ]}
                    contentStyle={{
                      fontFamily: "Montserrat",
                      fontSize: 11,
                      borderRadius: 8,
                    }}
                  />

                  <Legend
                    wrapperStyle={{
                      fontFamily: "Montserrat",
                      fontSize: 10,
                    }}
                  />

                  {data.monthLabels.map((label, index) => (
                    <Bar
                      key={label}
                      dataKey={`month_${index}`}
                      name={label}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                      radius={[2, 2, 0, 0]}
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
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
      {dot}
      <div>
  <strong>{title}</strong>

  {subtitle ? (
    <>
      <br />
      <span style={{ color: "#999", fontSize: 11 }}>
        {subtitle}
      </span>
    </>
  ) : null}
</div>
    </div>
  );
}