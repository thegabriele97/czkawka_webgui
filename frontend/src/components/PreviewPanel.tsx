import { api } from "../api/client";
import { useDataRoot } from "../api/DataRootContext";
import { displayPath } from "../api/displayPath";
import { mediaKindOf } from "../api/mediaKind";
import type { FileEntryLike } from "../api/types";

interface PreviewPanelProps {
  entry: FileEntryLike | null;
  onOpen: (entry: FileEntryLike) => void;
}

/** Sticky right-hand preview, czkawka_gui-style: shows whichever row is
 * currently selected in the results table. Clicking the preview (like
 * clicking a thumbnail) opens the full-size overlay. */
export function PreviewPanel({ entry, onOpen }: PreviewPanelProps) {
  const dataRoot = useDataRoot();

  if (!entry) {
    return (
      <aside className="preview-panel preview-panel-empty">
        <p>Select a file to see its preview.</p>
      </aside>
    );
  }

  const kind = mediaKindOf(entry.path);

  return (
    <aside className="preview-panel">
      {kind === "image" && <img className="preview-media" src={api.mediaUrl(entry.path)} alt={entry.path} onClick={() => onOpen(entry)} />}
      {/* Static thumbnail only - actual playback is reserved for the overlay. */}
      {kind === "video" && <img className="preview-media" src={api.thumbnailUrl(entry.path)} alt={entry.path} onClick={() => onOpen(entry)} />}
      {kind === "other" && <div className="preview-media preview-generic">{entry.path.split("/").pop()}</div>}
      <p className="preview-path">{displayPath(entry.path, dataRoot)}</p>
      <p className="preview-hint">Click the preview to enlarge{kind === "video" ? "/play" : ""}.</p>
    </aside>
  );
}
