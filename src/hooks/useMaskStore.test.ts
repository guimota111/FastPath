// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { Mask } from "@/lib/types";
import { useMaskStore } from "./useMaskStore";

const mask = (id: string, area: string, category = "Sub"): Mask => ({
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

/** Start each test from a known, tiny state instead of the shipped seeds. */
beforeEach(() => {
  useMaskStore.setState({
    masks: [mask("m1", "Gastro"), mask("m2", "Gastro"), mask("m3", "Uro")],
    areas: ["Gastro", "Uro"],
  });
});

describe("addArea", () => {
  it("appends a new area", () => {
    useMaskStore.getState().addArea("Neuro");
    expect(useMaskStore.getState().areas).toEqual(["Gastro", "Uro", "Neuro"]);
  });

  it("ignores blank names and duplicates", () => {
    useMaskStore.getState().addArea("   ");
    useMaskStore.getState().addArea("Gastro");
    expect(useMaskStore.getState().areas).toEqual(["Gastro", "Uro"]);
  });

  it("trims the name so it matches what masks store", () => {
    useMaskStore.getState().addArea("  Masto  ");
    expect(useMaskStore.getState().areas).toContain("Masto");
  });
});

describe("renameArea", () => {
  it("renames the area and moves its masks with it", () => {
    useMaskStore.getState().renameArea("Gastro", "Digestivo");
    const { areas, masks } = useMaskStore.getState();
    expect(areas).toEqual(["Digestivo", "Uro"]);
    expect(masks.filter((m) => m.area === "Digestivo")).toHaveLength(2);
    expect(masks.filter((m) => m.area === "Gastro")).toHaveLength(0);
  });

  it("keeps the area in place in the list", () => {
    useMaskStore.getState().renameArea("Gastro", "Digestivo");
    expect(useMaskStore.getState().areas[0]).toBe("Digestivo");
  });

  it("refuses a name that would collide with another area", () => {
    useMaskStore.getState().renameArea("Gastro", "Uro");
    expect(useMaskStore.getState().areas).toEqual(["Gastro", "Uro"]);
    expect(useMaskStore.getState().masks.filter((m) => m.area === "Uro")).toHaveLength(1);
  });

  it("ignores a blank name", () => {
    useMaskStore.getState().renameArea("Gastro", "  ");
    expect(useMaskStore.getState().areas).toEqual(["Gastro", "Uro"]);
  });
});

describe("deleteArea", () => {
  it("removes the area and the masks filed under it", () => {
    useMaskStore.getState().deleteArea("Gastro");
    const { areas, masks } = useMaskStore.getState();
    expect(areas).toEqual(["Uro"]);
    expect(masks.map((m) => m.id)).toEqual(["m3"]);
  });

  it("lets the user delete every area", () => {
    useMaskStore.getState().deleteArea("Gastro");
    useMaskStore.getState().deleteArea("Uro");
    expect(useMaskStore.getState().areas).toEqual([]);
    expect(useMaskStore.getState().masks).toEqual([]);
  });

  it("leaves other areas untouched", () => {
    useMaskStore.getState().deleteArea("Uro");
    expect(useMaskStore.getState().masks.map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});

describe("upsertMask", () => {
  it("creates the area a new mask points at", () => {
    useMaskStore.getState().upsertMask(mask("m4", "Dermato"));
    expect(useMaskStore.getState().areas).toContain("Dermato");
  });

  it("does not duplicate an area that already exists", () => {
    useMaskStore.getState().upsertMask(mask("m4", "Gastro"));
    expect(useMaskStore.getState().areas.filter((a) => a === "Gastro")).toHaveLength(1);
  });

  it("replaces a mask with the same id instead of adding a copy", () => {
    useMaskStore.getState().upsertMask({ ...mask("m1", "Gastro"), name: "renomeada" });
    const { masks } = useMaskStore.getState();
    expect(masks).toHaveLength(3);
    expect(masks.find((m) => m.id === "m1")?.name).toBe("renomeada");
  });
});
