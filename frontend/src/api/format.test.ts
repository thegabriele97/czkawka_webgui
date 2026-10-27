import { describe, expect, it } from "vitest";
import { baseName, dirName, formatDuration, formatSize, sizeOf, stripBidiIsolates } from "./format";

describe("formatSize", () => {
  it("returns empty string for undefined", () => {
    expect(formatSize(undefined)).toBe("");
  });

  it("formats bytes below 1 KiB as plain bytes", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(1023)).toBe("1023 B");
  });

  it("scales up through the binary units including TiB", () => {
    expect(formatSize(1024)).toBe("1.0 KiB");
    expect(formatSize(1536)).toBe("1.5 KiB");
    expect(formatSize(1024 ** 2)).toBe("1.0 MiB");
    expect(formatSize(1024 ** 3)).toBe("1.0 GiB");
    expect(formatSize(1024 ** 4)).toBe("1.0 TiB");
    // Stays in TiB rather than inventing a PiB unit.
    expect(formatSize(1024 ** 5)).toBe("1024.0 TiB");
  });
});

describe("formatDuration", () => {
  it("returns empty string for undefined", () => {
    expect(formatDuration(undefined)).toBe("");
  });

  it("formats seconds as m:ss with zero-padding", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(600)).toBe("10:00");
  });
});

describe("baseName / dirName", () => {
  it("splits a normal path", () => {
    expect(baseName("/data/photos/a.jpg")).toBe("a.jpg");
    expect(dirName("/data/photos/a.jpg")).toBe("/data/photos");
  });

  it("handles a top-level path", () => {
    expect(baseName("/a.jpg")).toBe("a.jpg");
    expect(dirName("/a.jpg")).toBe("/");
  });

  it("falls back to the whole string with no slash", () => {
    expect(baseName("a.jpg")).toBe("a.jpg");
    expect(dirName("a.jpg")).toBe("/");
  });
});

describe("sizeOf", () => {
  it("reads a numeric size, defaults to 0 otherwise", () => {
    expect(sizeOf({ size: 42 })).toBe(42);
    expect(sizeOf({})).toBe(0);
    expect(sizeOf({ size: undefined })).toBe(0);
  });
});

describe("stripBidiIsolates", () => {
  it("removes the U+2066..U+2069 marks czkawka wraps paths in", () => {
    expect(stripBidiIsolates("⁦/data/x⁩ skipped")).toBe("/data/x skipped");
  });

  it("leaves ordinary text untouched", () => {
    expect(stripBidiIsolates("Scanning 50%")).toBe("Scanning 50%");
  });
});
