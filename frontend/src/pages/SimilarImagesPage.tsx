import type { FolderEntry } from "../api/types";
import { ToolScanPage } from "./ToolScanPage";

interface SimilarImagesPageProps {
  folders: FolderEntry[];
  onOperationsQueued: () => void;
}

export function SimilarImagesPage({ folders, onOperationsQueued }: SimilarImagesPageProps) {
  return (
    <ToolScanPage
      config={{
        tool: "similar_images",
        title: "Similar Images",
        supportsReference: true,
        supportsMaxDifference: true,
        supportsTolerance: false,
        extraColumns: ["resolution", "difference"],
      }}
      folders={folders}
      onOperationsQueued={onOperationsQueued}
    />
  );
}
