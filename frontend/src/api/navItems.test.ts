import { describe, expect, it } from "vitest";
import { buildNavItems } from "./navItems";
import type { Group } from "./types";

describe("buildNavItems", () => {
  it("is empty for no groups", () => {
    expect(buildNavItems([])).toEqual([]);
  });

  it("places a gap between groups but not after the last", () => {
    const groups: Group[] = [
      { reference: null, members: [{ path: "/a" }, { path: "/b" }] },
      { reference: null, members: [{ path: "/c" }] },
    ];
    const items = buildNavItems(groups);
    expect(items.map((i) => (i.kind === "entry" ? i.entry.path : "GAP"))).toEqual(["/a", "/b", "GAP", "/c"]);
  });

  it("emits the reference first within a group", () => {
    const groups: Group[] = [{ reference: { path: "/ref" }, members: [{ path: "/m" }] }];
    const items = buildNavItems(groups);
    expect(items.map((i) => (i.kind === "entry" ? i.entry.path : "GAP"))).toEqual(["/ref", "/m"]);
  });
});
