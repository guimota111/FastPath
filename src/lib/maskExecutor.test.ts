import { describe, it, expect } from "vitest";
import {
  normalizeMaskVariableName,
  extractVariables,
  evaluateCondition,
  isFieldVisible,
  computedFieldValue,
  interpolateMask,
  validateMask,
  missingRequiredVariables,
  canCreateMask,
  renderRuns,
} from "./maskExecutor";
import type { Mask, MaskBlock, VariableBlock } from "./types";

const v = (name: string, extra: Partial<MaskBlock> = {}): MaskBlock => ({
  id: name,
  type: "variable",
  variable_name: name,
  field_type: "text",
  required: false,
  ...extra,
} as MaskBlock);

const text = (content: string): MaskBlock => ({
  id: "t-" + content.slice(0, 4),
  type: "text",
  content,
});

describe("normalizeMaskVariableName", () => {
  it("replaces whitespace runs with underscore", () => {
    expect(normalizeMaskVariableName("nome do paciente")).toBe("nome_do_paciente");
  });
  it("collapses multiple spaces and trims", () => {
    expect(normalizeMaskVariableName("  a   b  ")).toBe("a_b");
  });
});

describe("extractVariables", () => {
  it("collects variables from nested blocks, deduped", () => {
    const blocks: MaskBlock[] = [
      v("orgao"),
      {
        id: "c1",
        type: "conditional",
        condition: { variable_name: "tipo", operator: "equals", value: "maligno" },
        blocks: [v("grau"), v("orgao")],
      },
    ];
    expect(extractVariables(blocks).sort()).toEqual(["grau", "orgao", "tipo"]);
  });
});

describe("evaluateCondition", () => {
  it("equals matches exactly", () => {
    expect(
      evaluateCondition({ variable_name: "x", operator: "equals", value: "sim" }, { x: "sim" }),
    ).toBe(true);
    expect(
      evaluateCondition({ variable_name: "x", operator: "equals", value: "sim" }, { x: "nao" }),
    ).toBe(false);
  });
  it("contains matches substrings", () => {
    expect(
      evaluateCondition({ variable_name: "x", operator: "contains", value: "lig" }, { x: "maligno" }),
    ).toBe(true);
  });
  it("normalizes the condition variable name", () => {
    expect(
      evaluateCondition({ variable_name: "tipo lesao", operator: "equals", value: "a" }, { tipo_lesao: "a" }),
    ).toBe(true);
  });

  it("gt/lt/gte/lte compare as numbers", () => {
    expect(evaluateCondition({ variable_name: "n", operator: "gt", value: "5" }, { n: "6" })).toBe(true);
    expect(evaluateCondition({ variable_name: "n", operator: "gt", value: "5" }, { n: "5" })).toBe(false);
    expect(evaluateCondition({ variable_name: "n", operator: "lt", value: "5" }, { n: "4" })).toBe(true);
    expect(evaluateCondition({ variable_name: "n", operator: "gte", value: "5" }, { n: "5" })).toBe(true);
    expect(evaluateCondition({ variable_name: "n", operator: "lte", value: "5" }, { n: "5" })).toBe(true);
    expect(evaluateCondition({ variable_name: "n", operator: "lte", value: "5" }, { n: "6" })).toBe(false);
  });

  it("numeric operators never match a non-numeric value", () => {
    expect(evaluateCondition({ variable_name: "n", operator: "gt", value: "5" }, { n: "muitas" })).toBe(false);
    expect(evaluateCondition({ variable_name: "n", operator: "gt", value: "5" }, { n: "" })).toBe(false);
    expect(evaluateCondition({ variable_name: "n", operator: "gt", value: "5" }, {})).toBe(false);
  });
});

describe("isFieldVisible", () => {
  it("is always visible without a condition", () => {
    const f = v("qualquer") as VariableBlock;
    expect(isFieldVisible(f, {})).toBe(true);
  });

  it("is visible when the condition matches the other field's current value", () => {
    const f = v("grau", {
      condition: { variable_name: "tem_grau", operator: "equals", values: ["Sim, tem grau"] },
    }) as VariableBlock;
    expect(isFieldVisible(f, { tem_grau: "Sim, tem grau" })).toBe(true);
    expect(isFieldVisible(f, { tem_grau: "" })).toBe(false);
    expect(isFieldVisible(f, {})).toBe(false);
  });

  it("is visible when the value matches ANY of several active toggles", () => {
    const f = v("resumo", {
      condition: { variable_name: "tipo", operator: "equals", values: ["A", "B"] },
    }) as VariableBlock;
    expect(isFieldVisible(f, { tipo: "A" })).toBe(true);
    expect(isFieldVisible(f, { tipo: "B" })).toBe(true);
    expect(isFieldVisible(f, { tipo: "C" })).toBe(false);
  });

  it("is never visible when no toggle is active", () => {
    const f = v("resumo", {
      condition: { variable_name: "tipo", operator: "equals", values: [] },
    }) as VariableBlock;
    expect(isFieldVisible(f, { tipo: "A" })).toBe(false);
  });
});

describe("computedFieldValue", () => {
  const mitosePalavra = (extra: Partial<VariableBlock> = {}) =>
    v("mitose_palavra", {
      field_type: "computed",
      checked_text: "mitose",
      unchecked_text: "mitoses",
      computed_condition: { variable_name: "numero_mitoses", operator: "equals", values: ["1"] },
      ...extra,
    }) as VariableBlock;

  it("resolves to checked_text when the condition holds", () => {
    expect(computedFieldValue(mitosePalavra(), { numero_mitoses: "1" })).toBe("mitose");
  });

  it("resolves to unchecked_text otherwise", () => {
    expect(computedFieldValue(mitosePalavra(), { numero_mitoses: "2" })).toBe("mitoses");
    expect(computedFieldValue(mitosePalavra(), {})).toBe("mitoses");
  });

  it("works with a numeric operator against a free-typed count", () => {
    const f = mitosePalavra({
      computed_condition: { variable_name: "numero_mitoses", operator: "lte", values: ["1"] },
    });
    expect(computedFieldValue(f, { numero_mitoses: "0" })).toBe("mitose");
    expect(computedFieldValue(f, { numero_mitoses: "1" })).toBe("mitose");
    expect(computedFieldValue(f, { numero_mitoses: "2" })).toBe("mitoses");
  });

  it("is empty without a computed_condition", () => {
    expect(computedFieldValue(v("x") as VariableBlock, {})).toBe("");
  });
});

describe("interpolateMask", () => {
  it("renders text and variable values in order", () => {
    const blocks: MaskBlock[] = [text("Órgão: "), v("orgao"), text(".")];
    expect(interpolateMask(blocks, { orgao: "estômago" })).toBe("Órgão: estômago.");
  });

  it("uses default when value missing", () => {
    const blocks: MaskBlock[] = [v("grau", { default: "indeterminado" })];
    expect(interpolateMask(blocks, {})).toBe("indeterminado");
  });

  it("includes conditional block only when met", () => {
    const blocks: MaskBlock[] = [
      text("Resultado"),
      {
        id: "c",
        type: "conditional",
        condition: { variable_name: "maligno", operator: "equals", value: "sim" },
        blocks: [text(" - MALIGNO grau "), v("grau")],
      },
    ];
    expect(interpolateMask(blocks, { maligno: "sim", grau: "III" })).toBe(
      "Resultado - MALIGNO grau III",
    );
    expect(interpolateMask(blocks, { maligno: "nao" })).toBe("Resultado");
  });

  it("handles nested conditionals", () => {
    const blocks: MaskBlock[] = [
      {
        id: "outer",
        type: "conditional",
        condition: { variable_name: "a", operator: "equals", value: "1" },
        blocks: [
          text("A"),
          {
            id: "inner",
            type: "conditional",
            condition: { variable_name: "b", operator: "contains", value: "x" },
            blocks: [text("B")],
          },
        ],
      },
    ];
    expect(interpolateMask(blocks, { a: "1", b: "xy" })).toBe("AB");
    expect(interpolateMask(blocks, { a: "1", b: "y" })).toBe("A");
    expect(interpolateMask(blocks, { a: "0", b: "x" })).toBe("");
  });
});

describe("validateMask", () => {
  const base: Mask = {
    id: "m1",
    creator_id: "u1",
    name: "Teste",
    area: "Gastro",
    category: "Biópsia",
    blocks: [text("ok")],
    is_published: false,
    is_official: false,
    created_at: "2026-06-30T00:00:00Z",
    variables: [],
  };

  it("accepts a valid private mask", () => {
    expect(validateMask(base).valid).toBe(true);
  });
  it("rejects empty name", () => {
    expect(validateMask({ ...base, name: "  " }).errors).toContain("Nome obrigatório");
  });
  it("rejects empty blocks", () => {
    expect(validateMask({ ...base, blocks: [] }).errors).toContain("Máscara vazia");
  });
  it("requires description to publish", () => {
    const r = validateMask({ ...base, is_published: true });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Descrição obrigatória para publicar");
  });
});

describe("missingRequiredVariables", () => {
  it("flags unfilled required fields", () => {
    const blocks: MaskBlock[] = [v("orgao", { required: true }), v("nota", { required: false })];
    expect(missingRequiredVariables(blocks, {})).toEqual(["orgao"]);
    expect(missingRequiredVariables(blocks, { orgao: "fígado" })).toEqual([]);
  });

  it("ignores required fields inside an unmet conditional", () => {
    const blocks: MaskBlock[] = [
      {
        id: "c",
        type: "conditional",
        condition: { variable_name: "maligno", operator: "equals", value: "sim" },
        blocks: [v("grau", { required: true })],
      },
    ];
    expect(missingRequiredVariables(blocks, { maligno: "nao" })).toEqual([]);
    expect(missingRequiredVariables(blocks, { maligno: "sim" })).toEqual(["grau"]);
  });

  it("respects defaults on required fields", () => {
    const blocks: MaskBlock[] = [v("grau", { required: true, default: "I" })];
    expect(missingRequiredVariables(blocks, {})).toEqual([]);
  });
});

describe("renderRuns formatting inside a field's own text", () => {
  it("splits **/__ markers inside a select option into separate runs", () => {
    const blocks: MaskBlock[] = [
      v("achado", { field_type: "select", options: ["**Normal**, sem alterações"] }),
    ];
    const runs = renderRuns(blocks, { achado: "**Normal**, sem alterações" });
    expect(runs).toEqual([
      { text: "Normal", bold: true },
      { text: ", sem alterações" },
    ]);
  });

  it("splits markers inside checkbox checked/unchecked text", () => {
    const blocks: MaskBlock[] = [
      v("biopsia", {
        field_type: "checkbox",
        checked_text: "__achado positivo__",
        unchecked_text: "sem achados",
      }),
    ];
    expect(renderRuns(blocks, { biopsia: "__achado positivo__" })).toEqual([
      { text: "achado positivo", italic: true },
    ]);
  });

  it("adds emphasis on top of the block's own formatting rather than replacing it", () => {
    const blocks: MaskBlock[] = [
      v("achado", { field_type: "select", bold: true, options: ["normal __e claro__"] }),
    ];
    expect(renderRuns(blocks, { achado: "normal __e claro__" })).toEqual([
      { text: "normal ", bold: true },
      { text: "e claro", bold: true, italic: true },
    ]);
  });

  it("falls back to the author's default text for text/textarea fields, markers included", () => {
    const blocks: MaskBlock[] = [v("nota", { field_type: "text", default: "**ver abaixo**" })];
    expect(renderRuns(blocks, {})).toEqual([{ text: "ver abaixo", bold: true }]);
  });

  it("never reads markers out of what the report writer actually typed", () => {
    const blocks: MaskBlock[] = [v("nota", { field_type: "text" })];
    expect(renderRuns(blocks, { nota: "2** de 3 lâminas __revisadas__" })).toEqual([
      { text: "2** de 3 lâminas __revisadas__" },
    ]);
  });

  it("does the same for textarea and multicheck combination text", () => {
    expect(
      renderRuns([v("obs", { field_type: "textarea" })], { obs: "livre **texto**" }),
    ).toEqual([{ text: "livre **texto**" }]);

    const multi: MaskBlock[] = [
      v("itens", {
        field_type: "multicheck",
        combinations: [{ items: ["a"], text: "**a** presente" }],
      }),
    ];
    expect(renderRuns(multi, { itens: "**a** presente" })).toEqual([
      { text: "a", bold: true },
      { text: " presente" },
    ]);
  });
});

describe("canCreateMask", () => {
  it("enforces the basic plan limit of 30", () => {
    expect(canCreateMask("basic", 29)).toBe(true);
    expect(canCreateMask("basic", 30)).toBe(false);
  });
  it("allows unlimited for creator and trial", () => {
    expect(canCreateMask("creator", 9999)).toBe(true);
    expect(canCreateMask("trial", 9999)).toBe(true);
  });
});
