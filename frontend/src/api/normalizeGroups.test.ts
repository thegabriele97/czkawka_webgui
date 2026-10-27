import { describe, expect, it } from "vitest";
import { normalizeGroups } from "./normalizeGroups";

describe("normalizeGroups", () => {
  it("returns [] for falsy results", () => {
    expect(normalizeGroups(null, false)).toEqual([]);
    expect(normalizeGroups(undefined, false)).toEqual([]);
  });

  it("flattens the size-keyed duplicates shape (no reference)", () => {
    // Duplicates: object keyed by size, each value a *list* of groups.
    const result = {
      "1024": [[{ path: "/b.txt" }, { path: "/a.txt" }]],
      "2048": [[{ path: "/d.txt" }, { path: "/c.txt" }]],
    };
    const groups = normalizeGroups(result, false);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.reference === null)).toBe(true);
    // Members sorted by path within a group, groups sorted by anchor path.
    expect(groups[0].members.map((m) => m.path)).toEqual(["/a.txt", "/b.txt"]);
    expect(groups[1].members.map((m) => m.path)).toEqual(["/c.txt", "/d.txt"]);
  });

  it("handles the flat-array shape used by similar images/videos", () => {
    const result = [
      [{ path: "/z.jpg" }, { path: "/y.jpg" }],
      [{ path: "/m.jpg" }],
    ];
    const groups = normalizeGroups(result, false);
    expect(groups.map((g) => g.members[0].path)).toEqual(["/m.jpg", "/y.jpg"]);
  });

  it("splits [reference, members[]] tuples when a reference folder was used", () => {
    const result = [
      [{ path: "/ref/keep.jpg" }, [{ path: "/dup/b.jpg" }, { path: "/dup/a.jpg" }]],
    ];
    const groups = normalizeGroups(result, true);
    expect(groups).toHaveLength(1);
    expect(groups[0].reference?.path).toBe("/ref/keep.jpg");
    expect(groups[0].members.map((m) => m.path)).toEqual(["/dup/a.jpg", "/dup/b.jpg"]);
  });

  it("produces a stable order regardless of input order", () => {
    const a = normalizeGroups([[{ path: "/b" }], [{ path: "/a" }]], false);
    const b = normalizeGroups([[{ path: "/a" }], [{ path: "/b" }]], false);
    expect(a).toEqual(b);
  });
});
