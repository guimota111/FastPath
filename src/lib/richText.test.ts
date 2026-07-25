import { describe, expect, it } from "vitest";
import type { TextRun, VariableBlock } from "./types";
import { hasFormatting, planTyping, runsToHtml } from "./richText";
import {
  blocksToTemplate,
  interpolateMask,
  renderRuns,
  runsToPlainText,
  templateToBlocks,
} from "./maskExecutor";

const field = (name: string, patch: Partial<VariableBlock> = {}): VariableBlock => ({
  id: name,
  type: "variable",
  variable_name: name,
  field_type: "text",
  required: false,
  ...patch,
});

/** Parse a template the way the editor stores it, then render it. */
function runs(template: string, fields: VariableBlock[] = [], values = {}): TextRun[] {
  return renderRuns(templateToBlocks(template, fields), values);
}

describe("bold/italic markers in the template", () => {
  it("marks the text between the markers, not the markers themselves", () => {
    expect(runs("- **Gastrite crônica.**\n. Detalhe.")).toEqual([
      { text: "- ", },
      { text: "Gastrite crônica.", bold: true },
      { text: "\n. Detalhe." },
    ]);
  });

  it("keeps the markers out of the plain text", () => {
    expect(interpolateMask(templateToBlocks("**negrito** e __itálico__", []), {})).toBe(
      "negrito e itálico",
    );
  });

  it("handles bold and italic overlapping", () => {
    expect(runs("a **b __c__ d** e")).toEqual([
      { text: "a " },
      { text: "b ", bold: true },
      { text: "c", bold: true, italic: true },
      { text: " d", bold: true },
      { text: " e" },
    ]);
  });

  it("carries the formatting into an interpolated variable", () => {
    const f = [field("Local")];
    expect(runs("- **Mucosa de {{Local}}.**", f, { Local: "antro" })).toEqual([
      { text: "- " },
      { text: "Mucosa de antro.", bold: true },
    ]);
  });

  it("leaves a variable outside the markers unformatted", () => {
    const f = [field("Local")];
    expect(runs("**Cabeçalho** {{Local}}", f, { Local: "antro" })).toEqual([
      { text: "Cabeçalho", bold: true },
      { text: " antro" },
    ]);
  });

  it("merges neighbouring stretches that share formatting", () => {
    const f = [field("A"), field("B")];
    expect(runs("**{{A}}{{B}}**", f, { A: "x", B: "y" })).toEqual([
      { text: "xy", bold: true },
    ]);
  });

  it("round-trips through blocks and back to the template", () => {
    for (const template of [
      "- **Diagnóstico.**\n. corpo",
      "a __b__ c",
      "**tudo em negrito**",
      "a **b __c__ d** e",
      "sem formatação",
    ]) {
      expect(blocksToTemplate(templateToBlocks(template, []))).toBe(template);
    }
  });

  it("still swallows the conditional line break with formatting present", () => {
    const optional = field("Extra", {
      field_type: "checkbox",
      checked_text: ". Extra.",
      line_mode: "conditional",
    });
    const out = runs("**- Cabeçalho.**\n{{Extra}}\n. Fim.", [optional], { Extra: "" });
    expect(runsToPlainText(out)).toBe("- Cabeçalho.\n. Fim.");
  });
});

describe("runsToHtml", () => {
  it("wraps each run in the tags its formatting needs", () => {
    expect(runsToHtml([{ text: "a" }, { text: "b", bold: true }])).toContain(
      "a<strong>b</strong>",
    );
  });

  it("nests italic inside bold", () => {
    expect(runsToHtml([{ text: "x", bold: true, italic: true }])).toContain(
      "<strong><em>x</em></strong>",
    );
  });

  it("turns newlines into breaks and keeps whitespace", () => {
    const html = runsToHtml([{ text: "a\nb" }]);
    expect(html).toContain("a<br>b");
    expect(html).toContain("white-space:pre-wrap");
  });

  it("escapes markup in the report text", () => {
    expect(runsToHtml([{ text: "a < b & c" }])).toContain("a &lt; b &amp; c");
  });
});

describe("hasFormatting", () => {
  it("is false when nothing is bold or italic", () => {
    expect(hasFormatting([{ text: "a" }, { text: "b" }])).toBe(false);
  });

  it("is true as soon as one run carries formatting", () => {
    expect(hasFormatting([{ text: "a" }, { text: "b", italic: true }])).toBe(true);
  });
});

describe("planTyping", () => {
  it("types plain text with no toggles at all", () => {
    expect(planTyping([{ text: "abc" }])).toEqual([{ kind: "text", text: "abc" }]);
  });

  it("toggles bold on before the run and off at the end", () => {
    expect(planTyping([{ text: "x", bold: true }])).toEqual([
      { kind: "toggle", format: "bold" },
      { kind: "text", text: "x" },
      { kind: "toggle", format: "bold" },
    ]);
  });

  it("does not re-toggle between runs that share formatting", () => {
    const steps = planTyping([
      { text: "a", bold: true },
      { text: "b", bold: true },
    ]);
    expect(steps.filter((s) => s.kind === "toggle")).toHaveLength(2);
  });

  it("turns formatting off again between runs", () => {
    expect(
      planTyping([{ text: "a", bold: true }, { text: "b" }]),
    ).toEqual([
      { kind: "toggle", format: "bold" },
      { kind: "text", text: "a" },
      { kind: "toggle", format: "bold" },
      { kind: "text", text: "b" },
    ]);
  });

  it("leaves the target app with both toggles off", () => {
    const steps = planTyping([{ text: "x", bold: true, italic: true }]);
    const bold = steps.filter((s) => s.kind === "toggle" && s.format === "bold");
    const italic = steps.filter((s) => s.kind === "toggle" && s.format === "italic");
    // An even number of presses means the toggle ends where it started.
    expect(bold).toHaveLength(2);
    expect(italic).toHaveLength(2);
  });

  it("ignores empty runs so no stray toggle is sent", () => {
    expect(planTyping([{ text: "", bold: true }, { text: "a" }])).toEqual([
      { kind: "text", text: "a" },
    ]);
  });
});
