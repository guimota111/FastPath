// FastPath - Grouping masks for the library: area, then subarea.
//
// The subarea is the mask's `category`. Both levels keep the order they first
// appear in rather than sorting alphabetically, so the library reflects the
// order the user built things in.

import type { Mask } from "./types";

export interface SubareaGroup {
  /** Empty string means the mask has no subarea of its own. */
  name: string;
  masks: Mask[];
}

export interface AreaGroup {
  area: string;
  masks: Mask[];
  subareas: SubareaGroup[];
}

/**
 * Group masks under `areas`, in that order. Any area still referenced by a mask
 * but missing from the list is appended, so deleting an area from the list can
 * never leave masks invisible.
 */
export function groupMasksByArea(masks: Mask[], areas: string[]): AreaGroup[] {
  const names = [...areas];
  for (const mask of masks) {
    if (mask.area && !names.includes(mask.area)) names.push(mask.area);
  }

  return names.map((area) => {
    const inArea = masks.filter((m) => m.area === area);
    const order: string[] = [];
    for (const mask of inArea) {
      const sub = mask.category ?? "";
      if (!order.includes(sub)) order.push(sub);
    }
    return {
      area,
      masks: inArea,
      subareas: order.map((name) => ({
        name,
        masks: inArea.filter((m) => (m.category ?? "") === name),
      })),
    };
  });
}

/** Collapse keys for every area and subarea, used by "collapse all". */
export function allGroupKeys(groups: AreaGroup[]): string[] {
  return groups.flatMap((g) => [g.area, ...g.subareas.map((s) => subareaKey(g.area, s.name))]);
}

export function subareaKey(area: string, subarea: string): string {
  return `${area}/${subarea}`;
}
