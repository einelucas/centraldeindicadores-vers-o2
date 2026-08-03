import { describe, expect, it } from "vitest";
import {
  filterIdpExcludedDisciplines,
  isIdpDisciplineExcluded,
  normalizeIdpDisciplineName,
  parseIdpExcludedDisciplines,
} from "@/features/idp/configuration";
import type { IdpNormalizedRecord } from "@/features/idp/types";

function record(disciplina: string): IdpNormalizedRecord {
  return {
    unit: "Projeto A",
    year: 2026,
    month: 6,
    disciplina,
    custoLinhaBase: 100,
    custoReal: 90,
    raw: {},
  };
}

describe("configuração de exclusões do IDP", () => {
  it("normaliza caixa, acentos, espaços, hífens e sublinhados", () => {
    expect(normalizeIdpDisciplineName(" 09 _ PROJÉTOS ")).toBe("09 projetos");
    expect(normalizeIdpDisciplineName("10---Fornecimentos")).toBe("10 fornecimentos");
  });

  it("aceita lista, texto por linha ou separado por vírgula", () => {
    expect(parseIdpExcludedDisciplines("09 _ Projetos\n10 _ Fornecimentos")).toEqual([
      "09 _ Projetos",
      "10 _ Fornecimentos",
    ]);
    expect(parseIdpExcludedDisciplines(["09 _ Projetos", "09-Projetos", ""])).toEqual([
      "09 _ Projetos",
    ]);
  });

  it("identifica variações das disciplinas configuradas", () => {
    const excluded = ["09 _ Projetos", "10 _ Fornecimentos"];
    expect(isIdpDisciplineExcluded("09-Projetos", excluded)).toBe(true);
    expect(isIdpDisciplineExcluded("10 fornecimentos", excluded)).toBe(true);
    expect(isIdpDisciplineExcluded("01 _ Civil", excluded)).toBe(false);
  });

  it("remove apenas as disciplinas excluídas", () => {
    const rows = [
      record("01 _ Civil"),
      record("09 _ Projetos"),
      record("10 _ Fornecimentos"),
    ];

    expect(
      filterIdpExcludedDisciplines(rows, ["09 _ Projetos", "10 _ Fornecimentos"]).map(
        (item) => item.disciplina,
      ),
    ).toEqual(["01 _ Civil"]);
  });
});
