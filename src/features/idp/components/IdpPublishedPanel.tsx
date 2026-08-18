"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, FileDown, TrendingUp, Wrench, Zap, type LucideIcon } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import type { IdpPublishedPayload } from "@/features/idp/publications";
import { MONTH_NAMES_FULL } from "@/lib/dates";
import { formatIdpUnitLabel } from "@/features/idp/utils/units";
import type { PeriodRange } from "@/lib/period";

interface PublicationResponse {
  historyCount?: number;
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

function disciplineValue(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${Math.round(value)}%`;
}

function competenceLabel(year: number, month: number): string {
  return `${MONTH_NAMES_FULL[month - 1] ?? month}/${year}`;
}

export function IdpPublishedPanel() {
  const [data, setData] = useState<PublicationResponse["publication"]>(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { year, semester, cycle, isCurrent, setPeriod } = useReadingContextCycle();
  const cycleRef = useRef(cycle);
  cycleRef.current = cycle;
  const requestIdRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const { exporting, error: exportError, exportPdf } = usePanelPdfExport(panelRef);

  const handleExportPdf = useCallback(
    () => exportPdf(`IDP_painel_${new Date().toISOString().slice(0, 10)}.pdf`),
    [exportPdf],
  );

  const load = useCallback(async (period: PeriodRange) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const response = await fetch(`/api/publicacoes/idp?${periodQueryString(period)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Falha ao carregar o painel publicado.");
      const body = (await response.json()) as PublicationResponse;
      if (requestId !== requestIdRef.current) return;
      setData(body.publication);
      setHistoryCount(body.historyCount ?? 0);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Falha ao carregar o painel.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(cycle);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, cycle.startYear, cycle.startMonth, cycle.endYear, cycle.endMonth]);

  useEffect(() => {
    const refresh = () => void load(cycleRef.current);
    window.addEventListener("idp:published", refresh);
    return () => window.removeEventListener("idp:published", refresh);
  }, [load]);

  const readingContext = (
    <ReadingContextCard
      activeHref="/dashboard/idp"
      historyCount={historyCount}
      year={year}
      semester={semester}
      onPeriodChange={setPeriod}
      isCurrent={isCurrent}
    />
  );

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

  if (loading && !data) {
    return (
      <div className="painel-frontend">
        {exportButton}
        <div className="content">
          <div className="reading-context-row">{readingContext}</div>
          <div className="empty">
            <p className="ps">Carregando painel publicado…</p>
          </div>
        </div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="painel-frontend">
        {exportButton}
        <div className="content">
          <div className="reading-context-row">{readingContext}</div>
          <div className="empty">
            <h2 className="ph">Não foi possível carregar o painel</h2>
            <p className="ps">{error}</p>
          </div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="painel-frontend">
        {exportButton}
        <div className="content">
          <div className="reading-context-row">{readingContext}</div>
          <div className="empty">
            <h2 className="ph">Nenhuma publicação neste período</h2>
            <p className="ps">
              Selecione outro período ou publique os dados deste ciclo na Administração.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const d = data.payload;
  const result = Math.round(d.resultado);
  const resultOk = result >= d.meta;
  const selectedMonth = d.selectedMonth ?? d.monthEnd ?? 12;
  const selectedYear = d.selectedYear ?? new Date(data.publishedAt).getFullYear();
  const chartData = (d.disciplinas ?? [])
    .filter((item) => item.v !== null)
    .map((item) => ({ name: item.n.replace(/^\d+\s*-\s*/, ""), aderencia: item.v }));

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
            label="Execução geral"
            value={`${result}%`}
            meta={`Meta >${d.meta}%`}
            tone={resultOk ? "G" : "R"}
            ok={resultOk}
            icon={TrendingUp}
          />
          <PanelMetric
            label="Civil"
            value={disciplineValue(d.civil)}
            meta="Por disciplina"
            tone={(d.civil ?? 0) >= d.meta ? "G" : "A"}
            ok={d.civil !== null && d.civil !== undefined && d.civil >= d.meta}
            icon={Building2}
          />
          <PanelMetric
            label="Mecânica"
            value={disciplineValue(d.mecanica)}
            meta="Por disciplina"
            tone={(d.mecanica ?? 0) >= d.meta ? "G" : "A"}
            ok={d.mecanica !== null && d.mecanica !== undefined && d.mecanica >= d.meta}
            icon={Wrench}
          />
          <PanelMetric
            label="Elétrica"
            value={disciplineValue(d.eletrica ?? d.eia)}
            meta="Por disciplina"
            tone={(d.eletrica ?? d.eia ?? 0) >= d.meta ? "G" : "A"}
            ok={(d.eletrica ?? d.eia ?? 0) >= d.meta}
            icon={Zap}
          />
        </div>

        {/* Container do indicador: agrupa os gráficos e a leitura por unidade
            que pertencem a este mesmo indicador — mesma hierarquia usada no
            painel do RDO. */}
        <div className="card indicator-card">
          <div className="ph">Aderência do Cronograma — Avanço Físico (RSO)</div>
          <div className="ps rdo-panel-summary">
            <span className="rdo-panel-target">META: &gt;{d.meta}%</span>
            <span>
              Resultado:{" "}
              <strong style={{ color: resultOk ? GREEN : RED, fontSize: 14 }}>{result}%</strong>
            </span>
            <span style={{ color: "#bbb" }}>
              — competência {competenceLabel(selectedYear, selectedMonth)} ·{" "}
              {d.documentosAtivos ?? d.unidades.length} RSO(s) ativo(s) · publicado em{" "}
              {formatPublishedAt(data.publishedAt)} por {data.publishedBy.name} · versão{" "}
              {data.version}
            </span>
          </div>

          <div className="g2 indicator-subgrid">
            <div className="indicator-subcard">
              <div className="ct">Aderência mensal (%)</div>
              <div className="cs">Comparativo do percentual executado com a meta em cada mês.</div>
              <div className="cw" style={{ height: 160 }}>
                {d.mensal?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={d.mensal} margin={{ top: 8, right: 12, bottom: 2, left: -16 }}>
                      <CartesianGrid stroke="#f4f4f4" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontFamily: "Montserrat", fontSize: 10 }} />
                      <YAxis
                        tick={{ fontFamily: "Montserrat", fontSize: 10 }}
                        tickFormatter={(value) => `${value}%`}
                      />
                      <Tooltip
                        formatter={(value) => [
                          value === null ? "Sem dados" : `${value}%`,
                          "Aderência",
                        ]}
                      />
                      <ReferenceLine y={d.meta} stroke={RED} strokeDasharray="5 4" />
                      <Line
                        connectNulls={false}
                        type="monotone"
                        dataKey="v"
                        stroke={BLUE}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="ps">Sem dados mensais publicados.</p>
                )}
              </div>
            </div>

            {chartData.length ? (
              <div className="indicator-subcard">
                <div className="ct">Aderência por disciplina (%)</div>
                <div className="cs">Comparativo do percentual executado por disciplina.</div>
                <div className="cw" style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 8, right: 12, bottom: 36, left: -10 }}
                    >
                      <CartesianGrid stroke="#f4f4f4" vertical={false} />
                      <XAxis
                        dataKey="name"
                        interval={0}
                        angle={-18}
                        textAnchor="end"
                        height={56}
                        tick={{ fontSize: 9 }}
                      />
                      <YAxis tickFormatter={(value) => `${value}%`} tick={{ fontSize: 9 }} />
                      <Tooltip formatter={(value) => [`${value}%`, "Aderência"]} />
                      <ReferenceLine y={d.meta} stroke={RED} strokeDasharray="5 4" />
                      <Bar dataKey="aderencia" fill={BLUE} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}
          </div>

          <div className="indicator-subcard">
            <div className="ct">Execução por unidade — RSO utilizado</div>
            <div className="cs">Leitura visual de desempenho por unidade.</div>
            {d.unidades.length ? (
              d.unidades.map((unit) => {
                const ok = unit.v >= d.meta;
                return (
                  <div className="urow" key={`${unit.n}-${unit.rsoNumero ?? "rso"}`}>
                    <div className="uname">
                      {formatIdpUnitLabel(unit.n)}
                      {unit.rsoNumero ? (
                        <span className="uname-rso">RSO {unit.rsoNumero}</span>
                      ) : null}
                    </div>
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
                      {Math.round(unit.v)}%
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
  icon: Icon,
}: {
  label: string;
  value: string;
  meta: string;
  tone: "G" | "A" | "R";
  ok: boolean;
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
      <div className={`ms ${ok ? "ok" : "no"}`}>{ok ? "✓ Atingida" : "✗ Abaixo"}</div>
    </div>
  );
}
