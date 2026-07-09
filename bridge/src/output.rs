use serde::Serialize;
use serde_json::Value;

/// One NDJSON line written to stdout. The backend reads these one at a time:
/// zero or more `progress` lines while a scan runs, then exactly one final
/// `result` or `error` line.
#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Envelope {
    Progress {
        label: String,
        all_progress: i32,
        current_progress: Option<i32>,
        current_progress_size: Option<i32>,
    },
    Result {
        data: Value,
    },
    Error {
        message: String,
    },
}

pub fn emit(envelope: &Envelope) {
    match serde_json::to_string(envelope) {
        Ok(line) => println!("{line}"),
        Err(e) => eprintln!("czkawka-bridge: failed to serialize output line: {e}"),
    }
}
