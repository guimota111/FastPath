import { describe, expect, it } from "vitest";
import type { Mask } from "./types";
import { allGroupKeys, groupMasksByArea, subareaKey } from "./maskGrouping";

const mask = (id: string, area: string, category: string): Mask => ({
  id,
  creator_id: "u",
  name: id,
  area,
  category,
  blocks: [],
  is_published: false,
  is_official: false,
  created_at: "2026-01-01T00:00:00.000Z",
  variables: [],
});

describe("groupMasksByArea", () => {
  it("groups by area then subarea", () => {
    const masks = [
      mask("a", "Gastro", "Esôfago"),
      mask("b", "Gastro", "Estômago"),
      mask("c", "Gastro", "Esôfago"),
      mask("d", "Uro", "Próstata"),
    ];
    const groups = groupMasksByArea(masks, ["Gastro", "Uro"]);

    expect(groups.map((g) => g.area)).toEqual(["Gastro", "Uro"]);
    expect(groups[0].masks).toHaveLength(3);
    expect(groups[0].subareas.map((s) => s.name)).toEqual(["Esôfago", "Estômago"]);
    expect(groups[0].subareas[0].masks.map((m) => m.id)).toEqual(["a", "c"]);
    expect(groups[1].subareas[0].masks.map((m) => m.id)).toEqual(["d"]);
  });

  it("keeps the areas in the order the user arranged them", () => {
    const groups = groupMasksByArea([], ["Uro", "Gastro", "Neuro"]);
    expect(groups.map((g) => g.area)).toEqual(["Uro", "Gastro", "Neuro"]);
  });

  it("orders subareas by first appearance, not alphabetically", () => {
    const masks = [mask("a", "X", "Zebra"), mask("b", "X", "Alfa")];
    expect(groupMasksByArea(masks, ["X"])[0].subareas.map((s) => s.name)).toEqual([
      "Zebra",
      "Alfa",
    ]);
  });

  it("lists an empty area so masks can still be added to it", () => {
    const groups = groupMasksByArea([], ["Vazia"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].masks).toEqual([]);
    expect(groups[0].subareas).toEqual([]);
  });

  it("appends areas that only masks reference, so none goes missing", () => {
    const masks = [mask("orphan", "Removida", "Sub")];
    const groups = groupMasksByArea(masks, ["Gastro"]);
    expect(groups.map((g) => g.area)).toEqual(["Gastro", "Removida"]);
    expect(groups[1].masks.map((m) => m.id)).toEqual(["orphan"]);
  });

  it("gathers masks without a subarea under one empty-named group", () => {
    const masks = [mask("a", "X", ""), mask("b", "X", "")];
    const groups = groupMasksByArea(masks, ["X"]);
    expect(groups[0].subareas).toHaveLength(1);
    expect(groups[0].subareas[0].name).toBe("");
    expect(groups[0].subareas[0].masks).toHaveLength(2);
  });
});

describe("allGroupKeys", () => {
  it("returns a key for every area and subarea", () => {
    const masks = [mask("a", "Gastro", "Esôfago"), mask("b", "Gastro", "Cólon")];
    const keys = allGroupKeys(groupMasksByArea(masks, ["Gastro"]));
    expect(keys).toEqual([
      "Gastro",
      subareaKey("Gastro", "Esôfago"),
      subareaKey("Gastro", "Cólon"),
    ]);
  });

  it("keeps areas with the same subarea name apart", () => {
    expect(subareaKey("Gastro", "Outros")).not.toBe(subareaKey("Uro", "Outros"));
  });
});
