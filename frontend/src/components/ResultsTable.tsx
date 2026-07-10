import { Fragment, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { api } from "../api/client";
import { useDataRoot } from "../api/DataRootContext";
import { displayPath } from "../api/displayPath";
import { suggestBest } from "../api/suggestBest";
import type { FileEntryLike, Group, Tool } from "../api/types";

/** Extra, tool-specific columns beyond the universal name/path/size/date -
 * the metadata czkawka_gui itself shows to help judge "which file is
 * better" (higher resolution/bitrate usually means better quality). Only
 * meaningful for tools whose entries actually carry that field. */
export type ExtraColumn = "resolution" | "bitrate" | "codec" | "duration" | "fps" | "difference";

const EXTRA_COLUMN_LABELS: Record<ExtraColumn, string> = {
  resolution: "Resolution",
  bitrate: "Bitrate",
  codec: "Codec",
  duration: "Duration",
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
// What fraction of the space left over after the fixed-width columns goes
// to "name" vs. "path" when auto-fitting - path tends to need more room.
const NAME_SHARE_OF_REMAINING = 0.4;

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
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
  rowRef: (el: HTMLTableRowElement | null) => void;
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
      className={selected ? "selected" : ""}
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
        {isReference && <span className="ref-badge">REF</span>}
        {bestReason && (
          <span className="best-badge" title={`Suggested keep: ${bestReason}`}>
            ★
          </span>
        )}
        {baseName(entry.path)}
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
          <button onClick={onQueueHardlink}>Hardlink</button>
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
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const dataRoot = useDataRoot();

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

  // Name/path fill whatever room is left after the other (fixed-width)
  // columns, by default - so everything is visible without a manual resize
  // or horizontal scroll on a typical screen. Once you drag either of them
  // by hand, this stops touching that column.
  useEffect(() => {
    function fitNameAndPath() {
      if (manuallyResized.current.has("name") && manuallyResized.current.has("path")) return;
      const container = containerRef.current;
      if (!container) return;

      const fixedWidth = columns.filter((c) => c !== "name" && c !== "path").reduce((sum, c) => sum + DEFAULT_WIDTHS[c], 0);
      const available = container.clientWidth - fixedWidth - 4;
      if (available < MIN_COLUMN_WIDTH * 2) return;

      setWidths((prev) => {
        const next = { ...prev };
        if (!manuallyResized.current.has("name") && !manuallyResized.current.has("path")) {
          next.name = Math.max(MIN_COLUMN_WIDTH, Math.round(available * NAME_SHARE_OF_REMAINING));
          next.path = Math.max(MIN_COLUMN_WIDTH, available - next.name);
        } else if (!manuallyResized.current.has("name")) {
          next.name = Math.max(MIN_COLUMN_WIDTH, available - prev.path);
        } else if (!manuallyResized.current.has("path")) {
          next.path = Math.max(MIN_COLUMN_WIDTH, available - prev.name);
        }
        return next;
      });
    }

    fitNameAndPath();
    window.addEventListener("resize", fitNameAndPath);
    return () => window.removeEventListener("resize", fitNameAndPath);
    // Deliberately only on mount + window resize: columns is fixed for the
    // lifetime of this component (one scan's worth of results).
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

  return (
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
  );
}
