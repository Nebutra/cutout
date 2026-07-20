//! Tauri commands exposed to the frontend.

pub mod agent_host;
pub mod ai;
pub mod ai_native;
pub mod git;
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
