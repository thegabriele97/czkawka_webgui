interface ProgressBarProps {
  label: string | null;
  percent: number | null;
}

const BIDI_ISOLATE_MARKS = /[⁦-⁩]/g;

// The bridge's label strings embed Unicode bidi-isolation marks around
// interpolated numbers; harmless for layout but ugly if inspected, so strip
// them before display.
function cleanLabel(label: string): string {
  return label.replace(BIDI_ISOLATE_MARKS, "");
}

export function ProgressBar({ label, percent }: ProgressBarProps) {
  const value = percent !== null && percent >= 0 ? percent : null;
  return (
    <div className="progress">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${value ?? 100}%`, opacity: value === null ? 0.4 : 1 }} />
      </div>
      <p className="progress-label">{label ? cleanLabel(label) : "Scanning..."}</p>
    </div>
  );
}
