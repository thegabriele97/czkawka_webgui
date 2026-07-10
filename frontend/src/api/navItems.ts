import type { FileEntryLike, Group } from "./types";

export type NavItem = { kind: "entry"; entry: FileEntryLike } | { kind: "gap" };

/** Flattens every group into one keyboard-navigable sequence: each group's
 * reference (if any) then its members, with a `gap` marker between groups -
 * arrowing onto a gap clears the preview for a beat, marking the boundary
 * between one group and the next instead of jumping straight across it. */
export function buildNavItems(groups: Group[]): NavItem[] {
  const items: NavItem[] = [];
  groups.forEach((group, index) => {
    if (group.reference) items.push({ kind: "entry", entry: group.reference });
    for (const member of group.members) items.push({ kind: "entry", entry: member });
    if (index < groups.length - 1) items.push({ kind: "gap" });
  });
  return items;
}
