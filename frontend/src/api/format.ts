/** Formatting helpers shared across the UI. Kept in one place so size/date
 * rendering and path splitting stay consistent between the results table,
 * the reclaim summary, the bad-extensions list, and the previews. */

const SIZE_UNITS = ["KiB", "MiB", "GiB", "TiB"];

export function formatSize(bytes?: number): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${SIZE_UNITS[unitIndex]}`;
}

export function formatDate(unixSeconds?: number): string {
  if (unixSeconds === undefined) return "";
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

export function formatDuration(seconds?: number): string {
  if (seconds === undefined) return "";
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

export function dirName(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : "/";
}

export function sizeOf(entry: { size?: number }): number {
  return typeof entry.size === "number" ? entry.size : 0;
}

/** czkawka_core wraps paths it mentions (in progress labels and warnings) in
 * Unicode bidi isolates (U+2066–U+2069), which render as stray boxes. */
const BIDI_ISOLATES = /[⁦-⁩]/g;

export function stripBidiIsolates(text: string): string {
  return text.replace(BIDI_ISOLATES, "");
}
