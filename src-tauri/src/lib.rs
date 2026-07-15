mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(commands::registry_desktop::RegistryDesktopState::default())
        .manage(commands::agent_host::AgentHostDesktopState::default());
    #[cfg(desktop)]
    let builder = builder.manage(commands::updater::UpdateRuntimeState::default());
    builder
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::save_assets::save_assets,
            commands::save_bundle::save_bundle,
            commands::scan_repository::scan_repository,
            // BYOK: keychain key management
            commands::ai::keys::set_key,
            commands::ai::keys::key_status,
            commands::ai::keys::delete_key,
            commands::ai::keys::list_key_status,
            // BYOK: non-secret provider-config persistence
            commands::ai::providers::load_providers,
            commands::ai::providers::save_providers,
            // BYOK: secure AI transport proxy
            commands::ai::ai_proxy::ai_proxy_request,
            commands::ai::ai_proxy::ai_proxy_stream,
            // BYOK: 垫图 reference-conditioned image edit (multipart /images/edits)
            commands::ai::image_edit::ai_image_edit,
            // AI Native: file-queue JSON API for local agents / CLI
            commands::ai_native::ai_native_paths,
            commands::ai_native::ai_native_poll,
            commands::ai_native::ai_native_complete,
            commands::ai_native::ai_native_read_file,
            commands::ai_native::ai_native_write_artifact,
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
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
