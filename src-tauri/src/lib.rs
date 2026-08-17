mod commands;
pub mod commerce_operator;
pub mod commerce_operator_native;

pub(crate) fn application_context() -> tauri::Context<tauri::Wry> {
    tauri::generate_context!()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    commands::packaged_e2e::native_checkpoint("native-boot");
    let builder = tauri::Builder::default()
        .on_page_load(|_, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                commands::packaged_e2e::native_checkpoint("webview-loaded");
            }
        })
        .manage(commands::registry_desktop::RegistryDesktopState::default())
        .manage(commands::agent_host::AgentHostDesktopState::default())
        .manage(commands::ai::ai_proxy::AiProxyCancellationState::default())
        .manage(commands::ai::game_asset_generation::GameAssetGenerationState::default())
        .manage(commands::ai::game_asset_family::GameAssetFamilyState::default())
        .manage(commands::ai::codex_system::CodexSystemRuntimeState::default())
        .manage(commands::monotonic_deadline::MonotonicDeadlineState::default());
    #[cfg(desktop)]
    let builder = builder.manage(commands::updater::UpdateRuntimeState::default());
    #[cfg(desktop)]
    let builder = builder.manage(commands::workspace_bridge::WorkspaceBridgeState::default());
    #[cfg(desktop)]
    let builder = builder.manage(commands::coding_workspace::CodingWorkspaceState::default());
    builder
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::save_assets::save_assets,
            commands::save_bundle::save_bundle,
            commands::scan_repository::scan_repository,
            commands::packaged_e2e::packaged_e2e_mode,
            commands::packaged_e2e::packaged_e2e_tick,
            commands::packaged_e2e::packaged_e2e_checkpoint,
            commands::packaged_e2e::packaged_e2e_persist_evidence,
            commands::packaged_e2e::packaged_e2e_capture_window,
            commands::packaged_e2e::packaged_e2e_complete,
            commands::foreground_segmentation::foreground_segmentation_capabilities,
            commands::foreground_segmentation::foreground_segment,
            commands::git::git_capability,
            commands::git::git_status,
            commands::git::git_log,
            commands::git::git_commit_files,
            commands::git::git_commit_diff,
            commands::git::git_branches,
            commands::git::git_branch_compare,
            commands::git::git_diff,
            commands::git::git_stage,
            commands::git::git_unstage,
            commands::git::git_preview_mutation,
            commands::git::git_apply_mutation,
            commands::git::git_commit,
            commands::git::git_create_branch,
            commands::git::git_switch_branch,
            commands::git::git_push_preview,
            commands::git::git_push,
            commands::monotonic_deadline::wait_for_monotonic_deadline,
            commands::monotonic_deadline::cancel_monotonic_deadline,
            // BYOK: keychain key management
            commands::ai::keys::set_key,
            commands::ai::keys::key_status,
            commands::ai::keys::delete_key,
            commands::ai::keys::list_key_status,
            // BYOK: non-secret provider-config persistence
            commands::ai::providers::load_providers,
            commands::ai::providers::save_providers,
            commands::ai::codex_system::codex_system_probe,
            commands::ai::codex_system::codex_system_turn_start,
            commands::ai::codex_system::codex_system_turn_steer,
            commands::ai::codex_system::codex_system_turn_interrupt,
            commands::ai::codex_system::codex_system_conversation_reset,
            commands::ai::provider_discovery::discover_provider_candidates,
            commands::ai::provider_discovery::auto_configure_provider_candidate,
            commands::ai::provider_discovery::create_provider_draft,
            commands::ai::provider_discovery::check_provider_draft,
            commands::ai::provider_discovery::import_provider_draft,
            commands::ai::provider_discovery::cancel_provider_draft,
            // BYOK: secure AI transport proxy
            commands::ai::ai_proxy::ai_proxy_request,
            commands::ai::ai_proxy::ai_proxy_stream,
            commands::ai::ai_proxy::ai_proxy_cancel,
            // BYOK: 垫图 reference-conditioned image edit (multipart /images/edits)
            commands::ai::image_edit::ai_image_edit,
            commands::ai::commerce_source_ingest::ai_ingest_competition_source_image,
            commands::ai::commerce_source_ingest::verify_commerce_source_ingest_receipt,
            commands::ai::commerce_held_out::create_commerce_held_out_commitment,
            commands::ai::commerce_held_out::verify_commerce_held_out_attestation,
            commands::ai::dashscope_image::ai_dashscope_image,
            commands::ai::dashscope_multimodal::ai_dashscope_structured_text,
            commands::ai::dashscope_multimodal::ai_dashscope_vision_json,
            commands::ai::dashscope_multimodal::ai_dashscope_video,
            commands::ai::game_asset_generation::preview_game_asset_generation,
            commands::ai::game_asset_generation::preview_game_asset_generation_repair,
            commands::ai::game_asset_generation::apply_game_asset_generation,
            commands::ai::game_asset_generation::verify_game_asset_generation_authorization,
            commands::ai::game_asset_generation::preview_game_asset_action_sheet_generation,
            commands::ai::game_asset_generation::preview_game_asset_action_sheet_repair,
            commands::ai::game_asset_generation::preview_game_asset_action_sheet_partial_repair,
            commands::ai::game_asset_generation::preview_game_asset_action_sheet_partial_reprocess,
            commands::ai::game_asset_generation::apply_game_asset_action_sheet_generation,
            commands::ai::game_asset_generation::apply_game_asset_action_sheet_repair,
            commands::ai::game_asset_generation::apply_game_asset_action_sheet_partial_repair,
            commands::ai::game_asset_generation::apply_game_asset_action_sheet_partial_reprocess,
            commands::ai::game_asset_generation::verify_game_asset_action_sheet_authorization,
            commands::ai::game_asset_generation::verify_game_asset_action_sheet_partial_authorization,
            commands::ai::game_asset_generation::verify_game_asset_action_sheet_repair_authorization,
            commands::ai::game_asset_generation::verify_game_asset_action_sheet_partial_repair_authorization,
            commands::ai::game_asset_generation::verify_game_asset_action_sheet_partial_reprocess_authorization,
            commands::ai::game_asset_generation::preview_game_asset_semantic_acceptance,
            commands::ai::game_asset_generation::apply_game_asset_semantic_acceptance,
            commands::ai::game_asset_generation::verify_game_asset_semantic_acceptance,
            commands::ai::game_asset_generation::compile_game_asset_production_bundle,
            commands::ai::game_asset_family::preview_game_asset_grounded_normalization,
            commands::ai::game_asset_family::apply_game_asset_grounded_normalization,
            commands::ai::game_asset_family::verify_game_asset_grounded_normalization_authorization,
            commands::ai::game_asset_family::preview_game_asset_family_acceptance,
            commands::ai::game_asset_family::apply_game_asset_family_acceptance,
            commands::ai::game_asset_family::verify_game_asset_family_acceptance,
            commands::ai::game_asset_family::compile_game_asset_family_bundle,
            commands::ai::game_map_processing::extract_game_map_prop_pack,
            commands::ai::game_map_processing::extract_game_map_terrain_atlas,
            commands::ai::game_map_processing::admit_game_map_live_artifact,
            commands::ai::game_map_processing::verify_game_map_live_artifact,
            commands::ai::game_map_processing::validate_game_map_runtime,
            commands::ai::game_map_processing::compose_game_map_preview,
            commands::ai::game_map_processing::accept_game_map_semantic_review,
            commands::ai::game_map_processing::verify_game_map_semantic_acceptance,
            commands::ai::multimodal_receipt::verify_multimodal_host_artifact,
            commands::ai::multimodal_receipt::promote_multimodal_video_playback,
            // PNG → SVG vectorization
            commands::vectorize::set_vectorizer_api_key,
            commands::vectorize::vectorizer_key_status,
            commands::vectorize::delete_vectorizer_api_key,
            commands::vectorize::vectorize_local_vtracer,
            commands::vectorize::vectorize_vectorizer_ai,
            commands::registry_desktop::registry_authorize_workspace,
            commands::registry_desktop::registry_preview_install,
            commands::registry_desktop::registry_apply_install,
            commands::registry_desktop::registry_validate_install,
            commands::registry_desktop::registry_install_receipt,
            commands::agent_host::agent_host_start,
            commands::agent_host::agent_host_status,
            commands::agent_host::agent_host_shutdown,
            commands::agent_host::agent_host_recover,
            commands::agent_host::agent_host_run_start,
            commands::agent_host::agent_host_node_claim,
            commands::agent_host::agent_host_node_complete,
            commands::agent_host::agent_host_node_heartbeat,
            commands::agent_host::agent_host_node_fail,
            commands::agent_host::agent_host_run_pause,
            commands::agent_host::agent_host_run_resume,
            commands::agent_host::agent_host_run_cancel,
            commands::speech::speech_host_capabilities,
            commands::speech::speech_microphone_devices,
            commands::speech::speech_request_permission,
            commands::speech::speech_recording_start,
            commands::speech::speech_recording_stop,
            commands::speech::speech_recording_cancel,
            #[cfg(desktop)]
            commands::updater::updater_status,
            #[cfg(desktop)]
            commands::updater::updater_check,
            #[cfg(desktop)]
            commands::updater::updater_download,
            #[cfg(desktop)]
            commands::updater::updater_cancel,
            #[cfg(desktop)]
            commands::updater::updater_install_and_relaunch,
            #[cfg(desktop)]
            commands::workspace_bridge::workspace_revision_read,
            #[cfg(desktop)]
            commands::workspace_bridge::workspace_revision_preview_export,
            #[cfg(desktop)]
            commands::workspace_bridge::workspace_revision_apply_export,
            #[cfg(desktop)]
            commands::workspace_bridge::workspace_run_events_read,
            #[cfg(desktop)]
            commands::workspace_bridge::workspace_run_events_write,
            #[cfg(desktop)]
            commands::coding_workspace::coding_workspace_create_managed,
            #[cfg(desktop)]
            commands::coding_workspace::coding_workspace_seed_managed_assets,
            #[cfg(desktop)]
            commands::coding_workspace::coding_workspace_snapshot,
            #[cfg(desktop)]
            commands::coding_workspace::coding_workspace_read_allowed,
            #[cfg(desktop)]
            commands::coding_workspace::coding_workspace_preview,
            #[cfg(desktop)]
            commands::coding_workspace::coding_workspace_stage,
            #[cfg(desktop)]
            commands::coding_workspace::coding_workspace_run_checks,
            #[cfg(desktop)]
            commands::coding_workspace::coding_workspace_promote,
            #[cfg(desktop)]
            commands::coding_workspace::coding_workspace_rollback,
        ])
        .setup(|app| {
            use tauri::Manager;

            #[cfg(target_os = "macos")]
            if commands::packaged_e2e::enabled() {
                use objc2::MainThreadMarker;
                use objc2_app_kit::NSApplication;
                use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};

                // This dedicated evidence bundle must never become the active
                // application on the user's desktop. Prohibited is stronger
                // than an accessory policy: AppKit cannot promote it while
                // WebKit still renders the non-interactive background window.
                app.set_activation_policy(tauri::ActivationPolicy::Prohibited);
                let main_thread = MainThreadMarker::new()
                    .ok_or("packaged E2E setup must run on the macOS main thread")?;
                NSApplication::sharedApplication(main_thread).unhideWithoutActivation();
                let activity = NSProcessInfo::processInfo().beginActivityWithOptions_reason(
                    NSActivityOptions::UserInitiatedAllowingIdleSystemSleep,
                    &NSString::from_str("Cutout packaged E2E WebView"),
                );
                // The dedicated executable owns this activity until process exit.
                // Forgetting the token is intentional and cannot affect production.
                std::mem::forget(activity);
                let window = app
                    .get_webview_window("main")
                    .ok_or("packaged E2E main window is unavailable")?;
                window.set_focusable(false)?;
                commands::packaged_e2e::initialize_window_background(app.handle())?;
                commands::packaged_e2e::start_background_window_watchdog(app.handle().clone());
                if !window.is_visible()? || window.is_focused()? {
                    return Err("packaged E2E window lifecycle is unsafe".into());
                }
                commands::packaged_e2e::native_checkpoint("webview-renderable");
            }

            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_notification::init())?;
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(application_context())
        .expect("error while running tauri application");
}
