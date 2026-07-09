import { api } from "../api/client";
import { useDataRoot } from "../api/DataRootContext";
import { displayPath } from "../api/displayPath";
import { mediaKindOf } from "../api/mediaKind";
import type { FileEntryLike } from "../api/types";

interface PreviewPanelProps {
  entry: FileEntryLike | null;
}

/** Sticky right-hand preview, czkawka_gui-style: shows whichever row is
 * currently selected in the results table. */
export function PreviewPanel({ entry }: PreviewPanelProps) {
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
      {kind === "image" && <img className="preview-media" src={api.mediaUrl(entry.path)} alt={entry.path} />}
      {/* Static thumbnail only - actual playback is reserved for the double-click overlay. */}
      {kind === "video" && <img className="preview-media" src={api.thumbnailUrl(entry.path)} alt={entry.path} />}
      {kind === "other" && <div className="preview-media preview-generic">{entry.path.split("/").pop()}</div>}
      <p className="preview-path">{displayPath(entry.path, dataRoot)}</p>
      <p className="preview-hint">Double-click the row to enlarge{kind === "video" ? "/play" : ""}.</p>
    </aside>
  );
}
