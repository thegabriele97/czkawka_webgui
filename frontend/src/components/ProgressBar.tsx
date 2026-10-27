import { stripBidiIsolates } from "../api/format";

interface ProgressBarProps {
  label: string | null;
  percent: number | null;
}

export function ProgressBar({ label, percent }: ProgressBarProps) {
  const value = percent !== null && percent >= 0 ? percent : null;
  return (
    <div className="progress">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${value ?? 100}%`, opacity: value === null ? 0.4 : 1 }} />
      </div>
      <p className="progress-label">{label ? stripBidiIsolates(label) : "Scanning..."}</p>
    </div>
  );
}
