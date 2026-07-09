import type { FolderEntry } from "../api/types";
import { ToolScanPage } from "./ToolScanPage";

interface DuplicatesPageProps {
  folders: FolderEntry[];
  onOperationsQueued: () => void;
}

export function DuplicatesPage({ folders, onOperationsQueued }: DuplicatesPageProps) {
  return (
    <ToolScanPage
      config={{ tool: "duplicates", title: "Duplicates", supportsReference: true, supportsMaxDifference: false, supportsTolerance: false, extraColumns: [] }}
      folders={folders}
      onOperationsQueued={onOperationsQueued}
    />
  );
}
