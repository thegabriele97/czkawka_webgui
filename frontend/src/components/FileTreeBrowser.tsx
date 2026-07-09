import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useDataRoot } from "../api/DataRootContext";
import { displayPath } from "../api/displayPath";
import type { BrowseEntry } from "../api/types";
import { useEscapeKey } from "../hooks/useEscapeKey";

interface FileTreeBrowserProps {
  title: string;
  onPick: (path: string) => void;
  onClose: () => void;
}

/** A minimal folder navigator scoped to whatever the backend mounts under
 * DATA_ROOT. Lets the user drill into subfolders and pick the one they're
 * currently looking at. */
export function FileTreeBrowser({ title, onPick, onClose }: FileTreeBrowserProps) {
  // Breadcrumb stack instead of string-slicing paths: DATA_ROOT's absolute
  // location isn't known client-side, so "go up" has to mean "pop the last
  // folder we navigated into," not "strip a path segment."
  const [history, setHistory] = useState<string[]>([""]);
  const currentPath = history[history.length - 1];
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const dataRoot = useDataRoot();

  useEffect(() => {
    let cancelled = false;
    api
      .browse(currentPath)
      .then((result) => {
        if (!cancelled) {
          setEntries(result);
          setError(null);
        }
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [currentPath]);

  useEscapeKey(onClose);

  const folderEntries = entries.filter((e) => e.is_dir);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="current-path">{displayPath(currentPath, dataRoot) || "/"}</p>
        <p className="item-count">
          {entries.length} item{entries.length === 1 ? "" : "s"}
        </p>
        {error && <p className="error">{error}</p>}
        <ul className="folder-list">
          {history.length > 1 && (
            <li>
              <button className="link-button" onClick={() => setHistory((h) => h.slice(0, -1))}>
                .. (up)
              </button>
            </li>
          )}
          {folderEntries.map((entry) => (
            <li key={entry.path}>
              <button className="link-button" onClick={() => setHistory((h) => [...h, entry.path])}>
                📁 {entry.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button onClick={() => onPick(currentPath)} disabled={!currentPath}>
            Select this folder
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
