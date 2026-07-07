mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::save_assets::save_assets,
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
        ])
        .setup(|app| {
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
