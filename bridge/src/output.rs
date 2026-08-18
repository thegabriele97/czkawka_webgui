use serde::Serialize;
use serde_json::Value;

/// The messages czkawka_core itself collected while scanning: files it
/// skipped (a corrupted video it couldn't hash, an unreadable folder, ...)
/// plus its own informational notes.
#[derive(Serialize, Default)]
pub struct ScanMessages {
    pub messages: Vec<String>,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

/// One NDJSON line written to stdout. The backend reads these one at a time:
/// zero or more `progress` lines while a scan runs, then a `messages` line,
/// then exactly one final `result`/`stopped`/`error` line.
#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Envelope {
    Progress {
        label: String,
        all_progress: i32,
        current_progress: Option<i32>,
        current_progress_size: Option<i32>,
    },
    /// What czkawka_core reported alongside the results - emitted before
    /// the final line so a stopped scan still gets to report what it saw.
    Messages(ScanMessages),
    Result {
        data: Value,
    },
    Error {
        message: String,
    },
    /// Emitted instead of `Result` when a stop was requested (SIGTERM) and
    /// czkawka_core wound down gracefully - as opposed to being killed
    /// outright, this gives it a chance to flush its hash cache for
    /// whatever was scanned before the request came in.
    Stopped,
}

pub fn emit(envelope: &Envelope) {
    match serde_json::to_string(envelope) {
        Ok(line) => println!("{line}"),
        Err(e) => eprintln!("czkawka-bridge: failed to serialize output line: {e}"),
    }
}
