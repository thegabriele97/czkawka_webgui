import type { MouseEvent as ReactMouseEvent } from "react";
import { api } from "../api/client";
import { mediaKindOf } from "../api/mediaKind";

interface MediaThumbProps {
  path: string;
  /** Size variant class: "cell-thumb" (table) or "rcard-thumb" (card). */
  className: string;
  isReference?: boolean;
  bestReason?: string;
  /** Opens the full-size overlay; the click is kept from also selecting the row. */
  onOpen: () => void;
}

/** A tiny preview shown in the results (table cell or mobile card). Images
 * load directly, videos use the backend's single-frame thumbnail endpoint,
 * anything else falls back to a dash placeholder. The REF / suggested-keep
 * markers are overlaid on the corners so they don't push the file name and
 * every name in the column stays aligned. Clicking opens the overlay. */
export function MediaThumb({ path, className, isReference, bestReason, onOpen }: MediaThumbProps) {
  const kind = mediaKindOf(path);
  const src = kind === "image" ? api.mediaUrl(path) : kind === "video" ? api.thumbnailUrl(path) : null;

  function handleClick(e: ReactMouseEvent) {
    e.stopPropagation();
    onOpen();
  }

  return (
    <span className={`thumb ${className}`} onClick={handleClick}>
      {src ? <img src={src} alt="" loading="lazy" /> : <span className="thumb-none">—</span>}
      {isReference && <span className="thumb-ref">REF</span>}
      {bestReason && (
        <span className="thumb-star" title={`Suggested keep: ${bestReason}`}>
          ★
        </span>
      )}
    </span>
  );
}
