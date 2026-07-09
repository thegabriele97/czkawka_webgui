use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use clap::{Args, ValueEnum};
use crossbeam_channel::{unbounded, Sender};
use czkawka_core::common::model::{CheckingMethod, HashType};
use czkawka_core::common::progress_data::ProgressData;
use czkawka_core::common::tool_data::CommonData;
use czkawka_core::common::traits::{PrintResults, Search};
use czkawka_core::re_exported::{FilterType, HashAlg};
use czkawka_core::tools::bad_extensions::{BadExtensions, BadExtensionsParameters};
use czkawka_core::tools::duplicate::{DuplicateFinder, DuplicateFinderParameters};
use czkawka_core::tools::similar_images::{GeometricInvariance, SimilarImages, SimilarImagesParameters};
use czkawka_core::tools::similar_videos::{
    SimilarVideos, SimilarVideosParameters, DEFAULT_AUDIO_LENGTH_RATIO, DEFAULT_AUDIO_MAXIMUM_DIFFERENCE, DEFAULT_AUDIO_MIN_DURATION_SECONDS,
    DEFAULT_AUDIO_SIMILARITY_PERCENT, DEFAULT_CROP_DETECT, DEFAULT_DURATION_TOLERANCE_PCT, DEFAULT_MIN_MATCHING_WINDOWS, DEFAULT_SKIP_FORWARD_AMOUNT,
    DEFAULT_SUBCLIP_MIN_MATCH, DEFAULT_THUMBNAIL_GRID_TILES_PER_SIDE, DEFAULT_VIDEO_PERCENTAGE_FOR_THUMBNAIL, DEFAULT_VID_HASH_DURATION, DEFAULT_WINDOW_COUNT,
};
use serde_json::Value;

use crate::output::{emit, Envelope};

#[derive(Clone, Copy, ValueEnum)]
pub enum Tool {
    Duplicates,
    SimilarImages,
    SimilarVideos,
    BadExtensions,
}

#[derive(Args, Clone)]
pub struct ScanArgs {
    #[arg(long, value_enum)]
    pub tool: Tool,
    /// Folder(s) to scan, recursively.
    #[arg(long = "dir", required = true)]
    pub dir: Vec<PathBuf>,
    /// Folder(s) treated as an untouchable reference: only files in the
    /// non-reference `--dir` folders are reported as matches.
    #[arg(long = "reference-dir")]
    pub reference_dir: Vec<PathBuf>,
    #[arg(long = "min-size", default_value_t = 0)]
    pub min_size: u64,
    #[arg(long = "max-size")]
    pub max_size: Option<u64>,
    /// Similar images only: maximum perceptual hash difference (0-40).
    #[arg(long = "max-difference", default_value_t = 5)]
    pub max_difference: u32,
    /// Similar videos only: maximum frame difference (0-20).
    #[arg(long = "tolerance", default_value_t = 10)]
    pub tolerance: i32,
}

pub fn run_scan(args: ScanArgs) -> u8 {
    let (progress_sender, progress_receiver) = unbounded::<ProgressData>();
    let stop_flag = Arc::new(AtomicBool::new(false));

    let progress_thread = thread::spawn(move || {
        for progress in progress_receiver.iter() {
            let display = progress.to_display();
            emit(&Envelope::Progress {
                label: display.label,
                all_progress: display.all_progress,
                current_progress: display.current_progress,
                current_progress_size: display.current_progress_size,
            });
        }
    });

    let result = match args.tool {
        Tool::Duplicates => run_duplicates(&args, &stop_flag, &progress_sender),
        Tool::SimilarImages => run_similar_images(&args, &stop_flag, &progress_sender),
        Tool::SimilarVideos => run_similar_videos(&args, &stop_flag, &progress_sender),
        Tool::BadExtensions => run_bad_extensions(&args, &stop_flag, &progress_sender),
    };

    // Dropping our end of the channel lets the progress thread's `.iter()`
    // loop end once every in-flight message has been drained.
    drop(progress_sender);
    let _ = progress_thread.join();

    match result {
        Ok(data) => {
            emit(&Envelope::Result { data });
            0
        }
        Err(message) => {
            emit(&Envelope::Error { message });
            1
        }
    }
}

/// Applies the settings shared by every tool: which folders to scan, which
/// one (if any) is the untouchable reference, recursion, and size limits.
fn apply_common<T: CommonData>(tool: &mut T, args: &ScanArgs) {
    let mut included = args.dir.clone();
    if !args.reference_dir.is_empty() {
        included.extend(args.reference_dir.iter().cloned());
        tool.set_reference_paths(args.reference_dir.clone());
    }
    tool.set_included_paths(included);
    tool.set_recursive_search(true);
    tool.set_minimal_file_size(args.min_size);
    if let Some(max_size) = args.max_size {
        tool.set_maximal_file_size(max_size);
    }
}

fn run_duplicates(args: &ScanArgs, stop_flag: &Arc<AtomicBool>, progress_sender: &Sender<ProgressData>) -> Result<Value, String> {
    let params = DuplicateFinderParameters::new(
        CheckingMethod::Hash,
        HashType::Blake3,
        true,    // use_prehash_cache
        257_144, // minimal_cached_file_size
        257_144, // minimal_prehash_cache_file_size
        false,   // case_sensitive_name_comparison (irrelevant for hash-based matching)
    );
    let mut tool = DuplicateFinder::new(params);
    apply_common(&mut tool, args);
    tool.set_hide_hard_links(true);
    tool.search(stop_flag, Some(progress_sender));
    read_json_result(&tool)
}

fn run_similar_images(args: &ScanArgs, stop_flag: &Arc<AtomicBool>, progress_sender: &Sender<ProgressData>) -> Result<Value, String> {
    let params = SimilarImagesParameters::new(
        args.max_difference,
        16, // hash_size
        HashAlg::Gradient,
        FilterType::Nearest,
        false, // ignore_same_size
        false, // ignore_same_resolution
        GeometricInvariance::Off,
    );
    let mut tool = SimilarImages::new(params);
    apply_common(&mut tool, args);
    tool.set_hide_hard_links(true);
    tool.search(stop_flag, Some(progress_sender));
    read_json_result(&tool)
}

fn run_similar_videos(args: &ScanArgs, stop_flag: &Arc<AtomicBool>, progress_sender: &Sender<ProgressData>) -> Result<Value, String> {
    let params = SimilarVideosParameters::new(
        args.tolerance,
        false, // ignore_same_size
        false, // ignore_same_resolution
        DEFAULT_SKIP_FORWARD_AMOUNT,
        DEFAULT_VID_HASH_DURATION,
        DEFAULT_CROP_DETECT,
        DEFAULT_WINDOW_COUNT,
        DEFAULT_DURATION_TOLERANCE_PCT,
        DEFAULT_MIN_MATCHING_WINDOWS,
        DEFAULT_SUBCLIP_MIN_MATCH,
        false, // generate_thumbnails (GUI-only feature, not needed server-side)
        DEFAULT_VIDEO_PERCENTAGE_FOR_THUMBNAIL,
        false, // generate_thumbnail_grid
        DEFAULT_THUMBNAIL_GRID_TILES_PER_SIDE,
        false, // check_audio_content (expensive; left off by default)
        DEFAULT_AUDIO_SIMILARITY_PERCENT,
        DEFAULT_AUDIO_MAXIMUM_DIFFERENCE,
        DEFAULT_AUDIO_LENGTH_RATIO,
        DEFAULT_AUDIO_MIN_DURATION_SECONDS,
    );
    let mut tool = SimilarVideos::new(params);
    apply_common(&mut tool, args);
    tool.set_hide_hard_links(true);
    tool.search(stop_flag, Some(progress_sender));
    read_json_result(&tool)
}

fn run_bad_extensions(args: &ScanArgs, stop_flag: &Arc<AtomicBool>, progress_sender: &Sender<ProgressData>) -> Result<Value, String> {
    let params = BadExtensionsParameters::new();
    let mut tool = BadExtensions::new(params);
    apply_common(&mut tool, args);
    tool.search(stop_flag, Some(progress_sender));
    read_json_result(&tool)
}

/// Reuses `czkawka_core`'s own JSON export (the same one behind the GUI/CLI's
/// "save as JSON" feature) instead of hand-rolling serialization of each
/// tool's internal result types, so the result shape follows upstream rather
/// than an assumption of ours that could drift on a version bump.
fn read_json_result<T: PrintResults>(tool: &T) -> Result<Value, String> {
    let unique = format!("{}-{}", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos());
    let tmp_path = std::env::temp_dir().join(format!("czkawka-bridge-{unique}.json"));
    let tmp_path_str = tmp_path.to_str().ok_or("temp path is not valid UTF-8")?;

    tool.save_results_to_file_as_json(tmp_path_str, false)
        .map_err(|e| format!("failed to serialize scan results: {e}"))?;
    let contents = std::fs::read_to_string(&tmp_path).map_err(|e| format!("failed to read serialized results: {e}"))?;
    let _ = std::fs::remove_file(&tmp_path);

    serde_json::from_str(&contents).map_err(|e| format!("failed to parse serialized results: {e}"))
}
