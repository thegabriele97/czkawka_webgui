export type Tool = "duplicates" | "similar_images" | "similar_videos" | "bad_extensions";

export type HashAlg = "mean" | "median" | "gradient" | "vert-gradient" | "double-gradient" | "blockhash";
export type ResizeAlgorithm = "nearest" | "triangle" | "catmull-rom" | "gaussian" | "lanczos3";
export type HashSize = 8 | 16 | 32 | 64;

/** One folder in the globally shared selection (same list across every
 * tab, czkawka_gui-style): a plain scan target, or ticked as the
 * untouchable reference. */
export interface FolderEntry {
  path: string;
  isReference: boolean;
}

/** Wire format for FolderEntry - snake_case to match the backend schema. */
export interface FolderSelectionEntry {
  path: string;
  is_reference: boolean;
}

export interface BrowseEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface ScanCreate {
  tool: Tool;
  directories: string[];
  reference_directories?: string[];
  min_size?: number;
  max_size?: number | null;
  // Similar images
  max_difference?: number;
  ignore_same_size?: boolean;
  hash_size?: HashSize;
  hash_alg?: HashAlg;
  resize_algorithm?: ResizeAlgorithm;
  // Similar videos
  tolerance?: number;
  crop_detect?: boolean;
  skip_forward_amount?: number;
  vid_hash_duration?: number;
}

export interface ToolSettingsOut {
  tool: string;
  options: Record<string, unknown>;
}

export type ScanStatus = "pending" | "running" | "done" | "error" | "stopped";

export interface ScanOut {
  id: number;
  tool: string;
  status: ScanStatus;
  reference_directories: string[];
  progress_label: string | null;
  progress_all: number | null;
  result: unknown;
  error_message: string | null;
}

export type OpType = "delete" | "hardlink";
export type OpStatus = "pending" | "done" | "failed";

export interface OperationCreate {
  category: Tool;
  op_type: OpType;
  src_path: string;
  dst_path?: string | null;
}

export interface OperationOut {
  id: number;
  category: string;
  op_type: string;
  src_path: string;
  dst_path: string | null;
  status: OpStatus;
  error_message: string | null;
}

/** A single file entry as reported by any of the 4 scan tools. Tools attach
 * extra fields (hash, proper_extensions_group, ...) we don't all need to
 * model up front. */
export interface FileEntryLike {
  path: string;
  size?: number;
  modified_date?: number;
  [extra: string]: unknown;
}

/** One cluster of related files, normalized the same way regardless of
 * which tool produced it or whether a reference folder was used. */
export interface Group {
  reference: FileEntryLike | null;
  members: FileEntryLike[];
}
