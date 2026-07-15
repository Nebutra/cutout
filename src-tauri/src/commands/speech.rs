use serde::Serialize;
const MAX_RECORDING_BYTES: u64 = 100 * 1024 * 1024;
const MAX_DURATION_MS: u64 = 10 * 60 * 1000;
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SpeechHostCapabilities {
    protocol: &'static str,
    platform: &'static str,
    microphone: &'static str,
    recording: bool,
    global_shortcut: bool,
    max_recording_bytes: u64,
    max_duration_ms: u64,
    reason: &'static str,
}
fn capabilities() -> SpeechHostCapabilities {
    SpeechHostCapabilities {
        protocol: "cutout.speech-host-capabilities.v1",
        platform: std::env::consts::OS,
        microphone: "unavailable",
        recording: false,
        global_shortcut: false,
        max_recording_bytes: MAX_RECORDING_BYTES,
        max_duration_ms: MAX_DURATION_MS,
        reason: "This build has no authorized microphone capture or global-shortcut backend.",
    }
}
#[tauri::command]
pub fn speech_host_capabilities() -> SpeechHostCapabilities {
    capabilities()
}
#[tauri::command]
pub fn speech_microphone_devices() -> Vec<serde_json::Value> {
    Vec::new()
}
#[tauri::command]
pub fn speech_request_permission() -> SpeechHostCapabilities {
    capabilities()
}
#[tauri::command]
pub fn speech_recording_start(device_id: Option<String>) -> Result<serde_json::Value, String> {
    if device_id
        .as_ref()
        .is_some_and(|v| v.len() > 240 || v.chars().any(char::is_control))
    {
        return Err("Invalid microphone device id.".into());
    }
    Err("capability-required: microphone recording backend is unavailable in this build".into())
}
#[tauri::command]
pub fn speech_recording_stop(session_id: String) -> Result<serde_json::Value, String> {
    validate_session_id(&session_id)?;
    Err("capability-required: microphone recording backend is unavailable in this build".into())
}
#[tauri::command]
pub fn speech_recording_cancel(session_id: String) -> Result<(), String> {
    validate_session_id(&session_id)
}
fn validate_session_id(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 160
        || value
            .chars()
            .any(|c| c.is_control() || c == '/' || c == '\\')
    {
        return Err("Invalid speech recording session id.".into());
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn capability_is_truthful_and_bounded() {
        let v = capabilities();
        assert!(!v.recording);
        assert!(!v.global_shortcut);
        assert_eq!(v.microphone, "unavailable");
        assert_eq!(v.max_recording_bytes, 100 * 1024 * 1024)
    }
    #[test]
    fn session_ids_cannot_escape_file_boundary() {
        assert!(validate_session_id("session-1").is_ok());
        assert!(validate_session_id("../secret").is_err());
        assert!(validate_session_id("bad/path").is_err());
        assert!(validate_session_id("").is_err())
    }
}
