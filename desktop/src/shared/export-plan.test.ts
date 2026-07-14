import { describe, expect, it } from "vitest";
import { createExportPlan } from "./export-plan";

describe("export plans", () => {
  it("exports either document side on its own", () => {
    expect(createExportPlan("front", true)).toEqual({
      kind: "single",
      side: "front",
    });
    expect(createExportPlan("back", true)).toEqual({
      kind: "single",
      side: "back",
    });
  });

  it("exports both sides as one combined image", () => {
    expect(createExportPlan("combined", true)).toEqual({
      kind: "combined",
      sides: ["front", "back"],
    });
  });

  it("exports both sides as separate image files", () => {
    expect(createExportPlan("separate", true)).toEqual({
      kind: "separate",
      sides: ["front", "back"],
    });
  });

  it("falls back to the front for a one-sided document", () => {
    expect(createExportPlan("combined", false)).toEqual({
      kind: "single",
      side: "front",
    });
  });
});
