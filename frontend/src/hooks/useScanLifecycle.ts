import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { ScanCreate, ScanOut, Tool } from "../api/types";

/** The scan lifecycle shared by every tool page: reattach to whatever scan
 * was last run for this tool on mount (the backend keeps it going whether or
 * not anyone is watching), poll it once a second while it's running, and
 * expose start/stop. Pages layer their own result-specific state on top. */
export function useScanLifecycle(tool: Tool) {
  const [scan, setScan] = useState<ScanOut | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getLatestScan(tool)
      .then((latest) => {
        if (latest) setScan(latest);
      })
      .catch(() => undefined);
  }, [tool]);

  useEffect(() => {
    if (!scan || scan.status !== "running") return;
    const interval = setInterval(() => {
      api.getScan(scan.id).then(setScan).catch(() => undefined);
    }, 1000);
    return () => clearInterval(interval);
  }, [scan?.id, scan?.status]);

  const start = useCallback(async (payload: ScanCreate) => {
    setError(null);
    setStarting(true);
    try {
      setScan(await api.createScan(payload));
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  }, []);

  const stop = useCallback(async () => {
    if (!scan) return;
    setStopping(true);
    try {
      setScan(await api.stopScan(scan.id));
    } catch (e) {
      setError(String(e));
    } finally {
      setStopping(false);
    }
  }, [scan]);

  return { scan, starting, stopping, error, setError, start, stop };
}
