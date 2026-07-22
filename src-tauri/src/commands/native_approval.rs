use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tokio::sync::oneshot;

pub async fn require_native_confirmation<R: Runtime>(
    app: &AppHandle<R>,
    title: &str,
    message: &str,
) -> Result<String, String> {
    let (tx, rx) = oneshot::channel();
    app.dialog()
        .message(message)
        .title(title)
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Approve".into(),
            "Cancel".into(),
        ))
        .show(move |approved| {
            let _ = tx.send(approved);
        });
    let approved = rx
        .await
        .map_err(|_| "Native approval dialog closed unexpectedly.".to_string())?;
    if !approved {
        return Err("Operation was not approved in the native confirmation dialog.".into());
    }
    Ok(format!("native-approval.{}", uuid::Uuid::new_v4()))
}
