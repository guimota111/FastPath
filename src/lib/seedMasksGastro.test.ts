import { describe, expect, it } from "vitest";
import { buildGastroMasks } from "./seedMasksGastro";
import {
  collectFieldDefs,
  initialFieldValue,
  interpolateMask,
  normalizeMaskVariableName,
} from "./maskExecutor";

const masks = buildGastroMasks("2026-07-24T00:00:00.000Z");

/** The values the floating panel starts a mask with. */
function defaultValues(maskId: string): Record<string, string> {
  const mask = masks.find((m) => m.id === maskId)!;
  const values: Record<string, string> = {};
  for (const f of collectFieldDefs(mask.blocks)) {
    values[normalizeMaskVariableName(f.variable_name)] = initialFieldValue(f);
  }
  return values;
}

function render(maskId: string, overrides: Record<string, string> = {}): string {
  const mask = masks.find((m) => m.id === maskId)!;
  return interpolateMask(mask.blocks, { ...defaultValues(maskId), ...overrides });
}

describe("gastro seed masks", () => {
  it("declares every mask under the Gastro area with a unique id", () => {
    expect(masks.length).toBeGreaterThan(25);
    expect(masks.every((m) => m.area === "Gastro")).toBe(true);
    expect(new Set(masks.map((m) => m.id)).size).toBe(masks.length);
  });

  it("leaves no unresolved {{placeholder}} after interpolation", () => {
    for (const mask of masks) {
      const out = render(mask.id);
      expect(out, `${mask.name} has an unresolved placeholder`).not.toMatch(/\{\{|\}\}/);
    }
  });

  it("declares a field for every placeholder used in the template", () => {
    for (const mask of masks) {
      // templateToBlocks invents a plain text field for unknown placeholders,
      // so any variable block whose name is missing from `variables` means the
      // seed template referenced a field it never defined.
      for (const f of collectFieldDefs(mask.blocks)) {
        expect(
          mask.variables.map(normalizeMaskVariableName),
          `${mask.name}: undeclared field ${f.variable_name}`,
        ).toContain(normalizeMaskVariableName(f.variable_name));
      }
    }
  });

  it("never renders a line that is only the '. ' bullet", () => {
    for (const mask of masks) {
      const lines = render(mask.id).split("\n");
      for (const line of lines) {
        expect(line.trim(), `${mask.name} produced an empty bullet`).not.toBe(".");
      }
    }
  });

  it("renders gastrite inativa with the AHK defaults", () => {
    expect(render("gastro-gastrite-inativa")).toBe(
      "- Gastrite crônica leve e inativa.\n" +
        ". Mucosa de corpo e antro com revestimento habitual, mantendo organização regular e maturação preservada.\n" +
        ". Lâmina própria exibindo leve infiltrado mononuclear, sem atividade neutrofílica.\n" +
        ". Atrofia: ausente.\n" +
        ". Metaplasia intestinal: ausente.\n" +
        ". A pesquisa de Helicobacter pylori (Giemsa) resultou negativa.\n" +
        ". Ausência de evidências de malignidade nesta amostra.",
    );
  });

  it("composes the metaplasia line from its four fields", () => {
    const out = render("gastro-gastrite-inativa", {
      Metaplasia_intestinal: "presente em antro",
      MI_tipo: ", tipo incompleta",
      MI_grau: ", moderada",
      MI_displasia: ", sem displasia",
    });
    expect(out).toContain(
      ". Metaplasia intestinal: presente em antro, tipo incompleta, moderada, sem displasia.",
    );
  });

  it("drops the Giemsa suffix when its checkbox is unticked", () => {
    const out = render("gastro-gastrite-inativa", { Giemsa: "" });
    expect(out).toContain(". A pesquisa de Helicobacter pylori resultou negativa.");
  });

  it("uses real checkboxes for the AHK checkbox fields", () => {
    const colecistite = masks.find((m) => m.id === "gastro-vesicula-colecistite")!;
    const byName = new Map(
      collectFieldDefs(colecistite.blocks).map((f) => [f.variable_name, f]),
    );

    const calculosa = byName.get("Calculosa")!;
    expect(calculosa.field_type).toBe("checkbox");
    expect(calculosa.checked_text).toBe(" calculosa");
    expect(calculosa.default_checked).toBe(true);

    const colesterolose = byName.get("Colesterolose")!;
    expect(colesterolose.field_type).toBe("checkbox");
    expect(colesterolose.default_checked).toBeFalsy();

    // Every checkbox must carry the text it inserts, or ticking does nothing.
    for (const mask of masks) {
      for (const f of collectFieldDefs(mask.blocks)) {
        if (f.field_type !== "checkbox") continue;
        expect(f.checked_text, `${mask.name}/${f.variable_name}`).toBeTruthy();
        // A default must never be set: it would resurrect the unticked text.
        expect(f.default, `${mask.name}/${f.variable_name}`).toBeUndefined();
      }
    }
  });

  it("omits optional lines whose checkbox is unticked", () => {
    const withNone = render("gastro-vesicula-colecistite");
    expect(withNone).toBe(
      "Vesícula biliar:\n" +
        "- Colecistite crônica calculosa.\n" +
        ". Ausência de sinais de malignidade.",
    );

    const withAll = render("gastro-vesicula-colecistite", {
      Colesterolose: "\n. Colesterolose.",
      Metaplasia: "\n. Presença de focos de metaplasia intestinal e pseudopilórica.",
      Seios_de_Rokitanski_Aschoff_dilatados: "\n. Seios de Rokitanski-Aschoff dilatados.",
      Adenomiomatose: "\n. Presença de adenomiomatose.",
      Linfonodo_peri_cístico: "\n- Linfonodo peri-cístico com hiperplasia linfoide reacional.",
    });
    expect(withAll).toBe(
      "Vesícula biliar:\n" +
        "- Colecistite crônica calculosa.\n" +
        ". Colesterolose.\n" +
        ". Presença de focos de metaplasia intestinal e pseudopilórica.\n" +
        ". Seios de Rokitanski-Aschoff dilatados.\n" +
        ". Ausência de sinais de malignidade.\n" +
        ". Presença de adenomiomatose.\n" +
        "- Linfonodo peri-cístico com hiperplasia linfoide reacional.",
    );
  });

  it("ticks the checkboxes the AHK version had checked by default", () => {
    // Colite reativa shipped with both the header hint and the note enabled.
    expect(render("gastro-colite-reativa")).toContain("- Mucosa colônica reativa (ver nota).");
    expect(render("gastro-colite-reativa")).toContain("\n\nNota: alterações reativas");
    // Gastrite erosiva's note was unchecked.
    expect(render("gastro-gastrite-erosiva")).not.toContain("Nota:");
  });

  it("keeps the co-varying esofagite grades consistent in a single field", () => {
    const leve = render("gastro-esofagite-cronica");
    expect(leve).toContain("- Esofagite crônica discreta.");
    expect(leve).toContain(". Infiltrado inflamatório mononuclear leve.");

    const mask = masks.find((m) => m.id === "gastro-esofagite-cronica")!;
    const moderada = collectFieldDefs(mask.blocks)[0].options![1];
    const out = render("gastro-esofagite-cronica", { Grau: moderada });
    expect(out).toContain("- Esofagite crônica moderada.");
    expect(out).toContain(". Infiltrado inflamatório mononuclear moderado.");
  });
});
