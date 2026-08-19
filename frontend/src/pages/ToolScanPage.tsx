import { useEffect, useState } from "react";
import { api } from "../api/client";
import { buildNavItems } from "../api/navItems";
import { normalizeGroups } from "../api/normalizeGroups";
import type { FileEntryLike, FolderEntry, HashAlg, HashSize, ResizeAlgorithm, ScanOut, Tool } from "../api/types";
import { PreviewOverlay } from "../components/PreviewOverlay";
import { PreviewPanel } from "../components/PreviewPanel";
import { ProgressBar } from "../components/ProgressBar";
import { ReclaimSummary } from "../components/ReclaimSummary";
import { ScanWarnings } from "../components/ScanWarnings";
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
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FileEntryLike | null>(null);
  const [opened, setOpened] = useState<FileEntryLike | null>(null);
  // Index into the flattened (groups + gap markers) nav sequence - kept in
  // sync with `selected` so arrow-key navigation continues from wherever a
  // mouse click landed, and vice versa. null = nothing selected yet.
  const [navIndex, setNavIndex] = useState<number | null>(null);

  const directories = folders.filter((f) => !f.isReference).map((f) => f.path);
  const referenceDirectories = config.supportsReference ? folders.filter((f) => f.isReference).map((f) => f.path) : [];

  // Reattach to whatever scan was last run for this tool - the backend
  // keeps a scan going in the background regardless of whether anyone's
  // watching, so a page reload shouldn't make it look like nothing is
  // happening (or lose already-computed results).
  useEffect(() => {
    api
      .getLatestScan(config.tool)
      .then((latest) => {
        if (latest) setScan(latest);
      })
      .catch(() => undefined);
  }, [config.tool]);

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
    setNavIndex(null);
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

  // Whether the *currently displayed* scan was run with a reference folder -
  // read from the scan itself (as the backend recorded it at the time),
  // not from the folder panel's live state, which may have moved on.
  const groups = scan?.status === "done" ? normalizeGroups(scan.result, scan.reference_directories.length > 0) : [];

  function selectRow(entry: FileEntryLike) {
    setSelected(entry);
    const items = buildNavItems(groups);
    const index = items.findIndex((item) => item.kind === "entry" && item.entry.path === entry.path);
    setNavIndex(index === -1 ? null : index);
  }

  function clearSelection() {
    setSelected(null);
    setNavIndex(null);
  }

  function moveSelection(delta: number) {
    const items = buildNavItems(groups);
    if (items.length === 0) return;
    const next = navIndex === null ? (delta > 0 ? 0 : items.length - 1) : Math.min(items.length - 1, Math.max(0, navIndex + delta));
    setNavIndex(next);
    const item = items[next];
    setSelected(item.kind === "entry" ? item.entry : null);
  }

  // Arrow-key navigation between rows (and the gap between groups, which
  // briefly clears the preview) - only while there's something to navigate,
  // and not while the user is typing into a form control elsewhere on the
  // page (e.g. the scan options).
  useEffect(() => {
    if (groups.length === 0) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      e.preventDefault();
      moveSelection(e.key === "ArrowDown" ? 1 : -1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, navIndex]);

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

      {scan?.status === "done" && <ReclaimSummary groups={groups} />}

      {scan?.status === "done" && (
        <section className="results-layout" onClick={clearSelection}>
          <div className={selected ? "results-list has-preview" : "results-list"}>
            <h3>Results ({groups.length} groups)</h3>
            {groups.length === 0 && <p>No results.</p>}
            {groups.length > 0 && (
              <ResultsTable
                category={config.tool}
                groups={groups}
                extraColumns={config.extraColumns}
                selectedPath={selected?.path ?? null}
                onSelect={selectRow}
                onOpen={setOpened}
                onQueued={onOperationsQueued}
              />
            )}
          </div>
          <div className="preview-column" onClick={(e) => e.stopPropagation()}>
            <PreviewPanel entry={selected} onOpen={setOpened} />
          </div>
        </section>
      )}

      {opened && <PreviewOverlay entry={opened} onClose={() => setOpened(null)} />}
    </div>
  );
}
