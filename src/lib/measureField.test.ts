import { describe, expect, it } from "vitest";
import type { VariableBlock } from "./types";
import {
  composeMeasure,
  fieldExpectsInput,
  initialFieldValue,
  measureDims,
  splitMeasure,
} from "./maskExecutor";

const measure = (patch: Partial<VariableBlock> = {}): VariableBlock => ({
  id: "f1",
  type: "variable",
  variable_name: "Tamanho",
  field_type: "measure",
  required: false,
  ...patch,
});

describe("measureDims", () => {
  it("defaults to three boxes and clamps to 1-3", () => {
    expect(measureDims(measure())).toBe(3);
    expect(measureDims(measure({ measure_dims: 1 }))).toBe(1);
    expect(measureDims(measure({ measure_dims: 0 }))).toBe(1);
    expect(measureDims(measure({ measure_dims: 9 }))).toBe(3);
  });
});

describe("composeMeasure", () => {
  it("joins the boxes with ' x ' and appends the unit", () => {
    expect(composeMeasure(["2,5", "1,2", "0,8"], "cm")).toBe("2,5 x 1,2 x 0,8 cm");
  });

  it("skips empty boxes so fewer dimensions still read correctly", () => {
    expect(composeMeasure(["2,5", "1,2", ""], "cm")).toBe("2,5 x 1,2 cm");
    expect(composeMeasure(["2,5", "", ""], "cm")).toBe("2,5 cm");
    expect(composeMeasure(["", "1,2", ""], "cm")).toBe("1,2 cm");
  });

  it("returns an empty string when nothing is filled, so nothing is inserted", () => {
    expect(composeMeasure(["", "", ""], "cm")).toBe("");
    expect(composeMeasure([], "cm")).toBe("");
  });

  it("omits the unit when none is configured", () => {
    expect(composeMeasure(["3", "2"], undefined)).toBe("3 x 2");
    expect(composeMeasure(["3", "2"], "  ")).toBe("3 x 2");
  });

  it("trims whitespace typed into the boxes", () => {
    expect(composeMeasure([" 2,5 ", " 1 "], "mm")).toBe("2,5 x 1 mm");
  });
});

describe("splitMeasure", () => {
  it("round-trips a composed value back into boxes", () => {
    const f = measure({ measure_dims: 3, unit: "cm" });
    expect(splitMeasure(composeMeasure(["2,5", "1,2", "0,8"], "cm"), f)).toEqual([
      "2,5",
      "1,2",
      "0,8",
    ]);
  });

  it("pads missing boxes and strips the unit", () => {
    const f = measure({ measure_dims: 3, unit: "cm" });
    expect(splitMeasure("2,5 x 1,2 cm", f)).toEqual(["2,5", "1,2", ""]);
    expect(splitMeasure("", f)).toEqual(["", "", ""]);
  });

  it("honours the configured box count", () => {
    const f = measure({ measure_dims: 2, unit: "cm" });
    expect(splitMeasure("4 x 3 x 2 cm", f)).toEqual(["4", "3"]);
  });
});

describe("initialFieldValue", () => {
  it("starts selects on their first option", () => {
    expect(
      initialFieldValue({
        ...measure(),
        field_type: "select",
        options: ["a", "b"],
      }),
    ).toBe("a");
  });

  it("starts checkboxes ticked only when default_checked is set", () => {
    const base = { ...measure(), field_type: "checkbox" as const, checked_text: " (Giemsa)" };
    expect(initialFieldValue({ ...base, default_checked: true })).toBe(" (Giemsa)");
    expect(initialFieldValue(base)).toBe("");
  });

  it("starts text and measure fields empty", () => {
    expect(initialFieldValue(measure())).toBe("");
    expect(initialFieldValue({ ...measure(), field_type: "text" })).toBe("");
  });
});

describe("fieldExpectsInput", () => {
  it("is true only for free-text fields, which get the [label] placeholder", () => {
    expect(fieldExpectsInput({ ...measure(), field_type: "text" })).toBe(true);
    expect(fieldExpectsInput({ ...measure(), field_type: "textarea" })).toBe(true);
    expect(fieldExpectsInput(measure())).toBe(false);
    expect(fieldExpectsInput({ ...measure(), field_type: "select" })).toBe(false);
    expect(fieldExpectsInput({ ...measure(), field_type: "checkbox" })).toBe(false);
  });
});
