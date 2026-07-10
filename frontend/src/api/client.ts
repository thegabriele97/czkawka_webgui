import type { BrowseEntry, OperationCreate, OperationOut, ScanCreate, ScanOut, Tool, ToolSettingsOut } from "./types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? `request failed: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  getConfig: () => request<{ data_root: string }>("/config"),

  browse: (path = "") => request<BrowseEntry[]>(`/browse?path=${encodeURIComponent(path)}`),

  createScan: (payload: ScanCreate) => request<ScanOut>("/scans", { method: "POST", body: JSON.stringify(payload) }),
  getScan: (id: number) => request<ScanOut>(`/scans/${id}`),

  getToolSettings: (tool: Tool) => request<ToolSettingsOut>(`/settings/${tool}`),

  operationCounts: () => request<{ counts: Record<string, number> }>("/operations/counts"),
  listOperations: (category: string) => request<OperationOut[]>(`/operations?category=${encodeURIComponent(category)}`),
  createOperation: (payload: OperationCreate) => request<OperationOut>("/operations", { method: "POST", body: JSON.stringify(payload) }),
  deleteOperation: (id: number) => request<void>(`/operations/${id}`, { method: "DELETE" }),
  applyOperations: (category: string) => request<OperationOut[]>(`/operations/apply?category=${encodeURIComponent(category)}`, { method: "POST" }),

  mediaUrl: (path: string) => `${BASE}/media?path=${encodeURIComponent(path)}`,
  thumbnailUrl: (path: string) => `${BASE}/media/thumbnail?path=${encodeURIComponent(path)}`,
};
