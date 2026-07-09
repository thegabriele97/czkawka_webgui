import { api } from "../api/client";
import { useDataRoot } from "../api/DataRootContext";
import { displayPath } from "../api/displayPath";
import { mediaKindOf } from "../api/mediaKind";
import type { FileEntryLike } from "../api/types";
import { useEscapeKey } from "../hooks/useEscapeKey";

interface PreviewOverlayProps {
  entry: FileEntryLike;
  onClose: () => void;
}

/** Full-size preview opened on double click, czkawka_gui-style: a bigger
 * image, or a playing video. Closes on click outside or Escape. */
export function PreviewOverlay({ entry, onClose }: PreviewOverlayProps) {
  const kind = mediaKindOf(entry.path);
  const dataRoot = useDataRoot();
  useEscapeKey(onClose);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="preview-overlay" onClick={(e) => e.stopPropagation()}>
        {kind === "image" && <img className="preview-overlay-media" src={api.mediaUrl(entry.path)} alt={entry.path} />}
        {kind === "video" && <video className="preview-overlay-media" src={api.mediaUrl(entry.path)} controls autoPlay />}
        {kind === "other" && <p>No preview available for this file.</p>}
        <p className="preview-path">{displayPath(entry.path, dataRoot)}</p>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
