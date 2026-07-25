import { describe, expect, it } from "vitest";
import type { VariableBlock } from "./types";
import {
  checkboxValue,
  composeMultiCheck,
  interpolateMask,
  multiCombinations,
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
  // Metaplasia in the gallbladder mask: two independent ticks, each combination
  // spelled out because the wording is not assembled from the item names.
  const metaplasia = field({
    variable_name: "Metaplasia",
    field_type: "multicheck",
    options: ["intestinal", "pseudopilórica"],
    line_mode: "line",
    combinations: [
      { items: [], text: "" },
      { items: ["intestinal"], text: ". Presença de focos de metaplasia intestinal." },
      {
        items: ["pseudopilórica"],
        text: ". Presença de focos de metaplasia pseudopilórica.",
      },
      {
        items: ["intestinal", "pseudopilórica"],
        text: ". Presença de focos de metaplasia intestinal e pseudopilórica.",
      },
    ],
  });

  it("inserts the text written for the empty combination", () => {
    expect(composeMultiCheck(metaplasia, [])).toBe("");
  });

  it("picks the text of each single-item combination", () => {
    expect(composeMultiCheck(metaplasia, ["intestinal"])).toBe(
      "\n. Presença de focos de metaplasia intestinal.",
    );
    expect(composeMultiCheck(metaplasia, ["pseudopilórica"])).toBe(
      "\n. Presença de focos de metaplasia pseudopilórica.",
    );
  });

  it("picks the text written for both together", () => {
    expect(composeMultiCheck(metaplasia, ["intestinal", "pseudopilórica"])).toBe(
      "\n. Presença de focos de metaplasia intestinal e pseudopilórica.",
    );
  });

  it("matches a combination whatever order the items were ticked in", () => {
    expect(composeMultiCheck(metaplasia, ["pseudopilórica", "intestinal"])).toBe(
      composeMultiCheck(metaplasia, ["intestinal", "pseudopilórica"]),
    );
  });

  it("can give the empty combination a text of its own", () => {
    const withNoneText = field({
      field_type: "multicheck",
      options: ["a"],
      combinations: [
        { items: [], text: ". Sem metaplasia." },
        { items: ["a"], text: ". Com metaplasia." },
      ],
    });
    expect(composeMultiCheck(withNoneText, [])).toBe(". Sem metaplasia.");
    expect(composeMultiCheck(withNoneText, ["a"])).toBe(". Com metaplasia.");
  });

  it("inserts nothing for a combination left blank", () => {
    const partial = field({
      field_type: "multicheck",
      options: ["a", "b"],
      line_mode: "line",
      combinations: [
        { items: ["a"], text: "só a" },
        { items: ["a", "b"], text: "" },
      ],
    });
    expect(composeMultiCheck(partial, ["a"])).toBe("\nsó a");
    expect(composeMultiCheck(partial, ["a", "b"])).toBe("");
    // Not listed at all behaves the same as blank.
    expect(composeMultiCheck(partial, ["b"])).toBe("");
  });

  it("ignores ticked values that are not options any more", () => {
    expect(composeMultiCheck(metaplasia, ["removida"])).toBe("");
    // A stale tick alongside a live one still resolves the live combination.
    expect(composeMultiCheck(metaplasia, ["removida", "intestinal"])).toBe(
      "\n. Presença de focos de metaplasia intestinal.",
    );
  });
});

describe("multiCombinations", () => {
  it("lists every combination, fewest ticks first", () => {
    expect(multiCombinations(["a", "b"])).toEqual([[], ["a"], ["b"], ["a", "b"]]);
  });

  it("grows as 2^n", () => {
    expect(multiCombinations([])).toEqual([[]]);
    expect(multiCombinations(["a"])).toHaveLength(2);
    expect(multiCombinations(["a", "b", "c"])).toHaveLength(8);
    expect(multiCombinations(["a", "b", "c", "d"])).toHaveLength(16);
  });

  it("keeps items in the field's own order inside each combination", () => {
    expect(multiCombinations(["z", "a"])).toEqual([[], ["z"], ["a"], ["z", "a"]]);
  });
});

describe("checkbox with an unticked text", () => {
  const box = field({
    variable_name: "Margens",
    field_type: "checkbox",
    checked_text: ". Margens comprometidas.",
    unchecked_text: ". Margens livres.",
    line_mode: "conditional",
  });

  it("inserts a different sentence for each state", () => {
    expect(checkboxValue(box, true)).toBe(". Margens comprometidas.");
    expect(checkboxValue(box, false)).toBe(". Margens livres.");
  });

  it("keeps the line for either state when both texts are set", () => {
    const template = "- Peça.\n{{Margens}}\n. Fim.";
    const render = (checked: boolean) =>
      interpolateMask(templateToBlocks(template, [box]), {
        Margens: checkboxValue(box, checked),
      });

    expect(render(false)).toBe("- Peça.\n. Margens livres.\n. Fim.");
    expect(render(true)).toBe("- Peça.\n. Margens comprometidas.\n. Fim.");
  });

  it("drops the reserved line when the unticked text is empty", () => {
    const optional = field({
      variable_name: "Extra",
      field_type: "checkbox",
      checked_text: ". Extra.",
      line_mode: "conditional",
    });
    const template = "- Peça.\n{{Extra}}\n. Fim.";
    expect(
      interpolateMask(templateToBlocks(template, [optional]), {
        Extra: checkboxValue(optional, false),
      }),
    ).toBe("- Peça.\n. Fim.");
  });
});
