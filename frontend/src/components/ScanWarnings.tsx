import { useDataRoot } from "../api/DataRootContext";
import type { ScanMessages } from "../api/types";

interface ScanWarningsProps {
  messages: ScanMessages | null | undefined;
}

/** czkawka_core wraps every path it mentions in Unicode bidi isolates,
 * which render as stray boxes in a browser, and reports absolute container
 * paths - neither belongs in front of the user. */
function clean(message: string, dataRoot: string): string {
  const withoutIsolates = message.replace(/[⁦-⁩]/g, "");
  return dataRoot ? withoutIsolates.split(`${dataRoot}/`).join("") : withoutIsolates;
}

/** The files czkawka_core skipped while scanning (a corrupted video it
 * couldn't hash, an unreadable folder, a missing ffmpeg) - otherwise they
 * just silently don't show up in the results with no explanation.
 * Collapsed by default: on a big library this can be a long list, and it's
 * a "why isn't that file here?" lookup, not the main output. */
export function ScanWarnings({ messages }: ScanWarningsProps) {
  const dataRoot = useDataRoot();
  const errors = messages?.errors ?? [];
  const warnings = messages?.warnings ?? [];
  const total = errors.length + warnings.length;

  if (total === 0) return null;

  return (
    <details className="scan-messages">
      <summary>
        Skipped files &amp; warnings ({total})
      </summary>
      <ul>
        {errors.map((message, index) => (
          <li key={`error-${index}`} className="error">
            {clean(message, dataRoot)}
          </li>
        ))}
        {warnings.map((message, index) => (
          <li key={`warning-${index}`}>{clean(message, dataRoot)}</li>
        ))}
      </ul>
    </details>
  );
}
