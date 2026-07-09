mod common;

use std::fs;
use std::os::unix::fs::MetadataExt;

use common::bridge_cmd;

/// Pins down our contract with `czkawka_core::common::make_hard_link`: after
/// the call, both paths must resolve to the same inode.
#[test]
fn hardlink_makes_dst_share_src_inode() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let src = dir.path().join("src.txt");
    let dst = dir.path().join("dst.txt");
    fs::write(&src, b"source content").unwrap();
    fs::write(&dst, b"content to be replaced").unwrap();

    let output = bridge_cmd(dir.path()).args(["hardlink"]).arg(&src).arg(&dst).output().expect("failed to run czkawka-bridge");

    assert!(output.status.success(), "bridge exited with error: {}", String::from_utf8_lossy(&output.stderr));

    let src_ino = fs::metadata(&src).unwrap().ino();
    let dst_ino = fs::metadata(&dst).unwrap().ino();
    assert_eq!(src_ino, dst_ino, "src and dst should share the same inode after hardlinking");
}

/// Cross-device hardlinks are expected to fail with a clear error rather
/// than a bare OS errno, so callers (and our backend's per-operation report)
/// can surface something readable to the user.
#[test]
fn hardlink_reports_error_for_missing_source() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let missing_src = dir.path().join("does_not_exist.txt");
    let dst = dir.path().join("dst.txt");
    fs::write(&dst, b"content").unwrap();

    let output = bridge_cmd(dir.path())
        .args(["hardlink"])
        .arg(&missing_src)
        .arg(&dst)
        .output()
        .expect("failed to run czkawka-bridge");

    assert!(!output.status.success(), "expected non-zero exit for missing source");
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("\"type\":\"error\""), "expected an error line, got: {stdout}");
}
