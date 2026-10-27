// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// jsdom throws from getContext rather than returning null; the component's
// auto-fit treats a null 2D context as "skip measuring", so emulate that here
// (a real browser returns a context) to keep the effect quiet and deterministic.
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

vi.mock("../hooks/useMediaQuery", () => ({ useMediaQuery: vi.fn(() => false) }));
vi.mock("../api/client", () => ({
  api: {
    listOperations: vi.fn(() => Promise.resolve([])),
    createOperation: vi.fn(),
    bulkCreateOperations: vi.fn(),
    deleteOperation: vi.fn(),
    clearOperations: vi.fn(),
    mediaUrl: (p: string) => p,
    thumbnailUrl: (p: string) => p,
  },
}));

import { api } from "../api/client";
import type { Group } from "../api/types";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { ResultsTable } from "./ResultsTable";

const mockListOperations = api.listOperations as unknown as ReturnType<typeof vi.fn>;
const mockUseMediaQuery = useMediaQuery as unknown as ReturnType<typeof vi.fn>;

const group: Group = {
  reference: { path: "/data/ref/keep.jpg", size: 100, modified_date: 1 },
  members: [
    { path: "/data/dup/a.jpg", size: 100, modified_date: 2 },
    { path: "/data/dup/b.jpg", size: 100, modified_date: 3 },
  ],
};

function renderTable() {
  return render(
    <ResultsTable
      category="duplicates"
      groups={[group]}
      extraColumns={[]}
      selectedPath={null}
      onSelect={vi.fn()}
      onOpen={vi.fn()}
      onQueued={vi.fn()}
    />,
  );
}

afterEach(() => {
  vi.clearAllMocks();
  mockUseMediaQuery.mockReturnValue(false);
  mockListOperations.mockResolvedValue([]);
});

describe("ResultsTable group rendering (desktop)", () => {
  it("renders the reference plus members, with delete only on members", async () => {
    renderTable();
    await waitFor(() => expect(mockListOperations).toHaveBeenCalledWith("duplicates"));

    expect(screen.getByText("Group 1")).toBeTruthy();
    expect(screen.getByText("keep.jpg")).toBeTruthy();
    expect(screen.getByText("a.jpg")).toBeTruthy();
    expect(screen.getByText("b.jpg")).toBeTruthy();
    // The reference is untouchable, so exactly the two members get a delete.
    expect(screen.getAllByTitle("Delete")).toHaveLength(2);
    // ...and only the reference carries the REF marker.
    expect(screen.getByText("REF")).toBeTruthy();
  });

  it("shows an already-queued member as Queued with no delete control", async () => {
    mockListOperations.mockResolvedValue([
      { id: 1, category: "duplicates", op_type: "delete", src_path: "/data/dup/a.jpg", dst_path: null, status: "pending", error_message: null },
    ]);
    renderTable();
    await waitFor(() => expect(screen.getByText("Queued")).toBeTruthy());
    // a.jpg is queued -> only b.jpg is still deletable.
    expect(screen.getAllByTitle("Delete")).toHaveLength(1);
  });
});

describe("ResultsTable group rendering (mobile cards)", () => {
  it("renders the same member actions as word buttons", async () => {
    mockUseMediaQuery.mockReturnValue(true);
    renderTable();
    await waitFor(() => expect(mockListOperations).toHaveBeenCalled());

    // Cards use the word "Delete"; one per member, none for the reference.
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(2);
    expect(screen.getByText("keep.jpg")).toBeTruthy();
  });
});
