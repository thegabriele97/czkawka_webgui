import { useEffect } from "react";

/** Closes a modal/overlay on Escape - shared by every popup so click-outside
 * and Escape behave consistently. */
export function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onEscape();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onEscape]);
}
