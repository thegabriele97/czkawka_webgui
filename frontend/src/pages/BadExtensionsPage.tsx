import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useDataRoot } from "../api/DataRootContext";
import { displayPath } from "../api/displayPath";
import type { FolderEntry, ScanOut } from "../api/types";
import { ProgressBar } from "../components/ProgressBar";
import { ScanWarnings } from "../components/ScanWarnings";

interface BadExtensionEntry {
  path: string;
  current_extension?: string;
  proper_extension?: string;
  proper_extensions_group?: string;
  [extra: string]: unknown;
}

interface BadExtensionsPageProps {
  folders: FolderEntry[];
  onOperationsQueued: () => void;
}

/** The path this file would get with the extension czkawka suggests -
 * same folder, same base name, only the extension swapped (a file with no
 * extension at all just gains one). */
function renamedPath(path: string, properExtension: string): string {
  const lastSlash = path.lastIndexOf("/");
  const lastDot = path.lastIndexOf(".");
  const base = lastDot > lastSlash ? path.slice(0, lastDot) : path;
  return `${base}.${properExtension}`;
}

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

/** A flat list rather than a compare-and-decide workflow (that's
 * ToolScanPage's job), but the one action it does offer - renaming a file
 * to the extension its actual content implies - goes through the same
 * pending queue as every other destructive action. Scans every globally
 * selected folder regardless of its reference tick: that concept doesn't
 * apply to this tool. */
export function BadExtensionsPage({ folders, onOperationsQueued }: BadExtensionsPageProps) {
  const [scan, setScan] = useState<ScanOut | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Seeded from the backend, not just from local clicks, so a rename queued
  // before a reload is still recognized as queued.
  const [queuedByPath, setQueuedByPath] = useState<Record<string, number>>({});
  const dataRoot = useDataRoot();

  const directories = folders.map((f) => f.path);

  // Reattach to whatever scan was last run - the backend keeps it going in
  // the background regardless of whether anyone's watching, so a page
  // reload shouldn't make it look like nothing is happening.
  useEffect(() => {
    api
      .getLatestScan("bad_extensions")
      .then((latest) => {
        if (latest) setScan(latest);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .listOperations("bad_extensions")
      .then((ops) => {
        if (cancelled) return;
        setQueuedByPath(Object.fromEntries(ops.map((op) => [op.src_path, op.id])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!scan || scan.status !== "running") return;
    const interval = setInterval(() => {
      api.getScan(scan.id).then(setScan).catch(() => undefined);
    }, 1000);
    return () => clearInterval(interval);
  }, [scan?.id, scan?.status]);

  async function startScan() {
    setError(null);
    setStarting(true);
    try {
      const created = await api.createScan({ tool: "bad_extensions", directories });
      setScan(created);
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  }

  async function stopScan() {
    if (!scan) return;
    setStopping(true);
    try {
      setScan(await api.stopScan(scan.id));
    } catch (e) {
      setError(String(e));
    } finally {
      setStopping(false);
    }
  }

  async function queueRename(entry: BadExtensionEntry, target: string) {
    try {
      const op = await api.createOperation({
        category: "bad_extensions",
        op_type: "rename",
        src_path: entry.path,
        dst_path: target,
      });
      setQueuedByPath((prev) => ({ ...prev, [entry.path]: op.id }));
      onOperationsQueued();
    } catch (e) {
      setError(String(e));
    }
  }

  async function unqueue(path: string) {
    const id = queuedByPath[path];
    if (id === undefined) return;
    await api.deleteOperation(id);
    setQueuedByPath((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
    onOperationsQueued();
  }

  const entries = (scan?.status === "done" ? (scan.result as BadExtensionEntry[] | null) : null) ?? [];

  return (
    <div className="page">
      <h2>Bad Extensions</h2>

      <section className="scan-controls">
        <button className="primary" onClick={startScan} disabled={directories.length === 0 || starting || scan?.status === "running"}>
          Start scan
        </button>
        {directories.length === 0 && <p className="hint">Add at least one folder above to get started.</p>}
      </section>

      {error && <p className="error">{error}</p>}
      {scan?.status === "running" && (
        <div className="scan-progress">
          <ProgressBar label={scan.progress_label} percent={scan.progress_all} />
          <button onClick={stopScan} disabled={stopping}>
            Stop scan
          </button>
        </div>
      )}
      {scan?.status === "error" && <p className="error">Error: {scan.error_message}</p>}
      {scan?.status === "stopped" && <p className="hint">Scan stopped.</p>}
      {(scan?.status === "done" || scan?.status === "stopped") && <ScanWarnings messages={scan.messages} />}

      {scan?.status === "done" && (
        <section className="results">
          <h3>Results ({entries.length} files)</h3>
          {entries.length === 0 && <p>No files with a wrong extension.</p>}
          <table className="bad-extensions-table">
            <tbody>
              {entries.map((entry) => {
                const properExtension = entry.proper_extension ?? "";
                const target = properExtension ? renamedPath(entry.path, properExtension) : null;
                const queued = queuedByPath[entry.path] !== undefined;
                return (
                  <tr key={entry.path}>
                    <td>{displayPath(entry.path, dataRoot)}</td>
                    <td>{entry.proper_extensions_group ?? ""}</td>
                    <td className="bad-extensions-action">
                      {target && !queued && (
                        <button onClick={() => queueRename(entry, target)} title={`Rename to ${baseName(target)}`}>
                          Rename to .{properExtension}
                        </button>
                      )}
                      {queued && (
                        <>
                          <span className="queued-note">Queued</span>
                          <button className="unqueue-button" onClick={() => unqueue(entry.path)} title="Remove from the pending queue">
                            Cancel
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
