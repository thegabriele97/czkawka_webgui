import type { FileEntryLike } from "./types";

/** A mild, best-effort hint about which file in a group is probably worth
 * keeping - based purely on technical metadata, nothing about content.
 * Resolution first (more pixels = more detail), then bitrate/file size as
 * a tiebreaker at the same resolution (less compression, usually). Only
 * meaningful for similar-images/similar-videos, where files genuinely
 * differ - duplicates are byte-identical, so there's nothing to prefer. */

function resolutionOf(entry: FileEntryLike): number {
  const width = entry.width as number | undefined;
  const height = entry.height as number | undefined;
  return width && height ? width * height : 0;
}

function qualityTiebreakerOf(entry: FileEntryLike): number {
  return (entry.bitrate as number | undefined) ?? (entry.size as number | undefined) ?? 0;
}

function compareEntries(a: FileEntryLike, b: FileEntryLike): number {
  const resDiff = resolutionOf(b) - resolutionOf(a);
  if (resDiff !== 0) return resDiff;
  return qualityTiebreakerOf(b) - qualityTiebreakerOf(a);
}

export interface BestGuess {
  path: string;
  reason: string;
}

export function suggestBest(entries: FileEntryLike[]): BestGuess | null {
  const withResolution = entries.filter((e) => resolutionOf(e) > 0);
  if (withResolution.length < 2) return null;

  const [best, runnerUp] = [...withResolution].sort(compareEntries);
  if (compareEntries(best, runnerUp) === 0) return null; // true tie - no honest pick

  if (resolutionOf(best) > resolutionOf(runnerUp)) {
    return { path: best.path, reason: `Highest resolution (${best.width}×${best.height})` };
  }
  if (typeof best.bitrate === "number") {
    return { path: best.path, reason: `Same resolution, highest bitrate (${Math.round((best.bitrate as number) / 1000)} kbps)` };
  }
  return { path: best.path, reason: "Same resolution, largest file size (usually less compressed)" };
}
