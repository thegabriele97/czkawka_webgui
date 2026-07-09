import type { FileEntryLike, Group } from "./types";

/** Duplicates come back as an object keyed by size, where each value is
 * itself a *list* of groups sharing that size (there can be more than one
 * distinct hash-group per size bucket) - so it needs one `.flat()` to reach
 * the actual list of groups. Similar-images/videos come back as a plain
 * array of groups already, no extra nesting. Either way, each group is
 * either a flat list of entries (no reference folder was used) or a
 * `[reference, members[]]` tuple (a reference folder was used) - this
 * normalizes both shapes into one `Group[]` the UI can render the same way
 * regardless of tool or reference mode. */
/** czkawka_core collects matches with a hash map internally, so group order
 * (and sometimes the order of files within a group) isn't stable between
 * two scans of the very same folders - rescanning can shuffle everything
 * around for no reason the user did anything. Sorting by path here makes
 * the displayed order deterministic and repeatable regardless of that. */
function sortGroups(groups: Group[]): Group[] {
  for (const group of groups) {
    group.members.sort((a, b) => a.path.localeCompare(b.path));
  }
  return groups.sort((a, b) => {
    const anchorA = a.reference?.path ?? a.members[0]?.path ?? "";
    const anchorB = b.reference?.path ?? b.members[0]?.path ?? "";
    return anchorA.localeCompare(anchorB);
  });
}

export function normalizeGroups(result: unknown, hasReference: boolean): Group[] {
  if (!result) return [];
  const rawGroups: unknown[] = Array.isArray(result) ? result : Object.values(result as Record<string, unknown>).flat();

  const groups = rawGroups.map((rawGroup): Group => {
    if (hasReference) {
      const [reference, members] = rawGroup as [FileEntryLike, FileEntryLike[]];
      return { reference, members };
    }
    return { reference: null, members: rawGroup as FileEntryLike[] };
  });

  return sortGroups(groups);
}
