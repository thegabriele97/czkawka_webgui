use std::path::Path;

use assert_cmd::Command;

/// Every bridge invocation needs a writable cache/config path (czkawka_core
/// panics without one). Point it at the test's own temp dir so tests stay
/// hermetic and never touch the real user's home directory.
#[allow(dead_code)]
pub fn bridge_cmd(cache_dir: &Path) -> Command {
    let mut cmd = Command::cargo_bin("czkawka-bridge").expect("bridge binary not built");
    cmd.env("CZKAWKA_CACHE_PATH", cache_dir).env("CZKAWKA_CONFIG_PATH", cache_dir);
    cmd
}

/// Bridge scans emit zero or more progress lines followed by one final
/// `result`/`error` line; tests only care about that last line.
#[allow(dead_code)]
pub fn last_json_line(stdout: &[u8]) -> String {
    let text = String::from_utf8_lossy(stdout);
    text.lines()
        .filter(|line| line.contains("\"type\":\"result\"") || line.contains("\"type\":\"error\""))
        .next_back()
        .unwrap_or_else(|| panic!("no result/error line found in bridge output:\n{text}"))
        .to_string()
}
