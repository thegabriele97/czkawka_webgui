import { describe, expect, it } from "vitest";
import { keptMember } from "./ResultsTable";

const files = [
  { path: "/old-small", modified_date: 100, size: 10 },
  { path: "/new-big", modified_date: 300, size: 90 },
  { path: "/mid", modified_date: 200, size: 50 },
];

describe("keptMember", () => {
  it("returns null for an empty group", () => {
    expect(keptMember([], "newest")).toBeNull();
  });

  it("keeps the newest / oldest by modified_date", () => {
    expect(keptMember(files, "newest")?.path).toBe("/new-big");
    expect(keptMember(files, "oldest")?.path).toBe("/old-small");
  });

  it("keeps the largest / smallest by size", () => {
    expect(keptMember(files, "largest")?.path).toBe("/new-big");
    expect(keptMember(files, "smallest")?.path).toBe("/old-small");
  });

  it("never silently keeps a file with missing metadata", () => {
    // The file with no date must not win 'newest' over a dated one, and must
    // win 'oldest' (unknown sorts to the losing end for a keep).
    const withGap = [{ path: "/dated", modified_date: 500 }, { path: "/undated" }];
    expect(keptMember(withGap, "newest")?.path).toBe("/dated");
    expect(keptMember(withGap, "oldest")?.path).toBe("/undated");
  });
});
