"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PublishedPanelPlaceholder } from "@/components/layout/PublishedPanelPlaceholder";
import { StatusBadge } from "@/components/indicators/StatusBadge";
import type {
  GeneralPanelData,
  GeneralPanelIndicator,
  GeneralPanelMonthCell,
} from "@/features/scorecard/publications";
import { SCORECARD_MAX_POINTS, SCORECARD_MONTHLY_POOL } from "@/features/scorecard/types";

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

/** Média/Parcial do indicador. RNC sem casas decimais: "15 dias", não "15,0 dias". */
function formatValue(indicator: Pick<GeneralPanelIndicator, "unit">, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (indicator.unit === "dias") return `${Math.round(value)} dias`;
  if (indicator.unit === "%") return `${value.toFixed(1)}%`;
  return value.toFixed(1);
}

/** Valor de uma célula mensal, sem a unidade — repetir "dias" em toda célula do RNC é redundante. */
function formatMonthValue(
  indicator: Pick<GeneralPanelIndicator, "unit">,
  value: number | null,
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (indicator.unit === "%") return `${value.toFixed(1)}%`;
  return value.toFixed(1);
}

function formatMeta(indicator: GeneralPanelIndicator): string {
  const operator = indicator.direction === "lower" ? "≤" : "≥";
  return `${operator}${indicator.meta}${unitSuffix(indicator)}`;
}

/** Pontos de um mês: peso cheio se bateu a meta, zero se não bateu ou sem dado — mesma regra do Scorecard. */
function monthPoints(
  indicator: Pick<GeneralPanelIndicator, "peso">,
  month: GeneralPanelMonthCell,
): number {
  return month.pass ? (indicator.peso / 100) * SCORECARD_MONTHLY_POOL : 0;
}

function indicatorPoints(indicator: GeneralPanelIndicator): number {
  return indicator.months.reduce((sum, month) => sum + monthPoints(indicator, month), 0);
}

function indicatorMaxPoints(indicator: Pick<GeneralPanelIndicator, "peso">): number {
  return (indicator.peso / 100) * SCORECARD_MAX_POINTS;
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

  const monthlyPointTotals = useMemo(() => {
    if (!data) return [];
    return data.monthKeys.map((key) =>
      data.indicators.reduce((sum, indicator) => {
        const month = indicator.months.find((item) => item.key === key);
        return sum + (month ? monthPoints(indicator, month) : 0);
      }, 0),
    );
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
            <div className="cs">
              Leitura consolidada dos indicadores e pesos mensais. Dados administrativos não
              publicados não entram neste quadro.
            </div>
            <div className="general-scorecard-scroll rounded-[18px] border border-neutralbrand/20">
              <table className="general-scorecard-table">
                <colgroup>
                  <col className="general-scorecard-col-indicator" />
                  <col className="general-scorecard-col-weight" />
                  <col className="general-scorecard-col-target" />
                  {data.monthLabels.map((label) => (
                    <col key={label} className="general-scorecard-col-month" />
                  ))}
                  <col className="general-scorecard-col-average" />
                  <col className="general-scorecard-col-points" />
                  <col className="general-scorecard-col-status" />
                </colgroup>
                <thead className="bg-[#EEF1F6] text-left text-[11px] font-medium uppercase tracking-wide text-brand-dark">
                  <tr>
                    <th className="px-3 py-3">Indicador</th>
                    <th className="px-3 py-3 text-right">Peso</th>
                    <th className="px-3 py-3 text-right">Meta</th>
                    {data.monthLabels.map((label) => (
                      <th key={label} className="px-3 py-3 text-center">
                        {label}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-right">Média</th>
                    <th className="px-3 py-3 text-right">Pontos</th>
                    <th className="px-3 py-3 text-center">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.indicators.map((indicator) => (
                    <tr
                      key={indicator.key}
                      className="general-scorecard-row border-t border-neutralbrand/15 hover:bg-canvas/60"
                    >
                      <td className="general-scorecard-label text-brand-dark">{indicator.label}</td>
                      <td className="px-3 py-3 text-right font-normal text-brand-dark">
                        {indicator.peso.toFixed(2)}%
                      </td>
                      <td className="px-3 py-3 text-right font-normal">{formatMeta(indicator)}</td>
                      {indicator.months.map((month) => (
                        <td key={month.key} className="general-scorecard-month-cell text-center">
                          <span
                            className={`general-scorecard-month inline-flex items-center justify-center rounded-lg border text-xs font-medium ${
                              month.value === null
                                ? "border-neutralbrand/20 bg-neutralbrand/5 text-neutralbrand"
                                : month.pass
                                  ? "border-green-200 bg-green-50 text-green-700"
                                  : "border-red-200 bg-red-50 text-red-700"
                            }`}
                            title={`${indicator.label} — ${month.label}`}
                          >
                            {formatMonthValue(indicator, month.value)}
                          </span>
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right font-normal">
                        {formatValue(indicator, indicator.partial)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="font-extrabold text-brand-dark">
                          {formatPoints(indicatorPoints(indicator))}
                        </div>
                        <div className="text-[10px] text-neutralbrand">
                          de {formatPoints(indicatorMaxPoints(indicator))}
                        </div>
                      </td>
                      <td className="general-scorecard-status px-3 py-3 text-center">
                        {indicator.partialPass === null ? (
                          <span className="text-xs font-normal text-neutralbrand">Sem dados</span>
                        ) : (
                          <StatusBadge ok={indicator.partialPass} className="w-28 text-center">
                            {indicator.partialPass ? "Dentro da meta" : "Fora da meta"}
                          </StatusBadge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-brand/20 bg-canvas font-extrabold text-brand-dark">
                  <tr>
                    <td className="px-3 py-3" colSpan={3}>
                      Pontuação mensal
                    </td>
                    {data.monthKeys.map((key, index) => (
                      <td key={key} className="px-3 py-3 text-center tabular-nums">
                        {formatPoints(monthlyPointTotals[index] ?? 0)}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right">—</td>
                    <td className="px-3 py-3 text-right text-accent">
                      {data.pontosRealizados.toLocaleString("pt-BR")}
                    </td>
                    <td className="px-3 py-3">{Math.round(data.atendimentoGeral)}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="g2 indicator-subgrid">
            <div className="indicator-subcard">
              <div className="ct">Legenda · Indicadores gerais</div>

              <div className="cs">Faixas de leitura do atendimento consolidado.</div>

              <LegendRow dot={<Dot state="G" />} title="≥ 95%" subtitle="Valor atendido" />

              <LegendRow dot={<Dot state="A" />} title="70% a 94,99%" subtitle="Atenção" />

              <LegendRow dot={<Dot state="R" />} title="< 70%" subtitle="Fora da meta" />
            </div>

            <div className="indicator-subcard">
              <div className="ct">Legenda · Indicadores setoriais</div>

              <div className="cs">Faixas de leitura para os indicadores setoriais (por unidade).</div>

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
        {subtitle ? <span className="legend-row-subtitle">{subtitle}</span> : null}
      </div>
    </div>
  );
}
