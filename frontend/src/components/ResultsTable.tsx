import { Fragment, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { api } from "../api/client";
import { useDataRoot } from "../api/DataRootContext";
import { displayPath } from "../api/displayPath";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { suggestBest } from "../api/suggestBest";
import type { FileEntryLike, Group, OperationCreate, Tool } from "../api/types";
import { MediaThumb } from "./MediaThumb";

/** czkawka_gui-style "select all except ..." rule: which single member of a
 * group to keep when queueing an action across every group at once. Ignored
 * when a reference folder is in play - there the reference is always the
 * keep, so every member is queued regardless of this. */
type KeepRule = "newest" | "oldest" | "largest" | "smallest";

const KEEP_RULE_LABELS: Record<KeepRule, string> = {
  newest: "Keep newest",
  oldest: "Keep oldest",
  largest: "Keep largest",
  smallest: "Keep smallest",
};

/** The member to keep in a reference-less group under a given rule (all the
 * others become the bulk selection). Missing metadata sorts to the losing
 * end so a file with an unknown date/size is never the one silently kept. */
function keptMember(members: FileEntryLike[], rule: KeepRule): FileEntryLike | null {
  if (members.length === 0) return null;
  const dateOf = (e: FileEntryLike) => (e.modified_date as number | undefined) ?? 0;
  const sizeOf = (e: FileEntryLike) => (e.size as number | undefined) ?? 0;
  const scoreOf = rule === "newest" || rule === "oldest" ? dateOf : sizeOf;
  const wantMax = rule === "newest" || rule === "largest";
  return members.reduce((best, e) => (wantMax ? scoreOf(e) > scoreOf(best) : scoreOf(e) < scoreOf(best)) ? e : best);
}

/** Extra, tool-specific columns beyond the universal name/path/size/date -
 * the metadata czkawka_gui itself shows to help judge "which file is
 * better" (higher resolution/bitrate usually means better quality). Only
 * meaningful for tools whose entries actually carry that field. */
export type ExtraColumn = "resolution" | "bitrate" | "codec" | "duration" | "fps" | "difference";

const EXTRA_COLUMN_LABELS: Record<ExtraColumn, string> = {
  resolution: "Res.",
  bitrate: "Bitrate",
  codec: "Codec",
  duration: "Length",
  fps: "FPS",
  difference: "Difference",
};

type ColumnKey = "name" | "path" | ExtraColumn | "size" | "date" | "actions";

const DEFAULT_WIDTHS: Record<ColumnKey, number> = {
  name: 180,
  path: 260,
  resolution: 100,
  bitrate: 90,
  codec: 80,
  duration: 80,
  fps: 70,
  difference: 90,
  size: 90,
  date: 100,
  actions: 130,
};

const MIN_COLUMN_WIDTH = 36;
// Upper bound and breathing room for the measure-to-content auto-fit, so one
// freak-long value can't blow a column out. Folder (path) gets a roomier cap
// than the short metadata columns.
const AUTO_FIT_MAX = 200;
const PATH_AUTO_FIT_MAX = 320;
const AUTO_FIT_PADDING = 18;

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

/** Chain-link glyph for the hardlink action - far more compact than the word
 * "Hardlink" in the tight actions column. */
function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </svg>
  );
}

function dirName(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : "/";
}

function formatSize(bytes?: number): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(unixSeconds?: number): string {
  if (unixSeconds === undefined) return "";
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

function formatDuration(seconds?: number): string {
  if (seconds === undefined) return "";
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function extraColumnValue(column: ExtraColumn, entry: FileEntryLike): string {
  switch (column) {
    case "resolution": {
      const width = entry.width as number | undefined;
      const height = entry.height as number | undefined;
      return width && height ? `${width}×${height}` : "";
    }
    case "bitrate": {
      const bitrate = entry.bitrate as number | undefined;
      return bitrate ? `${Math.round(bitrate / 1000)} kbps` : "";
    }
    case "codec":
      return (entry.codec as string | undefined) ?? "";
    case "duration":
      return formatDuration(entry.duration as number | undefined);
    case "fps": {
      const fps = entry.fps as number | undefined;
      return fps ? `${Math.round(fps)} fps` : "";
    }
    case "difference": {
      const difference = entry.difference as number | undefined;
      return difference !== undefined ? String(difference) : "";
    }
  }
}

interface ResizeHandleProps {
  columnKey: ColumnKey;
  onResize: (key: ColumnKey, startWidth: number, deltaX: number) => void;
  currentWidth: number;
}

/** A thin drag handle on a column's right edge. Columns default to a
 * reasonable width, but name/path (and everything else) can be shrunk or
 * widened by hand so everything fits without relying on the fallback
 * horizontal scroll. */
function ResizeHandle({ columnKey, onResize, currentWidth }: ResizeHandleProps) {
  function onMouseDown(e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = currentWidth;

    function onMouseMove(ev: MouseEvent) {
      onResize(columnKey, startWidth, ev.clientX - startX);
    }
    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return <span className="col-resize-handle" onMouseDown={onMouseDown} />;
}

interface QueuedInfo {
  id: number;
}

interface RowProps {
  entry: FileEntryLike;
  isReference: boolean;
  hasReference: boolean;
  bestReason: string | undefined;
  extraColumns: ExtraColumn[];
  widths: Record<ColumnKey, number>;
  selected: boolean;
  queued: QueuedInfo | undefined;
  dataRoot: string;
  rowRef: (el: HTMLElement | null) => void;
  onSelect: () => void;
  onOpen: () => void;
  onQueueDelete: () => void;
  onQueueHardlink: () => void;
  onUnqueue: () => void;
}

function Row({
  entry,
  isReference,
  hasReference,
  bestReason,
  extraColumns,
  widths,
  selected,
  queued,
  dataRoot,
  rowRef,
  onSelect,
  onOpen,
  onQueueDelete,
  onQueueHardlink,
  onUnqueue,
}: RowProps) {
  return (
    <tr
      ref={rowRef}
      className={`${selected ? "selected " : ""}${queued ? "queued" : ""}`.trim()}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <td className="col-name" title={entry.path} style={{ width: widths.name }}>
        <MediaThumb path={entry.path} className="cell-thumb" isReference={isReference} bestReason={bestReason} onOpen={onOpen} />
        <span className="name-text">{baseName(entry.path)}</span>
      </td>
      <td className="col-path" title={dirName(entry.path)} style={{ width: widths.path }}>
        {displayPath(dirName(entry.path), dataRoot)}
      </td>
      {extraColumns.map((column) => (
        <td className={`col-${column}`} key={column} style={{ width: widths[column] }}>
          {extraColumnValue(column, entry)}
        </td>
      ))}
      <td className="col-size" style={{ width: widths.size }}>
        {formatSize(entry.size as number | undefined)}
      </td>
      <td className="col-date" style={{ width: widths.date }}>
        {formatDate(entry.modified_date as number | undefined)}
      </td>
      <td className="col-actions" style={{ width: widths.actions }} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        {!isReference && !queued && (
          <button className="danger icon-button" onClick={onQueueDelete} title="Delete">
            ✕
          </button>
        )}
        {!isReference && !queued && hasReference && (
          <button className="icon-button" onClick={onQueueHardlink} title="Hardlink to the reference copy">
            <LinkIcon />
          </button>
        )}
        {queued && (
          <>
            <span className="queued-note">Queued</span>
            <button className="unqueue-button" onClick={onUnqueue} title="Remove from the pending queue">
              Cancel
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

/** Mobile counterpart of Row: the same file rendered as a comfortable card
 * (thumbnail, name, path, metadata chips, full-width actions) so a phone
 * never has to scroll a wide multi-column table sideways. */
function Card({
  entry,
  isReference,
  hasReference,
  bestReason,
  extraColumns,
  selected,
  queued,
  dataRoot,
  rowRef,
  onSelect,
  onOpen,
  onQueueDelete,
  onQueueHardlink,
  onUnqueue,
}: RowProps) {
  const chips = [
    ...extraColumns.map((column) => extraColumnValue(column, entry)),
    formatSize(entry.size as number | undefined),
    formatDate(entry.modified_date as number | undefined),
  ].filter(Boolean);

  return (
    <div ref={rowRef} className={`rcard${selected ? " selected" : ""}${queued ? " queued" : ""}`} onClick={onSelect} onDoubleClick={onOpen}>
      <MediaThumb path={entry.path} className="rcard-thumb" isReference={isReference} bestReason={bestReason} onOpen={onOpen} />
      <div className="rcard-main">
        <div className="rcard-name" title={entry.path}>
          {baseName(entry.path)}
        </div>
        <div className="rcard-path">{displayPath(dirName(entry.path), dataRoot)}</div>
        <div className="rcard-meta">
          {chips.map((value, index) => (
            <span className="rchip" key={index}>
              {value}
            </span>
          ))}
        </div>
      </div>
      <div className="rcard-actions" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        {!isReference && !queued && (
          <button className="danger" onClick={onQueueDelete}>
            Delete
          </button>
        )}
        {!isReference && !queued && hasReference && <button onClick={onQueueHardlink}>Hardlink</button>}
        {queued && (
          <>
            <span className="queued-note">Queued</span>
            <button className="unqueue-button" onClick={onUnqueue}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface ResultsTableProps {
  category: Tool;
  groups: Group[];
  extraColumns: ExtraColumn[];
  selectedPath: string | null;
  onSelect: (entry: FileEntryLike) => void;
  onOpen: (entry: FileEntryLike) => void;
  onQueued: () => void;
}

/** All groups from a scan (duplicates sharing a hash, or perceptually
 * similar images/videos) as a single czkawka_gui-style row table - one
 * shared header so columns line up across every group, with a thin
 * separator row marking where each group starts. Row click selects the
 * file for the preview panel; double click opens the larger overlay.
 * Actions only queue a pending operation - nothing touches disk until the
 * user applies the queue. Columns are user-resizable (name/path auto-fit
 * the available width by default) and long names/paths ellipsize rather
 * than push other columns around. */
export function ResultsTable({ category, groups, extraColumns, selectedPath, onSelect, onOpen, onQueued }: ResultsTableProps) {
  // Seeded from the backend (not just local clicks) so a file that's
  // already pending - e.g. queued before a rescan replaced this component -
  // is recognized as queued instead of letting you queue it a second time.
  const [queuedByPath, setQueuedByPath] = useState<Record<string, QueuedInfo>>({});
  const columns: ColumnKey[] = ["name", "path", ...extraColumns, "size", "date", "actions"];
  const [widths, setWidths] = useState<Record<ColumnKey, number>>(DEFAULT_WIDTHS);
  const containerRef = useRef<HTMLDivElement>(null);
  const manuallyResized = useRef<Set<ColumnKey>>(new Set());
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const isNarrow = useMediaQuery("(max-width: 720px)");
  const dataRoot = useDataRoot();
  const [keepRule, setKeepRule] = useState<KeepRule>("newest");
  const [bulkBusy, setBulkBusy] = useState(false);

  // Every group carries a reference iff the scan used a reference folder, so
  // one group's shape answers for all of them.
  const hasReference = groups.some((g) => g.reference);

  // Keeps the selected row in view as it changes - most useful for arrow-key
  // navigation, which can move the selection somewhere currently scrolled
  // off-screen without this.
  useEffect(() => {
    if (!selectedPath) return;
    rowRefs.current.get(selectedPath)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedPath]);

  useEffect(() => {
    let cancelled = false;
    api.listOperations(category).then((ops) => {
      if (cancelled) return;
      const map: Record<string, QueuedInfo> = {};
      for (const op of ops) {
        map[op.dst_path ?? op.src_path] = { id: op.id };
      }
      setQueuedByPath(map);
    });
    return () => {
      cancelled = true;
    };
  }, [category]);

  // Auto-fit: measure each metadata column to its widest actual value (and
  // its header) with a canvas - table cells don't report scrollWidth as
  // content width, so measuring the rendered DOM is unreliable; measuring
  // the text directly is not. name/path then share whatever room is left, so
  // a typical screen shows everything without a manual resize or sideways
  // scroll. A column dragged by hand is left exactly as the user set it.
  useEffect(() => {
    const container = containerRef.current;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!container || !ctx) return;

    const allEntries = groups.flatMap((g) => (g.reference ? [g.reference, ...g.members] : g.members));
    const CELL_FONT = '13px "Archivo", system-ui, sans-serif';
    const MONO_FONT = '12px "JetBrains Mono", monospace';
    const HEAD_FONT = '600 11px "Archivo", system-ui, sans-serif';

    // Columns whose content is plain text we can measure. "path" (folder) is
    // measured too but capped higher; "name" flexes into whatever is left,
    // and "actions" holds buttons so it keeps its default width.
    const fitColumns: ColumnKey[] = [...extraColumns, "size", "date"];
    const headerLabel: Record<string, string> = { ...EXTRA_COLUMN_LABELS, size: "Size", date: "Modified" };
    const valueFor = (col: ColumnKey, entry: FileEntryLike): string => {
      if (col === "size") return formatSize(entry.size as number | undefined);
      if (col === "date") return formatDate(entry.modified_date as number | undefined);
      return extraColumnValue(col as ExtraColumn, entry);
    };

    function measure(font: string, text: string): number {
      ctx!.font = font;
      return ctx!.measureText(text).width;
    }

    function autoFit() {
      if (!container || !ctx) return;
      const measured: Partial<Record<ColumnKey, number>> = {};
      for (const col of fitColumns) {
        if (manuallyResized.current.has(col)) continue;
        let max = measure(HEAD_FONT, headerLabel[col] ?? "") + 12; // room for the resize handle
        for (const entry of allEntries) max = Math.max(max, measure(CELL_FONT, valueFor(col, entry)));
        measured[col] = Math.min(AUTO_FIT_MAX, Math.max(MIN_COLUMN_WIDTH, Math.ceil(max) + AUTO_FIT_PADDING));
      }
      if (!manuallyResized.current.has("path")) {
        let max = measure(HEAD_FONT, "Folder") + 12;
        for (const entry of allEntries) max = Math.max(max, measure(MONO_FONT, displayPath(dirName(entry.path), dataRoot)));
        measured.path = Math.min(PATH_AUTO_FIT_MAX, Math.max(MIN_COLUMN_WIDTH, Math.ceil(max) + AUTO_FIT_PADDING));
      }
      if (!manuallyResized.current.has("actions")) {
        // Two compact icon buttons, or the wider "Queued / Cancel" state -
        // size to the largest so the column doesn't jump when you queue a row.
        const header = measure(HEAD_FONT, "Actions") + 12;
        const icons = 64;
        const queuedState = Math.ceil(measure(CELL_FONT, "Queued") + measure(CELL_FONT, "Cancel")) + 44;
        measured.actions = Math.max(MIN_COLUMN_WIDTH, header, icons, queuedState);
      }

      setWidths((prev) => {
        const next = { ...prev, ...measured };
        // The file name takes everything left over - it's what you read most,
        // and long names ellipsize gracefully.
        if (!manuallyResized.current.has("name")) {
          const rest = columns.filter((c) => c !== "name").reduce((sum, c) => sum + next[c], 0);
          next.name = Math.max(MIN_COLUMN_WIDTH, container.clientWidth - rest - 4);
        }
        return next;
      });
    }

    autoFit();
    window.addEventListener("resize", autoFit);
    return () => window.removeEventListener("resize", autoFit);
    // Runs on mount (one scan's worth of results) and on window resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleResize(key: ColumnKey, startWidth: number, deltaX: number) {
    manuallyResized.current.add(key);
    setWidths((prev) => ({ ...prev, [key]: Math.max(MIN_COLUMN_WIDTH, startWidth + deltaX) }));
  }

  async function queueDelete(entry: FileEntryLike) {
    const op = await api.createOperation({ category, op_type: "delete", src_path: entry.path });
    setQueuedByPath((prev) => ({ ...prev, [entry.path]: { id: op.id } }));
    onQueued();
  }

  async function queueHardlinkToReference(reference: FileEntryLike, entry: FileEntryLike) {
    const op = await api.createOperation({ category, op_type: "hardlink", src_path: reference.path, dst_path: entry.path });
    setQueuedByPath((prev) => ({ ...prev, [entry.path]: { id: op.id } }));
    onQueued();
  }

  async function unqueue(path: string) {
    const info = queuedByPath[path];
    if (!info) return;
    await api.deleteOperation(info.id);
    setQueuedByPath((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
    onQueued();
  }

  // "Apply this action to every group in one shot": build one op per eligible
  // member across all groups, skipping anything already queued, then queue
  // them in a single request. The user prunes individual rows afterwards
  // (Cancel) before applying - nothing touches disk here. With a reference
  // folder the reference is untouchable and every member is eligible; without
  // one, the member picked by `keepRule` is spared in each group.
  async function bulkQueue(opType: "delete" | "hardlink") {
    if (bulkBusy) return;
    const payload: OperationCreate[] = [];
    for (const group of groups) {
      if (opType === "hardlink") {
        if (!group.reference) continue;
        for (const entry of group.members) {
          if (queuedByPath[entry.path]) continue;
          payload.push({ category, op_type: "hardlink", src_path: group.reference.path, dst_path: entry.path });
        }
        continue;
      }
      // delete: keep the reference (if any), else the member the rule spares.
      const keep = group.reference ? null : keptMember(group.members, keepRule);
      for (const entry of group.members) {
        if (entry.path === keep?.path || queuedByPath[entry.path]) continue;
        payload.push({ category, op_type: "delete", src_path: entry.path });
      }
    }
    if (payload.length === 0) return;
    setBulkBusy(true);
    try {
      const created = await api.bulkCreateOperations(payload);
      setQueuedByPath((prev) => {
        const next = { ...prev };
        for (const op of created) next[op.dst_path ?? op.src_path] = { id: op.id };
        return next;
      });
      onQueued();
    } finally {
      setBulkBusy(false);
    }
  }

  const bulkBar = (
    <div className="bulk-bar">
      <span className="bulk-bar-label">Bulk actions:</span>
      {hasReference ? (
        <span className="bulk-bar-note">Reference kept in each group</span>
      ) : (
        <label className="bulk-keep">
          <select value={keepRule} onChange={(e) => setKeepRule(e.target.value as KeepRule)} disabled={bulkBusy}>
            {(Object.keys(KEEP_RULE_LABELS) as KeepRule[]).map((rule) => (
              <option key={rule} value={rule}>
                {KEEP_RULE_LABELS[rule]}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className="danger" onClick={() => bulkQueue("delete")} disabled={bulkBusy}>
        Queue delete · all groups
      </button>
      {hasReference && (
        <button onClick={() => bulkQueue("hardlink")} disabled={bulkBusy}>
          Queue hardlink · all groups
        </button>
      )}
    </div>
  );

  if (isNarrow) {
    return (
      <>
        {bulkBar}
        <div className="results-cards">
        {groups.map((group, groupIndex) => {
          const allEntries = group.reference ? [group.reference, ...group.members] : group.members;
          const best = suggestBest(allEntries);

          return (
            <Fragment key={groupIndex}>
              <div className="result-group-head">
                <span>Group {groupIndex + 1}</span>
              </div>
              {group.reference && (
                <Card
                  key={group.reference.path}
                  entry={group.reference}
                  isReference
                  hasReference
                  bestReason={best?.path === group.reference.path ? best.reason : undefined}
                  extraColumns={extraColumns}
                  widths={widths}
                  selected={selectedPath === group.reference.path}
                  queued={undefined}
                  dataRoot={dataRoot}
                  rowRef={(el) => {
                    if (el) rowRefs.current.set(group.reference!.path, el);
                    else rowRefs.current.delete(group.reference!.path);
                  }}
                  onSelect={() => onSelect(group.reference!)}
                  onOpen={() => onOpen(group.reference!)}
                  onQueueDelete={() => undefined}
                  onQueueHardlink={() => undefined}
                  onUnqueue={() => undefined}
                />
              )}
              {group.members.map((entry) => (
                <Card
                  key={entry.path}
                  entry={entry}
                  isReference={false}
                  hasReference={!!group.reference}
                  bestReason={best?.path === entry.path ? best.reason : undefined}
                  extraColumns={extraColumns}
                  widths={widths}
                  selected={selectedPath === entry.path}
                  queued={queuedByPath[entry.path]}
                  dataRoot={dataRoot}
                  rowRef={(el) => {
                    if (el) rowRefs.current.set(entry.path, el);
                    else rowRefs.current.delete(entry.path);
                  }}
                  onSelect={() => onSelect(entry)}
                  onOpen={() => onOpen(entry)}
                  onQueueDelete={() => queueDelete(entry)}
                  onQueueHardlink={() => (group.reference ? queueHardlinkToReference(group.reference, entry) : undefined)}
                  onUnqueue={() => unqueue(entry.path)}
                />
              ))}
            </Fragment>
          );
        })}
        </div>
      </>
    );
  }

  return (
    <>
      {bulkBar}
      <div className="table-scroll" ref={containerRef}>
      <table className="group-table" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th className="col-name" style={{ width: widths.name }}>
              File name
              <ResizeHandle columnKey="name" onResize={handleResize} currentWidth={widths.name} />
            </th>
            <th className="col-path" style={{ width: widths.path }}>
              Folder
              <ResizeHandle columnKey="path" onResize={handleResize} currentWidth={widths.path} />
            </th>
            {extraColumns.map((column) => (
              <th className={`col-${column}`} key={column} style={{ width: widths[column] }}>
                {EXTRA_COLUMN_LABELS[column]}
                <ResizeHandle columnKey={column} onResize={handleResize} currentWidth={widths[column]} />
              </th>
            ))}
            <th className="col-size" style={{ width: widths.size }}>
              Size
              <ResizeHandle columnKey="size" onResize={handleResize} currentWidth={widths.size} />
            </th>
            <th className="col-date" style={{ width: widths.date }}>
              Modified
              <ResizeHandle columnKey="date" onResize={handleResize} currentWidth={widths.date} />
            </th>
            <th className="col-actions" style={{ width: widths.actions }}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group, groupIndex) => {
            const allEntries = group.reference ? [group.reference, ...group.members] : group.members;
            const best = suggestBest(allEntries);

            return (
              <Fragment key={groupIndex}>
                <tr className="group-separator">
                  <td colSpan={columns.length}>Group {groupIndex + 1}</td>
                </tr>
                {group.reference && (
                  <Row
                    key={group.reference.path}
                    entry={group.reference}
                    isReference
                    hasReference
                    bestReason={best?.path === group.reference.path ? best.reason : undefined}
                    extraColumns={extraColumns}
                    widths={widths}
                    selected={selectedPath === group.reference.path}
                    queued={undefined}
                    dataRoot={dataRoot}
                    rowRef={(el) => {
                      if (el) rowRefs.current.set(group.reference!.path, el);
                      else rowRefs.current.delete(group.reference!.path);
                    }}
                    onSelect={() => onSelect(group.reference!)}
                    onOpen={() => onOpen(group.reference!)}
                    onQueueDelete={() => undefined}
                    onQueueHardlink={() => undefined}
                    onUnqueue={() => undefined}
                  />
                )}
                {group.members.map((entry) => (
                  <Row
                    key={entry.path}
                    entry={entry}
                    isReference={false}
                    hasReference={!!group.reference}
                    bestReason={best?.path === entry.path ? best.reason : undefined}
                    extraColumns={extraColumns}
                    widths={widths}
                    selected={selectedPath === entry.path}
                    queued={queuedByPath[entry.path]}
                    dataRoot={dataRoot}
                    rowRef={(el) => {
                      if (el) rowRefs.current.set(entry.path, el);
                      else rowRefs.current.delete(entry.path);
                    }}
                    onSelect={() => onSelect(entry)}
                    onOpen={() => onOpen(entry)}
                    onQueueDelete={() => queueDelete(entry)}
                    onQueueHardlink={() => (group.reference ? queueHardlinkToReference(group.reference, entry) : undefined)}
                    onUnqueue={() => unqueue(entry.path)}
                  />
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}
