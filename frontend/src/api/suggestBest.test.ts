import { describe, expect, it } from "vitest";
import { suggestBest } from "./suggestBest";

describe("suggestBest", () => {
  it("returns null when fewer than two entries carry a resolution", () => {
    expect(suggestBest([{ path: "/a" }, { path: "/b" }])).toBeNull();
    expect(suggestBest([{ path: "/a", width: 10, height: 10 }, { path: "/b" }])).toBeNull();
  });

  it("prefers the highest resolution", () => {
    const best = suggestBest([
      { path: "/small", width: 100, height: 100 },
      { path: "/big", width: 400, height: 300 },
    ]);
    expect(best?.path).toBe("/big");
    expect(best?.reason).toContain("resolution");
  });

  it("breaks a resolution tie by bitrate", () => {
    const best = suggestBest([
      { path: "/lowbr", width: 200, height: 200, bitrate: 1_000_000 },
      { path: "/highbr", width: 200, height: 200, bitrate: 5_000_000 },
    ]);
    expect(best?.path).toBe("/highbr");
    expect(best?.reason).toContain("bitrate");
  });

  it("falls back to largest file size with no bitrate", () => {
    const best = suggestBest([
      { path: "/small", width: 200, height: 200, size: 1000 },
      { path: "/large", width: 200, height: 200, size: 9000 },
    ]);
    expect(best?.path).toBe("/large");
    expect(best?.reason).toContain("file size");
  });

  it("returns null on a true tie (same resolution, no tiebreaker)", () => {
    expect(
      suggestBest([
        { path: "/a", width: 200, height: 200 },
        { path: "/b", width: 200, height: 200 },
      ]),
    ).toBeNull();
  });
});
