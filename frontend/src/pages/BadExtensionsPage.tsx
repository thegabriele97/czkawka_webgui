import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { FolderEntry, ScanOut } from "../api/types";
import { ProgressBar } from "../components/ProgressBar";

interface BadExtensionEntry {
  path: string;
  proper_extensions_group?: string;
  [extra: string]: unknown;
}

interface BadExtensionsPageProps {
  folders: FolderEntry[];
}

/** Read-only: this tool is a discovery step ("show me files whose content
 * doesn't match their extension"), not a compare-and-decide workflow, so
 * unlike the other 3 tools there's nothing to queue here. Scans every
 * globally selected folder regardless of its reference tick - that concept
 * doesn't apply to this tool. */
export function BadExtensionsPage({ folders }: BadExtensionsPageProps) {
  const [scan, setScan] = useState<ScanOut | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      {scan?.status === "done" && (
        <section className="results">
          <h3>Results ({entries.length} files)</h3>
          {entries.length === 0 && <p>No files with a wrong extension.</p>}
          <table className="bad-extensions-table">
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.path}>
                  <td>{entry.path}</td>
                  <td>{entry.proper_extensions_group ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
