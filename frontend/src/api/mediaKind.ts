const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif", "heic"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mkv", "webm", "mov", "avi", "m4v"]);

export type MediaKind = "image" | "video" | "other";

export function mediaKindOf(path: string): MediaKind {
  const dot = path.lastIndexOf(".");
  const ext = dot === -1 ? "" : path.slice(dot + 1).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return "other";
}
