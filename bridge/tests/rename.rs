mod common;

use std::fs;

use common::bridge_cmd;

#[test]
fn rename_moves_file_to_the_new_extension() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let src = dir.path().join("photo.txt");
    let dst = dir.path().join("photo.jpg");
    fs::write(&src, b"actually a jpeg").unwrap();

    let output = bridge_cmd(dir.path()).arg("rename").arg(&src).arg(&dst).output().expect("failed to run czkawka-bridge");

    assert!(output.status.success(), "bridge exited with error: {}", String::from_utf8_lossy(&output.stderr));
    assert!(!src.exists(), "source should no longer exist");
    assert_eq!(fs::read(&dst).unwrap(), b"actually a jpeg");
}

/// The one case where renaming would destroy data: something else already
/// owns the suggested name. It has to fail loudly instead of overwriting.
#[test]
fn rename_refuses_to_overwrite_an_existing_file() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let src = dir.path().join("photo.txt");
    let dst = dir.path().join("photo.jpg");
    fs::write(&src, b"actually a jpeg").unwrap();
    fs::write(&dst, b"an unrelated file").unwrap();

    let output = bridge_cmd(dir.path()).arg("rename").arg(&src).arg(&dst).output().expect("failed to run czkawka-bridge");

    assert!(!output.status.success(), "bridge should have failed");
    assert!(String::from_utf8_lossy(&output.stdout).contains("\"type\":\"error\""));
    assert!(src.exists(), "source should be left untouched");
    assert_eq!(fs::read(&dst).unwrap(), b"an unrelated file");
}
