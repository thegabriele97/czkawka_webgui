// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { ScanOut } from "../api/types";
import { useScanLifecycle } from "./useScanLifecycle";

vi.mock("../api/client", () => ({
  api: {
    getLatestScan: vi.fn(),
    getScan: vi.fn(),
    createScan: vi.fn(),
    stopScan: vi.fn(),
  },
}));

const mockApi = api as unknown as Record<"getLatestScan" | "getScan" | "createScan" | "stopScan", ReturnType<typeof vi.fn>>;

function scan(partial: Partial<ScanOut>): ScanOut {
  return {
    id: 1,
    tool: "duplicates",
    status: "done",
    reference_directories: [],
    progress_label: null,
    progress_all: null,
    result: null,
    messages: null,
    error_message: null,
    ...partial,
  };
}

beforeEach(() => {
  mockApi.getLatestScan.mockResolvedValue(null);
  mockApi.getScan.mockResolvedValue(scan({ status: "running" }));
  mockApi.createScan.mockResolvedValue(scan({ status: "running" }));
  mockApi.stopScan.mockResolvedValue(scan({ status: "stopped" }));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("useScanLifecycle", () => {
  it("reattaches to the latest scan for the tool on mount", async () => {
    mockApi.getLatestScan.mockResolvedValue(scan({ id: 7, status: "done" }));
    const { result } = renderHook(() => useScanLifecycle("duplicates"));
    await waitFor(() => expect(result.current.scan?.id).toBe(7));
    expect(mockApi.getLatestScan).toHaveBeenCalledWith("duplicates");
  });

  it("stays null when the tool has no scan yet", async () => {
    const { result } = renderHook(() => useScanLifecycle("bad_extensions"));
    await waitFor(() => expect(mockApi.getLatestScan).toHaveBeenCalledWith("bad_extensions"));
    expect(result.current.scan).toBeNull();
  });

  it("start() posts a scan, stores the result, and clears `starting`", async () => {
    mockApi.createScan.mockResolvedValue(scan({ id: 9, status: "running" }));
    const { result } = renderHook(() => useScanLifecycle("duplicates"));
    await waitFor(() => expect(mockApi.getLatestScan).toHaveBeenCalled());

    await act(async () => {
      await result.current.start({ tool: "duplicates", directories: ["/d"] });
    });

    expect(mockApi.createScan).toHaveBeenCalledWith({ tool: "duplicates", directories: ["/d"] });
    expect(result.current.scan?.id).toBe(9);
    expect(result.current.starting).toBe(false);
  });

  it("surfaces an error (and keeps no scan) when start() fails", async () => {
    mockApi.createScan.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useScanLifecycle("duplicates"));
    await waitFor(() => expect(mockApi.getLatestScan).toHaveBeenCalled());

    await act(async () => {
      await result.current.start({ tool: "duplicates", directories: [] });
    });

    expect(result.current.error).toContain("boom");
    expect(result.current.scan).toBeNull();
    expect(result.current.starting).toBe(false);
  });

  it("polls a running scan once per second and stops once it finishes", async () => {
    vi.useFakeTimers();
    mockApi.getLatestScan.mockResolvedValue(scan({ id: 3, status: "running" }));
    const { result } = renderHook(() => useScanLifecycle("duplicates"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // flush the mount reattach
    });
    expect(result.current.scan?.status).toBe("running");

    mockApi.getScan.mockResolvedValue(scan({ id: 3, status: "done" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mockApi.getScan).toHaveBeenCalledWith(3);
    expect(result.current.scan?.status).toBe("done");

    // Terminal status -> the interval was cleared, so no further polling.
    mockApi.getScan.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mockApi.getScan).not.toHaveBeenCalled();
  });

  it("stop() asks the backend to stop and stores the returned scan", async () => {
    mockApi.getLatestScan.mockResolvedValue(scan({ id: 5, status: "running" }));
    mockApi.getScan.mockResolvedValue(scan({ id: 5, status: "running" }));
    const { result } = renderHook(() => useScanLifecycle("duplicates"));
    await waitFor(() => expect(result.current.scan?.id).toBe(5));

    mockApi.stopScan.mockResolvedValue(scan({ id: 5, status: "stopped" }));
    await act(async () => {
      await result.current.stop();
    });

    expect(mockApi.stopScan).toHaveBeenCalledWith(5);
    expect(result.current.scan?.status).toBe("stopped");
  });
});
