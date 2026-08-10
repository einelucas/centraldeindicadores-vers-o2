import { describe, expect, it } from "vitest";
import {
  filterIdpExcludedDisciplines,
  isIdpDisciplineExcluded,
  normalizeIdpDisciplineName,
  parseIdpExcludedDisciplines,
} from "@/features/idp/configuration";

describe("configuração de exclusões do IDP", () => {
  it("normaliza caixa, acentos, espaços, hífens e sublinhados", () => {
    expect(normalizeIdpDisciplineName(" 09 _ PROJÉTOS ")).toBe("09 projetos");
    expect(normalizeIdpDisciplineName("10---Fornecimentos")).toBe("10 fornecimentos");
  });

  it("identifica variações e filtra listas genéricas", () => {
    const excluded = parseIdpExcludedDisciplines("09 _ Projetos\n10 _ Fornecimentos");
    expect(isIdpDisciplineExcluded("09-Projetos", excluded)).toBe(true);
    const rows = [{ disciplina: "01 - Civil" }, { disciplina: "09-Projetos" }];
    expect(filterIdpExcludedDisciplines(rows, excluded)).toEqual([{ disciplina: "01 - Civil" }]);
  });
});
