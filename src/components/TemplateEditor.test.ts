// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { serialize, toHtml } from "./TemplateEditor";

const known = new Set(["Localização", "Atrofia"]);

/** Build an editing surface holding `html`, the way the component does. */
function surface(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

/** template -> chips -> template, which is what every keystroke round-trips. */
function roundTrip(template: string): string {
  return serialize(surface(toHtml(template, known)));
}

describe("toHtml", () => {
  it("turns placeholders into chips labelled without underscores", () => {
    const html = toHtml("Mucosa de {{Localização}}.", known);
    expect(html).toContain('data-var="Localização"');
    expect(html).toContain('contenteditable="false"');
    expect(html).toContain(">Localização<");
    expect(html).not.toContain("{{");
  });

  it("labels a chip with spaces where the name has underscores", () => {
    const html = toHtml("{{MI_tipo}}", new Set(["MI_tipo"]));
    expect(html).toContain(">MI tipo<");
    expect(html).toContain('data-var="MI_tipo"');
  });

  it("marks unknown variables differently so typos are visible", () => {
    const knownStyle = toHtml("{{Atrofia}}", known);
    const unknownStyle = toHtml("{{Inexistente}}", known);
    expect(knownStyle).not.toEqual(unknownStyle);
    expect(unknownStyle).toContain("#A12222");
  });

  it("gives the same variable the same colour every time", () => {
    expect(toHtml("{{Atrofia}}", known)).toBe(toHtml("{{Atrofia}}", known));
  });

  it("escapes markup typed into the report text", () => {
    const html = toHtml("a < b & c > d", known);
    expect(html).toBe("a &lt; b &amp; c &gt; d");
  });
});

describe("serialize", () => {
  it("reads chips back as {{placeholders}}", () => {
    const el = surface(
      'Mucosa de <span data-var="Localização" contenteditable="false">Localização</span>.',
    );
    expect(serialize(el)).toBe("Mucosa de {{Localização}}.");
  });

  it("reads <br> as a line break", () => {
    expect(serialize(surface("linha 1<br>linha 2"))).toBe("linha 1\nlinha 2");
  });

  it("reads browser-inserted block wrappers as line breaks", () => {
    expect(serialize(surface("<div>linha 1</div><div>linha 2</div>"))).toBe(
      "linha 1\nlinha 2",
    );
  });

  it("ignores the trailing <br> browsers add to keep the last line focusable", () => {
    expect(serialize(surface("texto<br>"))).toBe("texto");
    // A deliberate blank last line still survives.
    expect(serialize(surface("texto<br><br>"))).toBe("texto\n");
  });
});

describe("round trip", () => {
  it("preserves a template with text, chips and newlines", () => {
    const template =
      "- Gastrite crônica {{Atrofia}}, em atividade.\n" +
      ". Mucosa de {{Localização}} com revestimento habitual.\n" +
      ". Fim.";
    expect(roundTrip(template)).toBe(template);
  });

  it("preserves adjacent chips with no text between them", () => {
    const template = "{{Atrofia}}{{Localização}}";
    expect(roundTrip(template)).toBe(template);
  });

  it("preserves an unknown placeholder instead of dropping it", () => {
    expect(roundTrip("x {{Inexistente}} y")).toBe("x {{Inexistente}} y");
  });

  it("preserves blank lines between paragraphs", () => {
    expect(roundTrip("linha\n\nNota: algo.")).toBe("linha\n\nNota: algo.");
  });

  it("normalises loose placeholder spacing to the canonical form", () => {
    // The parser accepts {{ Name }}; the chip round-trip tightens it.
    expect(roundTrip("{{ Atrofia }}")).toBe("{{Atrofia}}");
  });

  it("survives an empty template", () => {
    expect(roundTrip("")).toBe("");
  });
});
