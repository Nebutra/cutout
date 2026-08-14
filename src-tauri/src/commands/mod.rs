//! Tauri commands exposed to the frontend.

pub mod agent_host;
pub mod ai;
pub mod coding_workspace;
pub mod foreground_segmentation;
pub mod git;
pub mod monotonic_deadline;
pub mod native_approval;
pub mod packaged_e2e;
pub mod registry_desktop;
pub mod save_assets;
pub mod save_bundle;
pub mod scan_repository;
pub mod speech;
#[cfg(desktop)]
pub mod updater;
pub mod vectorize;
#[cfg(desktop)]
pub mod workspace_bridge;
