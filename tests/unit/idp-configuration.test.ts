import { describe, expect, it } from "vitest";
import {
  filterIdpDisciplineNames,
  isIdpDisciplineExcluded,
  normalizeIdpDisciplineName,
  parseIdpExcludedDisciplines,
} from "@/features/idp/configuration";

describe("configuração de exclusões do IDP", () => {
  it("normaliza caixa, acentos, espaços, hífens e sublinhados", () => {
    expect(normalizeIdpDisciplineName(" 04 _ ELÉTRICA ")).toBe("04 eletrica");
    expect(normalizeIdpDisciplineName("08---Válvulas Manuais")).toBe("08 valvulas manuais");
  });

  it("aceita lista, texto por linha ou separado por vírgula", () => {
    expect(parseIdpExcludedDisciplines("04 - Elétrica\n06 - Automação")).toEqual([
      "04 - Elétrica",
      "06 - Automação",
    ]);
    expect(parseIdpExcludedDisciplines(["04 - Elétrica", "04_Elétrica", ""])).toEqual([
      "04 - Elétrica",
    ]);
  });

  it("identifica variações e filtra os nomes", () => {
    const excluded = ["04 - Elétrica"];
    expect(isIdpDisciplineExcluded("04_Elétrica", excluded)).toBe(true);
    expect(isIdpDisciplineExcluded("01 - Civil", excluded)).toBe(false);
    expect(filterIdpDisciplineNames(["01 - Civil", "04_Elétrica"], excluded)).toEqual([
      "01 - Civil",
    ]);
  });
});
