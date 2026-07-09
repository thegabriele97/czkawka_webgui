export type Tool = "duplicates" | "similar_images" | "similar_videos" | "bad_extensions";

/** One folder in the globally shared selection (same list across every
 * tab, czkawka_gui-style): a plain scan target, or ticked as the
 * untouchable reference. */
export interface FolderEntry {
  path: string;
  isReference: boolean;
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
  max_difference?: number;
  tolerance?: number;
}

export type ScanStatus = "pending" | "running" | "done" | "error";

export interface ScanOut {
  id: number;
  tool: string;
  status: ScanStatus;
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
