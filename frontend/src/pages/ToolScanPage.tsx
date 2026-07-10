import { useEffect, useState } from "react";
import { api } from "../api/client";
import { normalizeGroups } from "../api/normalizeGroups";
import type { FileEntryLike, FolderEntry, HashAlg, HashSize, ResizeAlgorithm, ScanOut, Tool } from "../api/types";
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
  const [ignoreSameSize, setIgnoreSameSize] = useState(false);
  // Similar images only
  const [hashSize, setHashSize] = useState<HashSize>(16);
  const [hashAlg, setHashAlg] = useState<HashAlg>("gradient");
  const [resizeAlgorithm, setResizeAlgorithm] = useState<ResizeAlgorithm>("nearest");
  // Similar videos only
  const [cropDetect, setCropDetect] = useState(true);
  const [skipForwardAmount, setSkipForwardAmount] = useState(15);
  const [vidHashDuration, setVidHashDuration] = useState(10);
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

  // Pre-fill the options form with whatever was last used for this tool,
  // so the user doesn't have to re-enter them on every visit.
  useEffect(() => {
    api
      .getToolSettings(config.tool)
      .then(({ options: o }) => {
        if (typeof o.max_difference === "number") setMaxDifference(o.max_difference);
        if (typeof o.tolerance === "number") setTolerance(o.tolerance);
        if (typeof o.ignore_same_size === "boolean") setIgnoreSameSize(o.ignore_same_size);
        if (typeof o.hash_size === "number") setHashSize(o.hash_size as HashSize);
        if (typeof o.hash_alg === "string") setHashAlg(o.hash_alg as HashAlg);
        if (typeof o.resize_algorithm === "string") setResizeAlgorithm(o.resize_algorithm as ResizeAlgorithm);
        if (typeof o.crop_detect === "boolean") setCropDetect(o.crop_detect);
        if (typeof o.skip_forward_amount === "number") setSkipForwardAmount(o.skip_forward_amount);
        if (typeof o.vid_hash_duration === "number") setVidHashDuration(o.vid_hash_duration);
      })
      .catch(() => undefined);
  }, [config.tool]);

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
        ignore_same_size: ignoreSameSize,
        hash_size: hashSize,
        hash_alg: hashAlg,
        resize_algorithm: resizeAlgorithm,
        crop_detect: cropDetect,
        skip_forward_amount: skipForwardAmount,
        vid_hash_duration: vidHashDuration,
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
        {(config.supportsMaxDifference || config.supportsTolerance) && (
          <details className="options-menu">
            <summary>Scan options</summary>
            <div className="options-menu-body">
              {config.supportsMaxDifference && (
                <>
                  <label className="option">
                    Max difference (0-40):
                    <input type="number" min={0} max={40} value={maxDifference} onChange={(e) => setMaxDifference(Number(e.target.value))} />
                  </label>
                  <label className="option">
                    Hash size:
                    <select value={hashSize} onChange={(e) => setHashSize(Number(e.target.value) as HashSize)}>
                      <option value={8}>8</option>
                      <option value={16}>16</option>
                      <option value={32}>32</option>
                      <option value={64}>64</option>
                    </select>
                  </label>
                  <label className="option">
                    Hash type:
                    <select value={hashAlg} onChange={(e) => setHashAlg(e.target.value as HashAlg)}>
                      <option value="mean">Mean</option>
                      <option value="median">Median</option>
                      <option value="gradient">Gradient</option>
                      <option value="vert-gradient">Vertical gradient</option>
                      <option value="double-gradient">Double gradient</option>
                      <option value="blockhash">Blockhash</option>
                    </select>
                  </label>
                  <label className="option">
                    Resize algorithm:
                    <select value={resizeAlgorithm} onChange={(e) => setResizeAlgorithm(e.target.value as ResizeAlgorithm)}>
                      <option value="nearest">Nearest</option>
                      <option value="triangle">Triangle</option>
                      <option value="catmull-rom">Catmull-Rom</option>
                      <option value="gaussian">Gaussian</option>
                      <option value="lanczos3">Lanczos3</option>
                    </select>
                  </label>
                </>
              )}
              {config.supportsTolerance && (
                <>
                  <label className="option">
                    Max difference (0-20):
                    <input type="number" min={0} max={20} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
                  </label>
                  <label className="option checkbox">
                    <input type="checkbox" checked={cropDetect} onChange={(e) => setCropDetect(e.target.checked)} />
                    Crop detect
                  </label>
                  <label className="option">
                    Skip duration (s):
                    <input type="number" min={0} value={skipForwardAmount} onChange={(e) => setSkipForwardAmount(Number(e.target.value))} />
                  </label>
                  <label className="option">
                    Video hash duration (s):
                    <input type="number" min={1} value={vidHashDuration} onChange={(e) => setVidHashDuration(Number(e.target.value))} />
                  </label>
                </>
              )}
              <label className="option checkbox">
                <input type="checkbox" checked={ignoreSameSize} onChange={(e) => setIgnoreSameSize(e.target.checked)} />
                Ignore files with same size
              </label>
            </div>
          </details>
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
