"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileDown } from "lucide-react";
import {
  CartesianGrid,
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
import { ToolbarSlotContent } from "@/components/layout/ToolbarSlot";
import { usePanelPdfExport } from "@/lib/exports/panel-screenshot-pdf";
import type { FiveSPublishedPayload } from "@/features/cinco-s/publications";
import { formatFiveSUnitLabel } from "@/features/cinco-s/utils/units";

interface PublicationResponse {
  publication: null | {
    id: string;
    version: number;
    target: number | null;
    result: number | null;
    status: string | null;
    payload: FiveSPublishedPayload;
    publishedAt: string;
    publishedBy: {
      id: string;
      name: string;
      email: string;
    };
  };
}

const BLUE = "#304F7E";
const GREEN = "#609346";
const GOLD = "#EAA239";
const RED = "#CC5121";

function formatNumber(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

function formatPublishedAt(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

export function FiveSPublishedPanel() {
  const [publication, setPublication] = useState<PublicationResponse["publication"]>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { exporting, error: exportError, exportPdf } = usePanelPdfExport(panelRef);

  const handleExportPdf = useCallback(
    () => exportPdf(`5S_painel_${new Date().toISOString().slice(0, 10)}.pdf`),
    [exportPdf],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/publicacoes/cinco-s", {
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

    window.addEventListener("cinco-s:published", refresh);

    return () => {
      window.removeEventListener("cinco-s:published", refresh);
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
  const resultOk = result >= data.meta;

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
        {/* Apenas o card de resultado semestral */}
        <div
          className="mgrid"
          style={{
            gridTemplateColumns: "minmax(0, 1fr)",
            width: "100%",
          }}
        >
          <PanelMetric
            label="Resultado semestral"
            value={formatNumber(result)}
            meta={`Meta ≥${data.meta} pts`}
            tone={resultOk ? "G" : "R"}
            ok={resultOk}
          />
        </div>

        {/* Container do indicador: agrupa os gráficos e a leitura por unidade
            que pertencem a este mesmo indicador — mesma hierarquia usada nos
            painéis do RDO, IDP e RNC. */}
        <div className="card indicator-card">
          <div className="ph">5S</div>
          <div className="ps rdo-panel-summary">
            <span className="rdo-panel-target">META: ≥{data.meta} pts</span>
            <span>
              Resultado:{" "}
              <strong style={{ color: resultOk ? GREEN : RED, fontSize: 14 }}>
                {formatNumber(result)}
              </strong>
            </span>
            <span style={{ color: "#bbb" }}>
              — publicado em {formatPublishedAt(publication.publishedAt)} por{" "}
              {publication.publishedBy.name}
            </span>
          </div>

          <div className="g2 indicator-subgrid">
            <div className="indicator-subcard">
              <div className="ct">Pontuação por mês</div>
              <div className="cw" style={{ height: 160 }}>
                {data.mensal.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={data.mensal}
                      margin={{
                        top: 8,
                        right: 16,
                        bottom: 6,
                        left: 0,
                      }}
                    >
                      <CartesianGrid stroke="#F1F1F1" vertical={false} />

                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        tick={{
                          fontFamily: "Montserrat",
                          fontSize: 9,
                          fill: "#7F8793",
                        }}
                      />

                      <YAxis
                        domain={[0, 120]}
                        allowDecimals
                        tickLine={false}
                        tick={{
                          fontFamily: "Montserrat",
                          fontSize: 9,
                          fill: "#7F8793",
                        }}
                        tickFormatter={(value) => Number(value).toFixed(1).replace(".", ",")}
                      />

                      <Tooltip
                        formatter={(value) => [
                          `${formatNumber(Number(value))} pts`,
                          "Pontuação 5S",
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
                          value: `Meta (${data.meta} pts)`,
                          position: "insideTopRight",
                          fill: GOLD,
                          fontSize: 9,
                        }}
                      />

                      <Line
                        type="monotone"
                        dataKey="v"
                        name="Pontuação 5S"
                        stroke={BLUE}
                        strokeWidth={2}
                        dot={{
                          r: 4,
                          fill: BLUE,
                          stroke: BLUE,
                        }}
                        activeDot={{
                          r: 5,
                        }}
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="ps">Nenhum resultado mensal foi publicado.</p>
                )}
              </div>
            </div>

            <div className="indicator-subcard">
              <div className="ct">Resultado por unidade</div>

              {data.unidades.length ? (
                data.unidades.map((unit) => {
                  const unitOk = unit.v >= data.meta;
                  const normalizedValue = Math.min(100, Math.max(0, unit.v));

                  return (
                    <div className="urow" key={unit.n}>
                      <div className="uname">{formatFiveSUnitLabel(unit.n)}</div>

                      <div className="utrack">
                        <div
                          className="ufill"
                          style={{
                            width: `${normalizedValue}%`,
                            background: unitOk ? GREEN : RED,
                          }}
                        />
                      </div>

                      <div
                        className="uval"
                        style={{
                          color: unitOk ? GREEN : RED,
                        }}
                      >
                        {Math.round(unit.v)}%
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="ps">Nenhuma unidade elegível foi publicada.</p>
              )}
            </div>
          </div>

          {data.excludedUnits.length ? (
            <div className="indicator-subcard">
              <div className="ct">Unidades excluídas do consolidado</div>
              <p className="ps">{data.excludedUnits.map(formatFiveSUnitLabel).join(", ")}</p>
            </div>
          ) : null}
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
        <div className={`ms ${success ? "ok" : "no"}`}>
          {success ? "✓ Atingida" : "✗ Fora da meta"}
        </div>
      ) : null}
    </div>
  );
}
