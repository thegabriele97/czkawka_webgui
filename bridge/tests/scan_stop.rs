use std::fs;
use std::io::Read;
use std::process::{Command, Stdio};
use std::time::Duration;

/// Pins down the graceful-stop contract: SIGTERM must not just kill the
/// process (which would silently drop whatever hash cache czkawka_core
/// would otherwise have flushed on a cooperative stop) - it must be
/// translated into the internal stop flag and produce a `stopped` line,
/// with a clean exit.
#[test]
fn sigterm_produces_a_graceful_stopped_line_instead_of_being_killed() {
    let cache_dir = tempfile::tempdir().expect("failed to create temp dir");
    let scan_dir = tempfile::tempdir().expect("failed to create temp dir");

    // Enough tiny files that the scan is still busy walking/hashing them a
    // few hundred ms in - a directory with only a handful of files can
    // finish before the SIGTERM below is even sent, making this flaky.
    for i in 0..20_000 {
        fs::write(scan_dir.path().join(format!("f{i}.bin")), [i as u8; 32]).expect("failed to write test fixture file");
    }

    let mut child = Command::new(env!("CARGO_BIN_EXE_czkawka-bridge"))
        .env("CZKAWKA_CACHE_PATH", cache_dir.path())
        .env("CZKAWKA_CONFIG_PATH", cache_dir.path())
        .args(["scan", "--tool", "duplicates", "--dir"])
        .arg(scan_dir.path())
        .stdout(Stdio::piped())
        .spawn()
        .expect("failed to spawn czkawka-bridge");

    // Give the process a moment to finish its own startup, register the
    // SIGTERM handler, and get into the scan loop proper - otherwise the
    // signal can arrive before that registration runs and fall back to the
    // default (kill) disposition.
    std::thread::sleep(Duration::from_millis(30));

    let pid = child.id();
    let status = Command::new("kill").args(["-TERM", &pid.to_string()]).status().expect("failed to run `kill`");
    assert!(status.success(), "failed to deliver SIGTERM to pid {pid}");

    let mut stdout = String::new();
    child.stdout.take().unwrap().read_to_string(&mut stdout).expect("failed to read bridge stdout");
    let exit_status = child.wait().expect("failed to wait for bridge");

    assert!(exit_status.success(), "expected a graceful exit after SIGTERM, got: {exit_status:?}\noutput:\n{stdout}");
    assert!(stdout.contains("\"type\":\"stopped\""), "expected a stopped line, got:\n{stdout}");
    assert!(!stdout.contains("\"type\":\"result\""), "should not also emit a result line:\n{stdout}");
}
