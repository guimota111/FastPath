import { describe, expect, it } from "vitest";
import type { VariableBlock } from "./types";
import {
  composeMultiCheck,
  interpolateMask,
  templateToBlocks,
} from "./maskExecutor";

const field = (patch: Partial<VariableBlock>): VariableBlock => ({
  id: "f",
  type: "variable",
  variable_name: "X",
  field_type: "checkbox",
  required: false,
  ...patch,
});

/** Render a stacked template, the way the mask editor lets the author write it. */
function render(
  template: string,
  fields: VariableBlock[],
  values: Record<string, string>,
): string {
  return interpolateMask(templateToBlocks(template, fields), values);
}

describe("conditional line mode", () => {
  // The author stacks one placeholder per line so the template reads like the
  // report; each line only survives if its field has a value.
  const template =
    "- Colecistite crônica.\n" +
    "{{Colesterolose}}\n" +
    "{{Adenomiomatose}}\n" +
    ". Ausência de sinais de malignidade.";

  const fields = [
    field({
      variable_name: "Colesterolose",
      checked_text: ". Colesterolose.",
      line_mode: "conditional",
    }),
    field({
      variable_name: "Adenomiomatose",
      checked_text: ". Presença de adenomiomatose.",
      line_mode: "conditional",
    }),
  ];

  it("leaves no blank line when nothing is ticked", () => {
    expect(render(template, fields, {})).toBe(
      "- Colecistite crônica.\n. Ausência de sinais de malignidade.",
    );
  });

  it("keeps the line for the ticked field only", () => {
    expect(
      render(template, fields, { Colesterolose: ". Colesterolose." }),
    ).toBe(
      "- Colecistite crônica.\n" +
        ". Colesterolose.\n" +
        ". Ausência de sinais de malignidade.",
    );
  });

  it("keeps both lines when both are ticked", () => {
    expect(
      render(template, fields, {
        Colesterolose: ". Colesterolose.",
        Adenomiomatose: ". Presença de adenomiomatose.",
      }),
    ).toBe(
      "- Colecistite crônica.\n" +
        ". Colesterolose.\n" +
        ". Presença de adenomiomatose.\n" +
        ". Ausência de sinais de malignidade.",
    );
  });

  it("does not swallow anything for fields in the other line modes", () => {
    const inline = [field({ variable_name: "X", line_mode: "inline" })];
    expect(render("antes\n{{X}}\ndepois", inline, {})).toBe("antes\n\ndepois");
  });

  it("swallows only one break, so a deliberate blank line survives", () => {
    const one = [field({ variable_name: "X", line_mode: "conditional" })];
    expect(render("antes\n\n{{X}}\ndepois", one, {})).toBe("antes\n\ndepois");
  });

  it("handles a placeholder at the very start of the template", () => {
    const one = [field({ variable_name: "X", line_mode: "conditional" })];
    expect(render("{{X}}\ndepois", one, {})).toBe("\ndepois");
  });
});

describe("composeMultiCheck", () => {
  // Metaplasia in the gallbladder mask: two independent ticks that have to read
  // as one sentence.
  const metaplasia = field({
    variable_name: "Metaplasia",
    field_type: "multicheck",
    options: ["intestinal", "pseudopilórica"],
    prefix: ". Presença de focos de metaplasia ",
    suffix: ".",
    line_mode: "line",
  });

  it("inserts nothing when no item is ticked", () => {
    expect(composeMultiCheck(metaplasia, [])).toBe("");
  });

  it("reads as a single item without the connector", () => {
    expect(composeMultiCheck(metaplasia, ["intestinal"])).toBe(
      "\n. Presença de focos de metaplasia intestinal.",
    );
    expect(composeMultiCheck(metaplasia, ["pseudopilórica"])).toBe(
      "\n. Presença de focos de metaplasia pseudopilórica.",
    );
  });

  it("joins two items with the connector", () => {
    expect(composeMultiCheck(metaplasia, ["intestinal", "pseudopilórica"])).toBe(
      "\n. Presença de focos de metaplasia intestinal e pseudopilórica.",
    );
  });

  it("keeps the field's option order regardless of ticking order", () => {
    expect(composeMultiCheck(metaplasia, ["pseudopilórica", "intestinal"])).toBe(
      composeMultiCheck(metaplasia, ["intestinal", "pseudopilórica"]),
    );
  });

  it("uses commas before the connector for three or more items", () => {
    const three = field({
      field_type: "multicheck",
      options: ["a", "b", "c"],
      prefix: "Achados: ",
      suffix: ".",
    });
    expect(composeMultiCheck(three, ["a", "b", "c"])).toBe("Achados: a, b e c.");
    expect(composeMultiCheck(three, ["a", "c"])).toBe("Achados: a e c.");
  });

  it("honours a custom connector", () => {
    const en = field({
      field_type: "multicheck",
      options: ["x", "y"],
      last_separator: " and ",
    });
    expect(composeMultiCheck(en, ["x", "y"])).toBe("x and y");
  });

  it("ignores ticked values that are not options any more", () => {
    expect(composeMultiCheck(metaplasia, ["removida"])).toBe("");
  });
});
