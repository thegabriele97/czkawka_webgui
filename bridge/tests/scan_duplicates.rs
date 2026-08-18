mod common;

use std::fs;

use common::{bridge_cmd, last_json_line};

/// Pins down our contract with `czkawka_core`: given two byte-identical
/// files, `scan --tool duplicates` must report both paths in its final
/// result line. If a future `czkawka_core` bump changes the duplicate
/// result shape enough that paths stop appearing verbatim, this fails and
/// tells us before it reaches production.
#[test]
fn finds_exact_duplicate_files() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let file_a = dir.path().join("a.txt");
    let file_b = dir.path().join("b.txt");
    fs::write(&file_a, b"duplicate content for contract test").unwrap();
    fs::write(&file_b, b"duplicate content for contract test").unwrap();

    let output = bridge_cmd(dir.path())
        .args(["scan", "--tool", "duplicates", "--dir"])
        .arg(dir.path())
        .output()
        .expect("failed to run czkawka-bridge");

    assert!(output.status.success(), "bridge exited with error: {}", String::from_utf8_lossy(&output.stderr));

    let result_line = last_json_line(&output.stdout);
    assert!(result_line.contains("\"type\":\"result\""), "expected a result line, got: {result_line}");
    assert!(
        result_line.contains(&file_a.to_string_lossy().to_string()),
        "result should mention {}: {result_line}",
        file_a.display()
    );
    assert!(
        result_line.contains(&file_b.to_string_lossy().to_string()),
        "result should mention {}: {result_line}",
        file_b.display()
    );
}

/// Two files that only share a size, not content, must not be reported as
/// hash duplicates.
#[test]
fn does_not_flag_different_files_as_duplicates() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let file_a = dir.path().join("a.txt");
    let file_c = dir.path().join("c.txt");
    fs::write(&file_a, b"aaaaaaaaaaaaaaaaaaaa").unwrap();
    fs::write(&file_c, b"cccccccccccccccccccc").unwrap();

    let output = bridge_cmd(dir.path())
        .args(["scan", "--tool", "duplicates", "--dir"])
        .arg(dir.path())
        .output()
        .expect("failed to run czkawka-bridge");

    assert!(output.status.success());
    let result_line = last_json_line(&output.stdout);
    assert!(
        !result_line.contains(&file_a.to_string_lossy().to_string()),
        "non-duplicate file should not appear in results: {result_line}"
    );
}

/// Every scan reports czkawka_core's own messages (the files it skipped and
/// why) on their own line before the final result line, so the backend can
/// surface them even for a scan that found nothing.
#[test]
fn reports_czkawka_messages_before_the_result_line() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    fs::write(dir.path().join("only.txt"), b"nothing to match").unwrap();

    let output = bridge_cmd(dir.path())
        .args(["scan", "--tool", "duplicates", "--dir"])
        .arg(dir.path())
        .output()
        .expect("failed to run czkawka-bridge");

    assert!(output.status.success(), "bridge exited with error: {}", String::from_utf8_lossy(&output.stderr));

    let stdout = String::from_utf8_lossy(&output.stdout);
    let messages_index = stdout.find("\"type\":\"messages\"").expect("expected a messages line");
    let result_index = stdout.find("\"type\":\"result\"").expect("expected a result line");
    assert!(messages_index < result_index, "messages must come before the final result line:\n{stdout}");
}
