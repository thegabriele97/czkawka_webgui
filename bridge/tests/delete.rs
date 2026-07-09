mod common;

use std::fs;

use common::bridge_cmd;

/// Pins down our contract with `czkawka_core::common::remove_single_file`:
/// after the call, the original path must be gone.
#[test]
fn delete_trash_removes_file_from_original_path() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let file = dir.path().join("to_delete.txt");
    fs::write(&file, b"delete me").unwrap();

    let output = bridge_cmd(dir.path())
        .args(["delete", "--trash"])
        .arg(&file)
        .output()
        .expect("failed to run czkawka-bridge");

    assert!(output.status.success(), "bridge exited with error: {}", String::from_utf8_lossy(&output.stderr));
    assert!(!file.exists(), "file should no longer exist at its original path");
}
