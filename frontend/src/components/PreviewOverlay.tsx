import { useEffect, useRef } from "react";
import { api } from "../api/client";
import { useDataRoot } from "../api/DataRootContext";
import { displayPath } from "../api/displayPath";
import { mediaKindOf } from "../api/mediaKind";
import type { FileEntryLike } from "../api/types";
import { useEscapeKey } from "../hooks/useEscapeKey";

interface PreviewOverlayProps {
  entry: FileEntryLike;
  onClose: () => void;
  // null at the ends of the sequence - the corresponding arrow is hidden.
  onPrev?: (() => void) | null;
  onNext?: (() => void) | null;
}

const SWIPE_THRESHOLD_PX = 50;

/** Full-size preview opened on double click, czkawka_gui-style: a bigger
 * image, or a playing video. Closes on click outside or Escape. Prev/next
 * (arrows, ArrowLeft/Right, and swipe on images) walk the same result
 * sequence as the desktop up/down keys, so on mobile you can flick between
 * candidates in place instead of closing and reopening the overlay. */
export function PreviewOverlay({ entry, onClose, onPrev, onNext }: PreviewOverlayProps) {
  const kind = mediaKindOf(entry.path);
  const dataRoot = useDataRoot();
  useEscapeKey(onClose);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onPrev, onNext]);

  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // Swipe only on images: a video keeps its own controls (a horizontal drag
  // on the scrubber shouldn't also flip the media).
  const swipeHandlers =
    kind === "image"
      ? {
          onTouchStart: (e: React.TouchEvent) => {
            touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          },
          onTouchEnd: (e: React.TouchEvent) => {
            const start = touchStart.current;
            touchStart.current = null;
            if (!start) return;
            const dx = e.changedTouches[0].clientX - start.x;
            const dy = e.changedTouches[0].clientY - start.y;
            if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return;
            if (dx < 0) onNext?.();
            else onPrev?.();
          },
        }
      : {};

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="preview-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="preview-overlay-stage" {...swipeHandlers}>
          {onPrev && (
            <button className="preview-overlay-nav prev" onClick={onPrev} aria-label="Previous">
              ‹
            </button>
          )}
          {kind === "image" && <img className="preview-overlay-media" src={api.mediaUrl(entry.path)} alt={entry.path} />}
          {kind === "video" && <video className="preview-overlay-media" src={api.mediaUrl(entry.path)} controls autoPlay />}
          {kind === "other" && <p>No preview available for this file.</p>}
          {onNext && (
            <button className="preview-overlay-nav next" onClick={onNext} aria-label="Next">
              ›
            </button>
          )}
        </div>
        <p className="preview-path">{displayPath(entry.path, dataRoot)}</p>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
