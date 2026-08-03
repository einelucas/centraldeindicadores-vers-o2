"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { chunk, DEFAULT_IMPORT_BATCH_SIZE } from "@/lib/batching";
import { fmtPct } from "@/lib/currency";
import { importRncFiles } from "@/features/rnc/importers";
import { exportRncPdf } from "@/features/rnc/exports/pdf";
import {
  RNC_DEFAULT_MAX_DIAS,
  type RncNormalizedRecord,
  type RncResult,
} from "@/features/rnc/types";

interface ApiResponse {
  total: number;
  metaDias: number;
  result: RncResult;
  lastImport: null | {
    id: string;
    fileName: string;
    completedAt: string | null;
    totalFound: number;
    totalInserted: number;
    totalUpdated: number;
    totalIgnored: number;
    totalRejected: number;
  };
}

interface PublicationSummary {
  publishedAt: string;
  publishedBy: { name: string };
  version: number;
}

interface PreparedImport {
  fileNames: string[];
  records: RncNormalizedRecord[];
  duplicates: number;
  perFile: Array<{
    fileName: string;
    count: number;
    error: string | null;
  }>;
}

interface Progress {
  totalFound: number;
  currentBatch: number;
  totalBatches: number;
  inserted: number;
  ignored: number;
  updated: number;
  rejected: number;
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? fallback);
}

function monthKey(year: number, monthZeroBased: number): string {
  return `${year}-${String(monthZeroBased + 1).padStart(2, "0")}`;
}

function formatDays(value: number | null): string {
  return value === null ? "—" : value.toFixed(1).replace(".", ",");
}

export function RncView({
  canPublish,
  canClear,
}: {
  canPublish: boolean;
  canClear: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [metaDias, setMetaDias] = useState(RNC_DEFAULT_MAX_DIAS);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [prepared, setPrepared] = useState<PreparedImport | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [publication, setPublication] =
    useState<PublicationSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (meta = metaDias) => {
    setError(null);
    const response = await fetch(`/api/rnc?meta=${encodeURIComponent(meta)}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw await responseError(response, "Falha ao carregar os dados do RNC.");
    }
    const body = (await response.json()) as ApiResponse;
    setData(body);
    setMetaDias(body.metaDias);
    setSelectedMonth((current) => {
      const keys = body.result.months.map((month) =>
        monthKey(month.year, month.month),
      );
      return keys.includes(current) ? current : keys.at(-1) ?? "";
    });
  }, [metaDias]);

  async function loadPublication() {
    const response = await fetch("/api/publicacoes/rnc", { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as {
      publication: PublicationSummary | null;
    };
    setPublication(body.publication);
  }

  useEffect(() => {
    void Promise.all([
      load().catch((err: Error) => setError(err.message)),
      loadPublication(),
    ]);
    // A primeira leitura usa a meta padrão real do módulo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function prepareFiles(files: FileList | File[]) {
    const selected = Array.from(files);
    if (!selected.length) return;

    setBusy(true);
    setError(null);
    setMessage(null);
    setProgress(null);
    try {
      const parsed = await importRncFiles(selected);
      setPrepared({
        fileNames: selected.map((file) => file.name),
        records: parsed.records,
        duplicates: parsed.duplicates,
        perFile: parsed.perFile.map((file) => ({
          fileName: file.fileName,
          count: file.count,
          error: file.error,
        })),
      });
      if (parsed.records.length) {
        setMessage(
          "Arquivos lidos e validados. Clique em “Importar arquivos” para gravar os registros no Neon.",
        );
      } else {
        setError("Nenhum registro válido foi encontrado nos arquivos selecionados.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ler os arquivos.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function importPrepared() {
    if (!prepared?.records.length) {
      setError("Nenhum registro válido foi preparado para importação.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    const batches = chunk(prepared.records, DEFAULT_IMPORT_BATCH_SIZE);
    setProgress({
      totalFound: prepared.records.length,
      currentBatch: 0,
      totalBatches: batches.length,
      inserted: 0,
      ignored: 0,
      updated: 0,
      rejected: 0,
    });

    try {
      const start = await fetch("/api/importacoes/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: "rnc",
          fileName: prepared.fileNames.join(", "),
          totalFound: prepared.records.length,
        }),
      });
      if (!start.ok) {
        throw await responseError(start, "Falha ao iniciar a importação.");
      }
      const { importJobId } = (await start.json()) as { importJobId: string };

      let totals = { inserted: 0, ignored: 0, updated: 0, rejected: 0 };
      for (let index = 0; index < batches.length; index++) {
        const records = (batches[index] ?? []).map(
          (record: RncNormalizedRecord) => ({
            statusRnc: record.statusRnc,
            unidade: record.unidade,
            dataCriacao: record.dataCriacao.toISOString(),
            dataSolucao: record.dataSolucao
              ? record.dataSolucao.toISOString()
              : null,
            tempoTratativa: record.tempoTratativa,
            ofensor: record.ofensor,
            year: record.year,
            month: record.month,
            raw: record.raw,
          }),
        );
        const response = await fetch(
          `/api/importacoes/${importJobId}/lotes`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ batchNumber: index + 1, records }),
          },
        );
        if (!response.ok) {
          throw await responseError(
            response,
            `Falha ao processar o lote ${index + 1}.`,
          );
        }
        const current = (await response.json()) as typeof totals;
        totals = {
          inserted: totals.inserted + current.inserted,
          ignored: totals.ignored + current.ignored,
          updated: totals.updated + current.updated,
          rejected: totals.rejected + current.rejected,
        };
        setProgress({
          totalFound: prepared.records.length,
          currentBatch: index + 1,
          totalBatches: batches.length,
          ...totals,
        });
      }

      const finish = await fetch(`/api/importacoes/${importJobId}/finalizar`, {
        method: "POST",
      });
      if (!finish.ok) {
        throw await responseError(finish, "Falha ao finalizar a importação.");
      }

      setMessage(
        `Importação concluída: ${totals.inserted} inserido(s), ${totals.updated} atualizado(s), ${totals.ignored} ignorado(s) e ${totals.rejected} rejeitado(s).`,
      );
      setPrepared(null);
      await load(metaDias);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na importação.");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/publicacoes/rnc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metaDias }),
      });
      if (!response.ok) {
        throw await responseError(response, "Falha ao publicar o RNC.");
      }
      const body = (await response.json()) as {
        publication: PublicationSummary;
      };
      setPublication(body.publication);
      setMessage("RNC publicado no painel com sucesso.");
      window.dispatchEvent(new Event("rnc:published"));
      window.dispatchEvent(new Event("indicator:published"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao publicar o RNC.");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (
      !window.confirm(
        "Excluir todos os registros administrativos do RNC? O painel publicado continuará preservado.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/rnc/registros", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) {
        throw await responseError(response, "Falha ao limpar os registros do RNC.");
      }
      const body = (await response.json()) as { deleted: number };
      setMessage(`${body.deleted} registro(s) removido(s).`);
      setPrepared(null);
      setProgress(null);
      await load(metaDias);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao limpar o RNC.");
    } finally {
      setBusy(false);
    }
  }

  const result = data?.result ?? null;
  const selected =
    result?.months.find(
      (month) => monthKey(month.year, month.month) === selectedMonth,
    ) ?? null;
  const selectedAdherence =
    selected && selected.chamados
      ? selected.solucionados / selected.chamados
      : null;
  const progressPct = progress?.totalBatches
    ? Math.round((progress.currentBatch / progress.totalBatches) * 100)
    : 0;

  return (
    <>
      <div
        className={`upload-zone${dragging ? " drag" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void prepareFiles(event.dataTransfer.files);
        }}
      >
        <div className="icon">↑</div>
        <h4>Arraste os arquivos de RNC aqui, ou clique para escolher</h4>
        <p>
          Pode selecionar vários meses. O leitor procura Status RNC, Unidade,
          Data de Criação, Data de Solução, Tempo de Tratativa e Ofensor.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.csv"
          disabled={busy}
          onChange={(event) => {
            if (event.target.files) void prepareFiles(event.target.files);
          }}
        />
      </div>

      {prepared ? (
        <>
          <div className="file-list">
            {prepared.perFile.map((file) => (
              <span
                className={`file-pill${file.error ? " error" : ""}`}
                key={file.fileName}
              >
                {file.fileName} ·{" "}
                {file.error
                  ? `erro: ${file.error}`
                  : `${file.count.toLocaleString("pt-BR")} linhas`}
              </span>
            ))}
          </div>
          {prepared.duplicates > 0 ? (
            <div className="info-box">
              {prepared.duplicates.toLocaleString("pt-BR")} linha(s)
              idêntica(s) repetida(s) entre os arquivos — contadas uma única
              vez.
            </div>
          ) : null}
          <div className="controls-row">
            <button
              className="btn"
              type="button"
              disabled={busy || !prepared.records.length}
              onClick={() => void importPrepared()}
            >
              Importar arquivos
            </button>
            <button
              className="btn secondary"
              type="button"
              disabled={busy}
              onClick={() => setPrepared(null)}
            >
              Descartar seleção
            </button>
          </div>
        </>
      ) : null}

      {progress ? (
        <div className="rnc-import-summary">
          <strong>Importação no Neon</strong>
          <span>
            {progress.totalFound.toLocaleString("pt-BR")} registros · lote{" "}
            {progress.currentBatch}/{progress.totalBatches} ({progressPct}%)
          </span>
          <div className="rnc-progress-track">
            <div style={{ width: `${progressPct}%` }} />
          </div>
          <span>
            Inseridos: {progress.inserted} · Atualizados: {progress.updated} ·
            Ignorados: {progress.ignored} · Rejeitados: {progress.rejected}
          </span>
        </div>
      ) : null}

      {error ? <div className="error-box">{error}</div> : null}
      {message ? <div className="info-box">{message}</div> : null}

      {result && data && data.total > 0 ? (
        <div>
          <div className="controls-row">
            <label htmlFor="rncMonthSelect">Mês</label>
            <select
              id="rncMonthSelect"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            >
              {result.months.map((month) => (
                <option
                  key={monthKey(month.year, month.month)}
                  value={monthKey(month.year, month.month)}
                >
                  {month.label}
                </option>
              ))}
            </select>
            <label htmlFor="rncMeta">Meta (dias, ≤)</label>
            <input
              id="rncMeta"
              type="number"
              min={0}
              value={metaDias}
              onChange={(event) => setMetaDias(Number(event.target.value))}
            />
            <button
              className="btn secondary"
              type="button"
              disabled={busy}
              onClick={() => void load(metaDias).catch((err: Error) => setError(err.message))}
            >
              Recalcular
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => exportRncPdf(result)}
            >
              Baixar PDF
            </button>
            {canClear ? (
              <button
                className="btn secondary"
                type="button"
                disabled={busy}
                onClick={() => void clearAll()}
              >
                Limpar tudo
              </button>
            ) : null}
            {canPublish ? (
              <button
                className="btn"
                style={{ background: "var(--verde)" }}
                type="button"
                disabled={busy || result.resultadoDias === null}
                onClick={() => void publish()}
              >
                Publicar no Painel
              </button>
            ) : null}
          </div>

          {publication ? (
            <div className="rdo-publish-status">
              Publicado em{" "}
              {new Date(publication.publishedAt).toLocaleString("pt-BR")} por{" "}
              {publication.publishedBy.name} · versão {publication.version}
            </div>
          ) : null}

          {data.lastImport ? (
            <div className="rdo-publish-status">
              Última importação: {data.lastImport.fileName}
              {data.lastImport.completedAt
                ? ` · ${new Date(data.lastImport.completedAt).toLocaleString("pt-BR")}`
                : ""}
            </div>
          ) : null}

          <div className="cards">
            <div className="card">
              <div className="lbl">RNC&apos;s Criadas</div>
              <div className="val">
                {result.totalCriadas.toLocaleString("pt-BR")}
              </div>
            </div>
            <div className="card">
              <div className="lbl">RNC&apos;s Tratadas</div>
              <div className="val">
                {result.totalTratadas.toLocaleString("pt-BR")}
              </div>
              <div className="sub">{fmtPct(result.aderenciaTotal)}</div>
            </div>
            <div className="card accent">
              <div className="lbl">Dias de resolução</div>
              <div className="val">{formatDays(selected?.diasMedios ?? null)}</div>
              <div className="sub">
                {selected ? selected.label : "Mês não selecionado"}
              </div>
            </div>
            <div className="card">
              <div className="lbl">Aderência do mês</div>
              <div className="val">
                {selectedAdherence === null ? "—" : fmtPct(selectedAdherence)}
              </div>
              <div className="sub">
                {selected
                  ? `${selected.solucionados}/${selected.chamados} solucionadas`
                  : "Sem dados"}
              </div>
            </div>
          </div>

          <div className="subtitle-block">
            <h3>Por mês</h3>
            <p>
              RNC elaboradas, RNC tratadas e prazo médio de resolução pela data
              de criação.
            </p>
          </div>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th>RNC Elaboradas</th>
                  <th>RNC Tratadas</th>
                  <th>Dias de resolução</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {result.months.map((month) => (
                  <tr key={monthKey(month.year, month.month)}>
                    <td>{month.label}</td>
                    <td className="num">{month.chamados}</td>
                    <td className="num">{month.solucionados}</td>
                    <td className="num">{formatDays(month.diasMedios)}</td>
                    <td>
                      <span
                        className={`badge ${
                          month.diasMedios === null
                            ? "info"
                            : month.dentroMeta
                              ? "ok"
                              : "fail"
                        }`}
                      >
                        {month.diasMedios === null
                          ? "Sem tratativa"
                          : month.dentroMeta
                            ? "Dentro da meta"
                            : "Fora da meta"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="subtitle-block">
            <h3>Por unidade</h3>
          </div>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Unidade</th>
                  <th>Criadas</th>
                  <th>Tratadas</th>
                  <th>Aderência</th>
                </tr>
              </thead>
              <tbody>
                {result.units.map((unit) => (
                  <tr key={unit.name}>
                    <td>{unit.name}</td>
                    <td className="num">{unit.criadas}</td>
                    <td className="num">{unit.tratadas}</td>
                    <td className="num">{fmtPct(unit.aderencia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="subtitle-block">
            <h3>Por Ofensor (causa raiz)</h3>
          </div>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Ofensor</th>
                  <th>Qtd</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {result.ofensores.map((offender) => (
                  <tr key={offender.name}>
                    <td>{offender.name}</td>
                    <td className="num">{offender.count}</td>
                    <td className="num">{fmtPct(offender.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="placeholder rdo-admin-empty">
          <span className="tag">Aguardando dados</span>
          <h3>RNC</h3>
          <p>
            Importe um ou mais arquivos para calcular os prazos de tratativa,
            unidades e ofensores.
          </p>
        </div>
      )}
    </>
  );
}
