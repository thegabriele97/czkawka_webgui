use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use czkawka_core::common::config_cache_path::set_config_cache_path;
use czkawka_core::common::image::register_image_decoding_hooks;
use czkawka_core::common::logger::{filtering_messages, setup_logger};

mod actions;
mod output;
mod scan;

use scan::ScanArgs;

#[derive(Parser)]
#[command(name = "czkawka-bridge")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Run one of the czkawka scans and report results as NDJSON.
    Scan(ScanArgs),
    /// Hardlink `dst` to the same inode as `src`, replacing `dst`.
    Hardlink { src: PathBuf, dst: PathBuf },
    /// Rename `src` to `dst` (same folder, new extension), refusing to
    /// overwrite an existing `dst`.
    Rename { src: PathBuf, dst: PathBuf },
    /// Delete (or trash) a single exact file.
    Delete {
        path: PathBuf,
        #[arg(long)]
        trash: bool,
    },
}

fn main() -> ExitCode {
    register_image_decoding_hooks();
    // Must run before anything that touches the on-disk hash/prehash cache
    // (including the logger, which writes into the same config/cache
    // folder) - czkawka_core panics if that cache path was never set.
    let cache_path_result = set_config_cache_path("czkawka-bridge", "czkawka-bridge");
    setup_logger(true, "czkawka-bridge", filtering_messages);
    for warning in &cache_path_result.warnings {
        eprintln!("czkawka-bridge: {warning}");
    }

    let cli = Cli::parse();
    let code = match cli.command {
        Command::Scan(args) => scan::run_scan(args),
        Command::Hardlink { src, dst } => actions::run_hardlink_cmd(&src, &dst),
        Command::Rename { src, dst } => actions::run_rename_cmd(&src, &dst),
        Command::Delete { path, trash } => actions::run_delete_cmd(&path, trash),
    };
    ExitCode::from(code)
}
