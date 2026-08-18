import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useDataRoot } from "../api/DataRootContext";
import { displayPath } from "../api/displayPath";
import type { OperationOut, Tool } from "../api/types";

const CATEGORIES: { value: Tool; label: string }[] = [
  { value: "duplicates", label: "Duplicates" },
  { value: "similar_images", label: "Similar Images" },
  { value: "similar_videos", label: "Similar Videos" },
  { value: "bad_extensions", label: "Bad Extensions" },
];

const OP_TYPE_LABELS: Record<string, string> = {
  delete: "Delete",
  hardlink: "Hardlink",
  rename: "Rename",
};

export function PendingQueuePage({ onApplied }: { onApplied: () => void }) {
  const [category, setCategory] = useState<Tool>("duplicates");
  const [operations, setOperations] = useState<OperationOut[]>([]);
  const [applying, setApplying] = useState(false);
  const [report, setReport] = useState<OperationOut[] | null>(null);
  const dataRoot = useDataRoot();

  async function reload() {
    setOperations(await api.listOperations(category));
  }

  useEffect(() => {
    setReport(null);
    reload();
  }, [category]);

  async function removeOperation(id: number) {
    await api.deleteOperation(id);
    await reload();
    onApplied();
  }

  async function apply() {
    setApplying(true);
    setReport(null);
    try {
      const result = await api.applyOperations(category);
      setReport(result);
      await reload();
      onApplied();
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="page">
      <h2>Pending Queue</h2>

      <div className="category-tabs">
        {CATEGORIES.map((c) => (
          <button key={c.value} className={c.value === category ? "active" : ""} onClick={() => setCategory(c.value)}>
            {c.label}
          </button>
        ))}
      </div>

      {operations.length === 0 && <p>No pending operations for this category.</p>}

      <ul className="operation-list">
        {operations.map((op) => (
          <li key={op.id}>
            <span className="op-type">{OP_TYPE_LABELS[op.op_type] ?? op.op_type}</span>
            <span className="op-src">{displayPath(op.src_path, dataRoot)}</span>
            {op.dst_path && (
              <>
                <span className="op-arrow">→</span>
                <span className="op-dst">{displayPath(op.dst_path, dataRoot)}</span>
              </>
            )}
            <button onClick={() => removeOperation(op.id)}>remove</button>
          </li>
        ))}
      </ul>

      <button className="primary" onClick={apply} disabled={operations.length === 0 || applying}>
        Apply {operations.length} operations
      </button>

      {report && (
        <section className="report">
          <h3>Result</h3>
          <ul>
            {report.map((op) => (
              <li key={op.id} className={op.status === "failed" ? "error" : "ok"}>
                {displayPath(op.src_path, dataRoot)} {op.dst_path ? `→ ${displayPath(op.dst_path, dataRoot)}` : ""} — {op.status}
                {op.error_message ? `: ${op.error_message}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
