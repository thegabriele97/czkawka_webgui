mod common;

use std::fs;
use std::path::Path;

use common::{bridge_cmd, last_json_line};

/// Pins down our contract with `czkawka_core` for perceptual similarity:
/// two pixel-identical images (difference 0, well under the default
/// max-difference of 5) must end up reported as similar.
#[test]
fn finds_similar_images() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let image_a = dir.path().join("image_a.png");
    let image_b = dir.path().join("image_b.png");
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/image_a.png");
    fs::copy(&fixture, &image_a).expect("failed to copy fixture image");
    fs::copy(&fixture, &image_b).expect("failed to copy fixture image");

    let output = bridge_cmd(dir.path())
        .args(["scan", "--tool", "similar-images", "--dir"])
        .arg(dir.path())
        .output()
        .expect("failed to run czkawka-bridge");

    assert!(output.status.success(), "bridge exited with error: {}", String::from_utf8_lossy(&output.stderr));

    let result_line = last_json_line(&output.stdout);
    assert!(
        result_line.contains(&image_a.to_string_lossy().to_string()),
        "result should mention {}: {result_line}",
        image_a.display()
    );
    assert!(
        result_line.contains(&image_b.to_string_lossy().to_string()),
        "result should mention {}: {result_line}",
        image_b.display()
    );
}
