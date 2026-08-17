import { describe, expect, it } from "vitest";
import {
  publicationPeriod,
  selectPublicationForPeriod,
} from "@/server/publications/period-selection";

const cycle2026S2 = {
  startYear: 2026,
  startMonth: 6,
  endYear: 2026,
  endMonth: 11,
};

describe("publication period selection", () => {
  it("selects the snapshot whose published period matches the requested cycle", () => {
    const publications = [
      { active: true, payload: { periodo: cycle2026S2 }, name: "current" },
      {
        active: false,
        payload: {
          periodo: { startYear: 2025, startMonth: 12, endYear: 2026, endMonth: 5 },
        },
        name: "history",
      },
    ];

    expect(selectPublicationForPeriod("rdo", publications, cycle2026S2)).toEqual({
      publication: publications[0],
      historyCount: 2,
    });
  });

  it("derives the IDP period from its legacy history fields", () => {
    expect(
      publicationPeriod("idp", {
        selectedYear: 2026,
        selectedMonth: 11,
        historyStartYear: 2026,
        historyMonthStart: 6,
        historyEndYear: 2026,
        historyMonthEnd: 11,
      }),
    ).toEqual(cycle2026S2);
  });

  it("returns no publication when the selected cycle has no matching snapshot", () => {
    const publications = [{ active: true, payload: { periodo: cycle2026S2 } }];

    expect(
      selectPublicationForPeriod("cinco-s", publications, {
        startYear: 2025,
        startMonth: 6,
        endYear: 2025,
        endMonth: 11,
      }).publication,
    ).toBeNull();
  });
});
