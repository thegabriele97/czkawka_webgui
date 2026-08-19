import type { Group } from "../api/types";

function sizeOf(entry: { size?: number }): number {
  return typeof entry.size === "number" ? entry.size : 0;
}

/** Rough estimate of how much disk a group could free: with a reference
 * folder every member is removable (the reference is the kept copy); with
 * no reference we assume the largest file is kept and the rest freed. */
function groupReclaim(group: Group): number {
  if (group.reference) return group.members.reduce((sum, e) => sum + sizeOf(e), 0);
  const sizes = group.members.map(sizeOf);
  if (sizes.length === 0) return 0;
  const total = sizes.reduce((a, b) => a + b, 0);
  return total - Math.max(...sizes);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

/** Surfaces the point of the whole scan before the detail: how much space
 * the duplicates could free. An estimate, deliberately labelled as such. */
export function ReclaimSummary({ groups }: { groups: Group[] }) {
  if (groups.length === 0) return null;

  let reclaimBytes = 0;
  let totalBytes = 0;
  let files = 0;
  for (const group of groups) {
    reclaimBytes += groupReclaim(group);
    const entries = group.reference ? [group.reference, ...group.members] : group.members;
    for (const e of entries) totalBytes += sizeOf(e);
    files += entries.length;
  }

  const pct = totalBytes > 0 ? Math.min(100, Math.round((reclaimBytes / totalBytes) * 100)) : 0;

  return (
    <section className="reclaim">
      <div className="reclaim-lead">
        <p className="reclaim-kicker">Estimated space to reclaim</p>
        <div className="reclaim-num">{formatSize(reclaimBytes)}</div>
        <p className="reclaim-sub">
          <b>{files}</b> files across <b>{groups.length}</b> groups
        </p>
        <div className="reclaim-meter">
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="reclaim-stats">
        <div className="stat">
          <div className="v">{groups.length}</div>
          <div className="k">Groups</div>
        </div>
        <div className="stat">
          <div className="v">{files}</div>
          <div className="k">Files</div>
        </div>
      </div>
    </section>
  );
}
