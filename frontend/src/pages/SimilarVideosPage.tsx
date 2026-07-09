import type { FolderEntry } from "../api/types";
import { ToolScanPage } from "./ToolScanPage";

interface SimilarVideosPageProps {
  folders: FolderEntry[];
  onOperationsQueued: () => void;
}

export function SimilarVideosPage({ folders, onOperationsQueued }: SimilarVideosPageProps) {
  return (
    <ToolScanPage
      config={{
        tool: "similar_videos",
        title: "Similar Videos",
        supportsReference: true,
        supportsMaxDifference: false,
        supportsTolerance: true,
        extraColumns: ["resolution", "bitrate", "codec", "duration", "fps"],
      }}
      folders={folders}
      onOperationsQueued={onOperationsQueued}
    />
  );
}
