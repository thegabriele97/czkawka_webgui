use std::path::Path;

use serde_json::Value;

use crate::output::{emit, Envelope};

/// Creates a hardlink at `dst` pointing to the same inode as `src`, replacing
/// whatever file currently exists at `dst`. Delegates entirely to
/// `czkawka_core`'s own implementation, which already does a safe
/// rename-swap-rollback and reports cross-device errors clearly.
pub fn run_hardlink_cmd(src: &Path, dst: &Path) -> u8 {
    match czkawka_core::common::make_hard_link(src, dst) {
        Ok(()) => {
            emit(&Envelope::Result { data: Value::Null });
            0
        }
        Err(e) => {
            emit(&Envelope::Error { message: e.to_string() });
            1
        }
    }
}

/// Deletes (or trashes) a single exact file path. Delegates to
/// `czkawka_core`'s own implementation, same one the GUI uses for
/// interactive single-file deletion.
pub fn run_delete_cmd(path: &Path, trash: bool) -> u8 {
    match czkawka_core::common::remove_single_file(path, trash) {
        Ok(()) => {
            emit(&Envelope::Result { data: Value::Null });
            0
        }
        Err(message) => {
            emit(&Envelope::Error { message });
            1
        }
    }
}
