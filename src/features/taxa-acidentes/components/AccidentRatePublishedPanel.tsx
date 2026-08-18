"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, FileDown, Flag, HeartPulse, type LucideIcon } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ReadingContextCard } from "@/components/layout/ReadingContextCard";
import {
  periodQueryString,
  useReadingContextCycle,
} from "@/components/layout/useReadingContextCycle";
import { ToolbarSlotContent } from "@/components/layout/ToolbarSlot";
import { usePanelPdfExport } from "@/lib/exports/panel-screenshot-pdf";
import type { AccidentRatePublishedPayload } from "@/features/taxa-acidentes/publications";
import { formatPeriodRangeLabel, type PeriodRange } from "@/lib/period";
import {
  compareAccidentUnits,
  formatAccidentUnitLabel,
} from "@/features/taxa-acidentes/utils/units";

interface PublicationResponse {
  historyCount?: number;
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
const DARK_GRAY = "#374151";

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
  const { year, semester, cycle, isCurrent, setPeriod } = useReadingContextCycle();
  const cycleRef = useRef(cycle);
  cycleRef.current = cycle;
  const requestIdRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const { exporting, error: exportError, exportPdf } = usePanelPdfExport(panelRef);

  const handleExportPdf = useCallback(
    () => exportPdf(`TaxaAcidentes_painel_${new Date().toISOString().slice(0, 10)}.pdf`),
    [exportPdf],
  );

  const load = useCallback(async (period: PeriodRange) => {
    const requestId = ++requestIdRef.current;
    setResponse(null);
    setError(null);
    try {
      const request = await fetch(`/api/publicacoes/taxa-acidentes?${periodQueryString(period)}`, {
        cache: "no-store",
      });

      if (!request.ok) {
        throw new Error("Falha ao carregar a publicação.");
      }

      const body = (await request.json()) as PublicationResponse;
      if (requestId !== requestIdRef.current) return;
      setResponse(body);
      setError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Falha ao carregar o painel.");
    }
  }, []);

  useEffect(() => {
    void load(cycle);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, cycle.startYear, cycle.startMonth, cycle.endYear, cycle.endMonth]);

  useEffect(() => {
    const refresh = () => void load(cycleRef.current);
    window.addEventListener("taxa-acidentes:published", refresh);
    window.addEventListener("indicator:published", refresh);
    return () => {
      window.removeEventListener("taxa-acidentes:published", refresh);
      window.removeEventListener("indicator:published", refresh);
    };
  }, [load]);

  const readingContext = (
    <ReadingContextCard
      activeHref="/dashboard/taxa-acidentes"
      historyCount={response?.historyCount ?? 0}
      year={year}
      semester={semester}
      onPeriodChange={setPeriod}
      isCurrent={isCurrent}
    />
  );

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
        className="flex h-[42px] items-center gap-1.5 rounded-[12px] border border-border bg-background px-3.5 text-[15px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:cursor-wait disabled:opacity-60"
      >
        <FileDown className="size-4" />
        {exporting ? "Gerando PDF…" : "Exportar PDF"}
      </button>
    </ToolbarSlotContent>
  );

  if (error) {
    return (
      <div className="painel-frontend">
        {exportButton}
        <div className="content" style={{ padding: "14px 0 0" }}>
          <div className="reading-context-row">{readingContext}</div>
          <div className="error-box">{error}</div>
        </div>
      </div>
    );
  }

  if (!response?.publication) {
    return (
      <div className="painel-frontend">
        {exportButton}
        <div className="content" style={{ padding: "14px 0 0" }}>
          <div className="reading-context-row">{readingContext}</div>
          <div className="empty">
            <h2 className="ph">
              {response ? "Nenhuma publicação neste período" : "Carregando painel publicado…"}
            </h2>
            {response ? (
              <p className="ps">
                Selecione outro período ou publique os dados deste ciclo na Administração.
              </p>
            ) : null}
          </div>
        </div>
      </div>
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
        <div className="reading-context-row">{readingContext}</div>
        <div className="mgrid">
          <PanelMetric
            label="Taxa Semestral"
            value={decimal(result)}
            meta={`Meta ≤ ${decimal(data.meta)}`}
            tone={resultOk ? "G" : "R"}
            ok={resultOk}
            icon={HeartPulse}
          />

          <PanelMetric
            label="Meta frequência"
            value={decimal(data.metaFrequencia)}
            meta="Meta da frequência"
            tone="G"
            icon={Flag}
          />

          <PanelMetric
            label="Acidentes CAF"
            value={String(data.acidentesCaf)}
            meta="Total mensal do período"
            tone="A"
            icon={AlertTriangle}
          />

          <PanelMetric
            label="Desempenho mês"
            value={decimal(data.desempenhoMes)}
            meta="Leitura mais recente"
            tone={latestOk ? "G" : "R"}
            ok={latestOk}
            icon={Activity}
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
              <div className="cs">Comparativo da taxa de frequência com a meta em cada mês.</div>

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
              <div className="ct">Acidentes mensais (CAF)</div>
              <div className="cs">Quantidade de acidentes CAF registrados por mês.</div>

              <div className="cw" style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.mensal}
                    margin={{
                      top: 18,
                      right: 8,
                      bottom: 0,
                      left: 0,
                    }}
                    barCategoryGap="28%"
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
                      type="number"
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      width={28}
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
                        color: DARK_GRAY,
                        fontWeight: 600,
                      }}
                    />

                    <Bar
                      dataKey="caf"
                      name="Acidentes CAF"
                      fill={DARK_GRAY}
                      radius={[8, 8, 0, 0]}
                      maxBarSize={34}
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
                  </BarChart>
                </ResponsiveContainer>
              </div>
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
                <div className="cs">Comparativo visual de acidentes por unidade.</div>
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

            <div style={{ marginTop: 4 }}>
              {unitChartData.length > 0 ? (
                <UnitAccidentBars data={unitChartData} />
              ) : (
                <p className="ps" style={{ margin: 0, textAlign: "center" }}>
                  Nenhuma unidade foi publicada para esta competência.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Leitura visual pura de CAF/SAF por unidade — sem meta, sem status, sem
 * comparação com a taxa de acidentes. A largura de cada barra é só relativa
 * ao maior valor do conjunto exibido (não a uma escala fixa), recalculada
 * sempre que o período filtrado muda.
 */
function UnitAccidentBars({
  data,
}: {
  data: Array<{ unidade: string; caf: number; saf: number }>;
}) {
  const maxValue = data.reduce((max, item) => Math.max(max, item.caf, item.saf), 0);

  function widthPercent(value: number): number {
    if (maxValue <= 0) return 0;
    return Math.min(100, Math.max(0, (value / maxValue) * 100));
  }

  return (
    <div>
      {data.map((item, index) => (
        <div
          key={item.unidade}
          style={
            index < data.length - 1
              ? { marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #eef1f6" }
              : undefined
          }
        >
          <div
            style={{
              fontFamily: "Montserrat",
              fontSize: 13,
              fontWeight: 600,
              color: "#20324a",
              marginBottom: 4,
            }}
          >
            {item.unidade}
          </div>

          <div className="urow" style={{ marginBottom: 5 }}>
            <div className="uname" style={{ width: 40, color: GOLD }}>
              CAF
            </div>
            <div className="utrack" style={{ height: 8 }}>
              <div
                className="ufill"
                style={{ width: `${widthPercent(item.caf)}%`, background: GOLD }}
              />
            </div>
            <div className="uval" style={{ color: GOLD }}>
              {item.caf}
            </div>
          </div>

          <div className="urow" style={{ marginBottom: 0 }}>
            <div className="uname" style={{ width: 40, color: BLUE }}>
              SAF
            </div>
            <div className="utrack" style={{ height: 8 }}>
              <div
                className="ufill"
                style={{ width: `${widthPercent(item.saf)}%`, background: BLUE }}
              />
            </div>
            <div className="uval" style={{ color: BLUE }}>
              {item.saf}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PanelMetric({
  label,
  value,
  meta,
  tone,
  ok,
  icon: Icon,
}: {
  label: string;
  value: string;
  meta: string;
  tone: "G" | "A" | "R";
  ok?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <div className={`mc ${tone}`}>
      <div className="mc-head">
        <div className="ml">{label}</div>
        {Icon ? (
          <div className="mc-icon">
            <Icon />
          </div>
        ) : null}
      </div>
      <div className={`mv ${tone}`}>{value}</div>
      <div className="mm">{meta}</div>

      {ok !== undefined ? (
        <div className={`ms ${ok ? "ok" : "no"}`}>{ok ? "✓ Atingida" : "✗ Fora da meta"}</div>
      ) : null}
    </div>
  );
}
