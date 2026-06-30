import { describe, it, expect } from "vitest";
import {
  normalizeMaskVariableName,
  extractVariables,
  evaluateCondition,
  interpolateMask,
  validateMask,
  missingRequiredVariables,
  canCreateMask,
} from "./maskExecutor";
import type { Mask, MaskBlock } from "./types";

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
    category: "gastro",
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
