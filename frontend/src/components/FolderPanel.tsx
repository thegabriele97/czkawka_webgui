import { useState } from "react";
import { useDataRoot } from "../api/DataRootContext";
import { displayPath } from "../api/displayPath";
import type { FolderEntry } from "../api/types";
import { FileTreeBrowser } from "./FileTreeBrowser";

interface FolderPanelProps {
  folders: FolderEntry[];
  onChange: (folders: FolderEntry[]) => void;
}

/** Persistent, global folder selection shown above every tab (czkawka_gui
 * style): one shared list, a checkbox per row to mark it as the untouchable
 * reference. Whichever tool you scan next reads directly from this list. */
export function FolderPanel({ folders, onChange }: FolderPanelProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const dataRoot = useDataRoot();

  function addFolder(path: string) {
    if (folders.some((f) => f.path === path)) return;
    onChange([...folders, { path, isReference: false }]);
  }

  function removeFolder(path: string) {
    onChange(folders.filter((f) => f.path !== path));
  }

  function toggleReference(path: string) {
    onChange(folders.map((f) => (f.path === path ? { ...f, isReference: !f.isReference } : f)));
  }

  return (
    <section className="folder-panel">
      <div className="folder-panel-header">
        <h3>Folders</h3>
        <button onClick={() => setPickerOpen(true)}>+ Add folder</button>
      </div>

      {folders.length === 0 ? (
        <p className="folder-panel-empty">No folder selected.</p>
      ) : (
        <table className="folder-table">
          <thead>
            <tr>
              <th>Folder</th>
              <th>Reference</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {folders.map((folder) => (
              <tr key={folder.path}>
                <td className="folder-path" title={folder.path}>
                  {displayPath(folder.path, dataRoot)}
                </td>
                <td>
                  <input type="checkbox" checked={folder.isReference} onChange={() => toggleReference(folder.path)} />
                </td>
                <td>
                  <button onClick={() => removeFolder(folder.path)}>remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pickerOpen && (
        <FileTreeBrowser
          title="Select folder"
          onClose={() => setPickerOpen(false)}
          onPick={(path) => {
            addFolder(path);
            setPickerOpen(false);
          }}
        />
      )}
    </section>
  );
}
