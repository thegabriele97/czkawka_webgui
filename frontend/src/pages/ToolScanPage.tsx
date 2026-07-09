import { useEffect, useState } from "react";
import { api } from "../api/client";
import { normalizeGroups } from "../api/normalizeGroups";
import type { FileEntryLike, FolderEntry, ScanOut, Tool } from "../api/types";
import { PreviewOverlay } from "../components/PreviewOverlay";
import { PreviewPanel } from "../components/PreviewPanel";
import { ProgressBar } from "../components/ProgressBar";
import { ResultsTable, type ExtraColumn } from "../components/ResultsTable";

export interface ToolConfig {
  tool: Tool;
  title: string;
  supportsReference: boolean;
  supportsMaxDifference: boolean;
  supportsTolerance: boolean;
  extraColumns: ExtraColumn[];
}

interface ToolScanPageProps {
  config: ToolConfig;
  folders: FolderEntry[];
  onOperationsQueued: () => void;
}

/** Shared page for every tool that produces comparable groups (duplicates,
 * similar images, similar videos): run a scan against the globally selected
 * folders, review the results as czkawka_gui-style row tables with a
 * sticky preview panel, queue delete/hardlink decisions. Bad Extensions is
 * deliberately not built on this - it's a flat list to look at, not a
 * compare-and-decide workflow. */
export function ToolScanPage({ config, folders, onOperationsQueued }: ToolScanPageProps) {
  const [maxDifference, setMaxDifference] = useState(5);
  const [tolerance, setTolerance] = useState(10);
  const [scan, setScan] = useState<ScanOut | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FileEntryLike | null>(null);
  const [opened, setOpened] = useState<FileEntryLike | null>(null);
  // Whether the *currently displayed* scan was run with a reference folder -
  // frozen at scan-start time. Folders (and their reference tick) can keep
  // changing live while old results are still on screen, and scan.result's
  // shape depends on what reference mode was used *when that scan ran*, not
  // on whatever the folder panel happens to show right now.
  const [scanUsedReference, setScanUsedReference] = useState(false);

  const directories = folders.filter((f) => !f.isReference).map((f) => f.path);
  const referenceDirectories = config.supportsReference ? folders.filter((f) => f.isReference).map((f) => f.path) : [];

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
    setSelected(null);
    setScanUsedReference(referenceDirectories.length > 0);
    try {
      const created = await api.createScan({
        tool: config.tool,
        directories,
        reference_directories: referenceDirectories,
        max_difference: maxDifference,
        tolerance,
      });
      setScan(created);
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  }

  const groups = scan?.status === "done" ? normalizeGroups(scan.result, scanUsedReference) : [];

  return (
    <div className="page">
      <h2>{config.title}</h2>

      <section className="scan-controls">
        {config.supportsMaxDifference && (
          <label className="option">
            Max difference (0-40):
            <input type="number" min={0} max={40} value={maxDifference} onChange={(e) => setMaxDifference(Number(e.target.value))} />
          </label>
        )}
        {config.supportsTolerance && (
          <label className="option">
            Tolerance (0-20):
            <input type="number" min={0} max={20} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
          </label>
        )}

        <button className="primary" onClick={startScan} disabled={directories.length === 0 || starting || scan?.status === "running"}>
          Start scan
        </button>
        {directories.length === 0 && <p className="hint">Add at least one folder above to get started.</p>}
      </section>

      {error && <p className="error">{error}</p>}
      {scan?.status === "running" && <ProgressBar label={scan.progress_label} percent={scan.progress_all} />}
      {scan?.status === "error" && <p className="error">Error: {scan.error_message}</p>}

      {scan?.status === "done" && (
        <section className="results-layout" onClick={() => setSelected(null)}>
          <div className="results-list">
            <h3>Results ({groups.length} groups)</h3>
            {groups.length === 0 && <p>No results.</p>}
            {groups.length > 0 && (
              <ResultsTable
                category={config.tool}
                groups={groups}
                extraColumns={config.extraColumns}
                selectedPath={selected?.path ?? null}
                onSelect={setSelected}
                onOpen={setOpened}
                onQueued={onOperationsQueued}
              />
            )}
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <PreviewPanel entry={selected} />
          </div>
        </section>
      )}

      {opened && <PreviewOverlay entry={opened} onClose={() => setOpened(null)} />}
    </div>
  );
}
