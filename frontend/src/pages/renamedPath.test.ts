import { describe, expect, it } from "vitest";
import { renamedPath } from "./BadExtensionsPage";

describe("renamedPath", () => {
  it("swaps the extension keeping folder and base name", () => {
    expect(renamedPath("/data/photo.txt", "jpg")).toBe("/data/photo.jpg");
  });

  it("adds an extension to a file that has none", () => {
    expect(renamedPath("/data/photo", "jpg")).toBe("/data/photo.jpg");
  });

  it("does not treat a dot in a parent folder as the extension", () => {
    expect(renamedPath("/data/v1.0/clip", "mp4")).toBe("/data/v1.0/clip.mp4");
  });

  it("replaces only the final extension of a multi-dot name", () => {
    expect(renamedPath("/data/archive.tar.gz", "zip")).toBe("/data/archive.tar.zip");
  });
});
