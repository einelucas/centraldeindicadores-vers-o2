import { describe, it, expect } from "vitest";
import { dedupeRdoRows, toRdoRecord } from "@/features/rdo/importers";

describe("RDO importer", () => {
  it("dedupes only fully identical rows", () => {
    // Planilhas reais têm o mesmo conjunto de colunas em todas as linhas.
    // relatorio_id repetido NÃO é duplicata se outra coluna difere (ex.: disciplina).
    const rows = [
      { data: "10/01/2026", empresa_nome: "A", status_descricao: "Aprovado", relatorio_id: "1", disciplina: "Civil" },
      { data: "10/01/2026", empresa_nome: "A", status_descricao: "Aprovado", relatorio_id: "1", disciplina: "Civil" }, // dup real
      { data: "10/01/2026", empresa_nome: "A", status_descricao: "Aprovado", relatorio_id: "1", disciplina: "Mecânica" }, // não é dup
    ];
    const { rows: out, duplicates } = dedupeRdoRows(rows);
    expect(duplicates).toBe(1);
    expect(out.length).toBe(2);
  });

  it("toRdoRecord returns null without date or unit", () => {
    expect(toRdoRecord({ empresa_nome: "A" })).toBeNull();
    expect(toRdoRecord({ data: "10/01/2026" })).toBeNull();
  });

  it("toRdoRecord parses fields", () => {
    const r = toRdoRecord({
      data: "15/03/2026",
      empresa_nome: "  UNIDADE X ",
      status_descricao: "Aprovado",
      relatorio_id: "R9",
    });
    expect(r?.empresaNome).toBe("UNIDADE X");
    expect(r?.year).toBe(2026);
    expect(r?.month).toBe(3);
    expect(r?.relatorioId).toBe("R9");
  });
});
