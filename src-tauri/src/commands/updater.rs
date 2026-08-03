use super::{
    agent_host::{agent_host_shutdown, AgentHostDesktopState},
    registry_desktop::RegistryDesktopState,
};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashSet},
    env,
    sync::Arc,
    time::Duration,
};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::{Mutex, Notify};

const DEFAULT_TIMEOUT_SECS: u64 = 30;
const RELEASE_NOTES_PROTOCOL: &str = "cutout.release-notes.v1";
const RELEASE_NOTES_MAX_BYTES: usize = 48 * 1024;
const RELEASE_NOTES_MAX_HEADLINE_CHARS: usize = 120;
const RELEASE_NOTES_MAX_HIGHLIGHTS: usize = 6;
const RELEASE_NOTES_MAX_ID_CHARS: usize = 64;
const RELEASE_NOTES_MAX_TITLE_CHARS: usize = 100;
const RELEASE_NOTES_MAX_BODY_CHARS: usize = 600;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalizedReleaseNotesHighlight {
    id: String,
    title: String,
    body: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    media_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    alt: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalizedReleaseNotesLocale {
    headline: String,
    highlights: Vec<LocalizedReleaseNotesHighlight>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalizedReleaseNotes {
    protocol: String,
    version: String,
    released_on: String,
    locales: BTreeMap<String, LocalizedReleaseNotesLocale>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UpdatePhase {
    #[default]
    Idle,
    Checking,
    Available,
    Downloading,
    Ready,
    Installing,
    Error,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdateRetryAction {
    Check,
    Download,
    Install,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateChannelCapability {
    available: bool,
    reason: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct UpdateChannelCapabilities {
    stable: UpdateChannelCapability,
    beta: UpdateChannelCapability,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSnapshot {
    phase: UpdatePhase,
    available_version: Option<String>,
    release_notes: Option<String>,
    published_at: Option<String>,
    localized_release_notes: Option<LocalizedReleaseNotes>,
    channel: Option<String>,
    downloaded_bytes: u64,
    content_length: Option<u64>,
    error: Option<String>,
    unavailable_reason: Option<String>,
    retry_action: Option<UpdateRetryAction>,
    channel_capabilities: UpdateChannelCapabilities,
}

fn is_plain_text(value: &str, maximum: usize) -> bool {
    !value.is_empty()
        && value.trim() == value
        && value.chars().count() <= maximum
        && !value.chars().any(char::is_control)
        && !value.contains('<')
        && !value.contains('>')
        && !value.contains("://")
}

fn is_semantic_version(value: &str) -> bool {
    let (core, prerelease) = match value.split_once('-') {
        Some((core, prerelease)) => (core, Some(prerelease)),
        None => (value, None),
    };
    let components = core.split('.').collect::<Vec<_>>();
    if components.len() != 3
        || components.iter().any(|component| {
            component.is_empty()
                || !component.bytes().all(|byte| byte.is_ascii_digit())
                || (component.len() > 1 && component.starts_with('0'))
        })
    {
        return false;
    }
    match prerelease {
        None => true,
        Some(prerelease) => {
            !prerelease.is_empty()
                && prerelease.split('.').all(|component| {
                    !component.is_empty()
                        && component
                            .bytes()
                            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
                        && !(component.len() > 1
                            && component.bytes().all(|byte| byte.is_ascii_digit())
                            && component.starts_with('0'))
                })
        }
    }
}

fn is_calendar_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes
            .iter()
            .enumerate()
            .any(|(index, byte)| !matches!(index, 4 | 7) && !byte.is_ascii_digit())
    {
        return false;
    }
    let Ok(year) = value[0..4].parse::<u32>() else {
        return false;
    };
    if year < 100 {
        return false;
    }
    let Ok(month) = value[5..7].parse::<u32>() else {
        return false;
    };
    let Ok(day) = value[8..10].parse::<u32>() else {
        return false;
    };
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let maximum = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    day > 0 && day <= maximum
}

fn validate_localized_release_notes(notes: &LocalizedReleaseNotes, expected_version: &str) -> bool {
    if notes.protocol != RELEASE_NOTES_PROTOCOL
        || notes.version != expected_version
        || !is_semantic_version(&notes.version)
        || !is_calendar_date(&notes.released_on)
        || notes.locales.is_empty()
        || notes.locales.len() > 5
        || !notes.locales.contains_key("en")
        || notes
            .locales
            .keys()
            .any(|locale| !matches!(locale.as_str(), "en" | "zh-CN" | "ja" | "fr" | "es"))
    {
        return false;
    }
    let Some(english) = notes.locales.get("en") else {
        return false;
    };
    if english.highlights.is_empty() || english.highlights.len() > RELEASE_NOTES_MAX_HIGHLIGHTS {
        return false;
    }
    let expected_shape = english
        .highlights
        .iter()
        .map(|highlight| (&highlight.id, &highlight.media_id))
        .collect::<Vec<_>>();
    notes.locales.values().all(|locale| {
        is_plain_text(&locale.headline, RELEASE_NOTES_MAX_HEADLINE_CHARS)
            && !locale.highlights.is_empty()
            && locale.highlights.len() <= RELEASE_NOTES_MAX_HIGHLIGHTS
            && locale
                .highlights
                .iter()
                .map(|highlight| (&highlight.id, &highlight.media_id))
                .eq(expected_shape.iter().copied())
            && locale.highlights.iter().all(|highlight| {
                is_plain_text(&highlight.id, RELEASE_NOTES_MAX_ID_CHARS)
                    && highlight.id.bytes().enumerate().all(|(index, byte)| {
                        byte.is_ascii_lowercase()
                            || byte.is_ascii_digit()
                            || (index > 0 && (byte == b'.' || byte == b'-'))
                    })
                    && !highlight.id.ends_with('.')
                    && !highlight.id.ends_with('-')
                    && is_plain_text(&highlight.title, RELEASE_NOTES_MAX_TITLE_CHARS)
                    && is_plain_text(&highlight.body, RELEASE_NOTES_MAX_BODY_CHARS)
                    // No bundled release-note media ids are shipped yet.
                    && highlight.media_id.is_none()
                    && highlight.alt.is_none()
            })
    })
}

fn project_localized_release_notes(
    raw_json: &Value,
    expected_version: &str,
) -> Option<LocalizedReleaseNotes> {
    let value = raw_json.get("cutoutReleaseNotes")?;
    if serde_json::to_vec(value).ok()?.len() > RELEASE_NOTES_MAX_BYTES {
        return None;
    }
    if value
        .get("locales")
        .and_then(Value::as_object)
        .is_some_and(|locales| {
            locales.values().any(|locale| {
                locale
                    .get("highlights")
                    .and_then(Value::as_array)
                    .is_some_and(|highlights| {
                        highlights.iter().any(|highlight| {
                            highlight.get("mediaId").is_some() || highlight.get("alt").is_some()
                        })
                    })
            })
        })
    {
        return None;
    }
    let notes = serde_json::from_value::<LocalizedReleaseNotes>(value.clone()).ok()?;
    validate_localized_release_notes(&notes, expected_version).then_some(notes)
}

fn set_available_release(
    snapshot: &mut UpdateSnapshot,
    version: String,
    release_notes: Option<String>,
    published_at: Option<String>,
    raw_json: &Value,
) {
    snapshot.phase = UpdatePhase::Available;
    snapshot.localized_release_notes = project_localized_release_notes(raw_json, &version);
    snapshot.available_version = Some(version);
    snapshot.release_notes = release_notes;
    snapshot.published_at = published_at;
    snapshot.error = None;
    snapshot.retry_action = None;
}

#[derive(Default)]
struct Inner {
    snapshot: UpdateSnapshot,
    update: Option<Update>,
    bytes: Option<Vec<u8>>,
    operation_id: u64,
    cancel: Option<Arc<Notify>>,
}

#[derive(Default)]
pub struct UpdateRuntimeState {
    inner: Arc<Mutex<Inner>>,
}

#[derive(Clone, Debug)]
struct RuntimeConfig {
    pubkey: String,
    endpoints: Vec<Url>,
    allowed_hosts: HashSet<String>,
    timeout: Duration,
}

fn select_injected(
    compiled: Option<&str>,
    runtime: Option<String>,
    allow_runtime_override: bool,
) -> Option<String> {
    (allow_runtime_override.then_some(runtime).flatten())
        .or_else(|| compiled.map(str::to_owned))
        .filter(|value| !value.trim().is_empty())
}

fn injected(name: &str, compiled: Option<&'static str>) -> Option<String> {
    let runtime = if cfg!(debug_assertions) {
        env::var(name).ok()
    } else {
        None
    };
    select_injected(compiled, runtime, cfg!(debug_assertions))
}

fn load_config(channel: &str) -> Result<RuntimeConfig, String> {
    if !matches!(channel, "stable" | "beta") {
        return Err("Update channel must be stable or beta.".into());
    }
    let pubkey = injected(
        "CUTOUT_UPDATER_PUBKEY",
        option_env!("CUTOUT_UPDATER_PUBKEY"),
    )
    .ok_or("Updates are unavailable: no release public key is configured.")?;
    let endpoint_name = if channel == "beta" {
        "CUTOUT_UPDATER_BETA_ENDPOINTS"
    } else {
        "CUTOUT_UPDATER_STABLE_ENDPOINTS"
    };
    let compiled_endpoints = if channel == "beta" {
        option_env!("CUTOUT_UPDATER_BETA_ENDPOINTS")
    } else {
        option_env!("CUTOUT_UPDATER_STABLE_ENDPOINTS")
    };
    let raw_endpoints = injected(endpoint_name, compiled_endpoints)
        .ok_or_else(|| format!("Updates are unavailable: no {channel} endpoint is configured."))?;
    let allowed_hosts: HashSet<_> = injected(
        "CUTOUT_UPDATER_ALLOWED_HOSTS",
        option_env!("CUTOUT_UPDATER_ALLOWED_HOSTS"),
    )
    .ok_or("Updates are unavailable: no endpoint host allowlist is configured.")?
    .split(',')
    .map(|host| host.trim().to_ascii_lowercase())
    .filter(|host| !host.is_empty())
    .collect();
    if allowed_hosts.is_empty() {
        return Err("Updates are unavailable: endpoint host allowlist is empty.".into());
    }
    let endpoints = raw_endpoints
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(Url::parse)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Invalid updater endpoint: {error}"))?;
    if endpoints.is_empty() {
        return Err(format!(
            "Updates are unavailable: no {channel} endpoint is configured."
        ));
    }
    for endpoint in &endpoints {
        validate_url(endpoint, &allowed_hosts, "Updater endpoint")?;
    }
    let timeout = injected(
        "CUTOUT_UPDATER_TIMEOUT_SECS",
        option_env!("CUTOUT_UPDATER_TIMEOUT_SECS"),
    )
    .and_then(|value| value.parse().ok())
    .map(Duration::from_secs)
    .unwrap_or(Duration::from_secs(DEFAULT_TIMEOUT_SECS));
    Ok(RuntimeConfig {
        pubkey,
        endpoints,
        allowed_hosts,
        timeout,
    })
}

fn validate_url(url: &Url, allowed_hosts: &HashSet<String>, label: &str) -> Result<(), String> {
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    if url.scheme() != "https" || !allowed_hosts.contains(&host) {
        return Err(format!(
            "{label} must use HTTPS and an explicitly allowed host."
        ));
    }
    Ok(())
}

fn channel_capability(channel: &str) -> UpdateChannelCapability {
    match load_config(channel) {
        Ok(_) => UpdateChannelCapability {
            available: true,
            reason: None,
        },
        Err(reason) => UpdateChannelCapability {
            available: false,
            reason: Some(reason),
        },
    }
}

fn channel_capabilities() -> UpdateChannelCapabilities {
    UpdateChannelCapabilities {
        stable: channel_capability("stable"),
        beta: channel_capability("beta"),
    }
}

fn refresh_capabilities(snapshot: &mut UpdateSnapshot) {
    let capabilities = channel_capabilities();
    snapshot.unavailable_reason = if capabilities.stable.available || capabilities.beta.available {
        None
    } else {
        capabilities
            .stable
            .reason
            .clone()
            .or_else(|| capabilities.beta.reason.clone())
    };
    snapshot.channel_capabilities = capabilities;
}

fn busy(phase: UpdatePhase) -> bool {
    matches!(
        phase,
        UpdatePhase::Checking | UpdatePhase::Downloading | UpdatePhase::Installing
    )
}

fn mark_failure(inner: &mut Inner, message: String, retry_action: UpdateRetryAction) -> String {
    inner.snapshot.phase = UpdatePhase::Error;
    inner.snapshot.error = Some(message.clone());
    inner.snapshot.retry_action = Some(retry_action);
    inner.cancel = None;
    if retry_action == UpdateRetryAction::Download {
        inner.bytes = None;
        inner.snapshot.downloaded_bytes = 0;
        inner.snapshot.content_length = None;
    }
    message
}

async fn fail(
    state: &UpdateRuntimeState,
    message: String,
    retry_action: UpdateRetryAction,
) -> String {
    let mut inner = state.inner.lock().await;
    mark_failure(&mut inner, message, retry_action)
}

fn can_download(snapshot: &UpdateSnapshot) -> bool {
    snapshot.phase == UpdatePhase::Available
        || (snapshot.phase == UpdatePhase::Error
            && snapshot.retry_action == Some(UpdateRetryAction::Download))
}

fn can_install(snapshot: &UpdateSnapshot) -> bool {
    snapshot.phase == UpdatePhase::Ready
        || (snapshot.phase == UpdatePhase::Error
            && snapshot.retry_action == Some(UpdateRetryAction::Install))
}

fn cancel_download(inner: &mut Inner) -> Result<(UpdateSnapshot, Arc<Notify>), String> {
    if inner.snapshot.phase != UpdatePhase::Downloading {
        return Err("Only an active update download can be cancelled.".into());
    }
    let cancel = match inner.cancel.take() {
        Some(cancel) => cancel,
        None => {
            return Err(mark_failure(
                inner,
                "Update cancellation state is missing.".into(),
                UpdateRetryAction::Download,
            ))
        }
    };
    inner.operation_id += 1;
    inner.snapshot.phase = UpdatePhase::Available;
    inner.snapshot.downloaded_bytes = 0;
    inner.snapshot.content_length = None;
    inner.snapshot.error = None;
    inner.snapshot.retry_action = None;
    inner.bytes = None;
    Ok((inner.snapshot.clone(), cancel))
}

#[tauri::command]
pub async fn updater_status(
    state: State<'_, UpdateRuntimeState>,
) -> Result<UpdateSnapshot, String> {
    let mut inner = state.inner.lock().await;
    refresh_capabilities(&mut inner.snapshot);
    Ok(inner.snapshot.clone())
}

#[tauri::command]
pub async fn updater_check(
    app: AppHandle,
    state: State<'_, UpdateRuntimeState>,
    channel: String,
) -> Result<UpdateSnapshot, String> {
    let config = match load_config(&channel) {
        Ok(config) => config,
        Err(error) => {
            let mut inner = state.inner.lock().await;
            refresh_capabilities(&mut inner.snapshot);
            return Err(mark_failure(&mut inner, error, UpdateRetryAction::Check));
        }
    };
    {
        let mut inner = state.inner.lock().await;
        if busy(inner.snapshot.phase) {
            return Err("An update operation is already running.".into());
        }
        inner.snapshot = UpdateSnapshot {
            phase: UpdatePhase::Checking,
            channel: Some(channel),
            ..Default::default()
        };
        refresh_capabilities(&mut inner.snapshot);
        inner.update = None;
        inner.bytes = None;
        inner.cancel = None;
    }
    let updater = match app
        .updater_builder()
        .pubkey(config.pubkey)
        .endpoints(config.endpoints)
    {
        Ok(builder) => builder,
        Err(error) => return Err(fail(&state, error.to_string(), UpdateRetryAction::Check).await),
    }
    .timeout(config.timeout)
    .build();
    let updater = match updater {
        Ok(updater) => updater,
        Err(error) => return Err(fail(&state, error.to_string(), UpdateRetryAction::Check).await),
    };
    let checked = tokio::time::timeout(config.timeout, updater.check()).await;
    let update = match checked {
        Ok(Ok(value)) => value,
        Ok(Err(error)) => {
            return Err(fail(&state, error.to_string(), UpdateRetryAction::Check).await)
        }
        Err(_) => {
            return Err(fail(
                &state,
                "Update check timed out.".into(),
                UpdateRetryAction::Check,
            )
            .await)
        }
    };
    let mut inner = state.inner.lock().await;
    if let Some(update) = update {
        if validate_url(
            &update.download_url,
            &config.allowed_hosts,
            "Update artifact URL",
        )
        .is_err()
        {
            drop(inner);
            return Err(fail(
                &state,
                "Update artifact URL is outside the HTTPS allowlist.".into(),
                UpdateRetryAction::Check,
            )
            .await);
        }
        set_available_release(
            &mut inner.snapshot,
            update.version.clone(),
            update.body.clone(),
            update.date.map(|date| date.to_string()),
            &update.raw_json,
        );
        inner.update = Some(update);
    } else {
        inner.snapshot.phase = UpdatePhase::Idle;
        inner.snapshot.error = None;
        inner.snapshot.retry_action = None;
    }
    Ok(inner.snapshot.clone())
}

#[tauri::command]
pub async fn updater_download(
    app: AppHandle,
    state: State<'_, UpdateRuntimeState>,
) -> Result<UpdateSnapshot, String> {
    let (update, operation_id, cancel) = {
        let mut inner = state.inner.lock().await;
        if !can_download(&inner.snapshot) {
            return Err("No checked update is available to download.".into());
        }
        let update = match inner.update.clone() {
            Some(update) => update,
            None => {
                return Err(mark_failure(
                    &mut inner,
                    "Update metadata is missing.".into(),
                    UpdateRetryAction::Check,
                ))
            }
        };
        inner.operation_id += 1;
        let operation_id = inner.operation_id;
        let cancel = Arc::new(Notify::new());
        inner.snapshot.phase = UpdatePhase::Downloading;
        inner.snapshot.downloaded_bytes = 0;
        inner.snapshot.content_length = None;
        inner.snapshot.error = None;
        inner.snapshot.retry_action = None;
        inner.bytes = None;
        inner.cancel = Some(cancel.clone());
        (update, operation_id, cancel)
    };
    let progress_state = state.inner.clone();
    let progress_app = app.clone();
    let download = update.download(
        move |chunk, total| {
            let state = progress_state.clone();
            let app = progress_app.clone();
            tauri::async_runtime::spawn(async move {
                let mut inner = state.lock().await;
                if inner.operation_id != operation_id
                    || inner.snapshot.phase != UpdatePhase::Downloading
                {
                    return;
                }
                inner.snapshot.downloaded_bytes += chunk as u64;
                inner.snapshot.content_length = total;
                let _ = app.emit("cutout://updater-progress", inner.snapshot.clone());
            });
        },
        || {},
    );
    tokio::pin!(download);
    let bytes = tokio::select! {
        result = &mut download => result.map_err(|error| error.to_string()),
        _ = cancel.notified() => Err("Update download cancelled.".into()),
    };
    let mut inner = state.inner.lock().await;
    if inner.operation_id != operation_id || inner.snapshot.phase != UpdatePhase::Downloading {
        return Ok(inner.snapshot.clone());
    }
    match bytes {
        Ok(bytes) => {
            inner.bytes = Some(bytes);
            inner.snapshot.phase = UpdatePhase::Ready;
            inner.snapshot.error = None;
            inner.snapshot.retry_action = None;
            inner.cancel = None;
            Ok(inner.snapshot.clone())
        }
        Err(error) => Err(mark_failure(&mut inner, error, UpdateRetryAction::Download)),
    }
}

#[tauri::command]
pub async fn updater_cancel(
    state: State<'_, UpdateRuntimeState>,
) -> Result<UpdateSnapshot, String> {
    let (snapshot, cancel) = {
        let mut inner = state.inner.lock().await;
        cancel_download(&mut inner)?
    };
    cancel.notify_one();
    Ok(snapshot)
}

#[tauri::command]
pub async fn updater_install_and_relaunch(
    app: AppHandle,
    state: State<'_, UpdateRuntimeState>,
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: Option<String>,
) -> Result<(), String> {
    let (update, bytes) = {
        let mut inner = state.inner.lock().await;
        if !can_install(&inner.snapshot) {
            return Err("A verified update must be downloaded before installation.".into());
        }
        let update = match inner.update.clone() {
            Some(update) => update,
            None => {
                return Err(mark_failure(
                    &mut inner,
                    "Update metadata is missing.".into(),
                    UpdateRetryAction::Check,
                ))
            }
        };
        let bytes = match inner.bytes.take() {
            Some(bytes) => bytes,
            None => {
                return Err(mark_failure(
                    &mut inner,
                    "Verified update bytes are missing.".into(),
                    UpdateRetryAction::Download,
                ))
            }
        };
        inner.snapshot.phase = UpdatePhase::Installing;
        inner.snapshot.error = None;
        inner.snapshot.retry_action = None;
        (update, bytes)
    };
    if let Some(workspace_handle) = workspace_handle {
        if let Err(error) = agent_host_shutdown(registry, host, workspace_handle).await {
            let mut inner = state.inner.lock().await;
            inner.bytes = Some(bytes);
            return Err(mark_failure(
                &mut inner,
                format!("Agent Host checkpoint failed: {error}"),
                UpdateRetryAction::Install,
            ));
        }
    }
    if let Err(error) = update.install(bytes) {
        return Err(fail(&state, error.to_string(), UpdateRetryAction::Download).await);
    }
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn release_notes_raw(version: &str) -> Value {
        json!({
            "version": version,
            "notes": "Readable English fallback.",
            "cutoutReleaseNotes": {
                "protocol": "cutout.release-notes.v1",
                "version": version,
                "releasedOn": "2026-08-03",
                "locales": {
                    "en": {
                        "headline": "Know what changed",
                        "highlights": [
                            { "id": "review-first", "title": "Review first", "body": "Read the details before installing." },
                            { "id": "reopen-later", "title": "Reopen later", "body": "The same notes remain available offline." }
                        ]
                    },
                    "zh-CN": {
                        "headline": "了解本次更新",
                        "highlights": [
                            { "id": "review-first", "title": "安装前查看", "body": "安装前先阅读详细说明。" },
                            { "id": "reopen-later", "title": "稍后再看", "body": "离线时仍可重新查看。" }
                        ]
                    }
                }
            }
        })
    }

    #[test]
    fn operation_phases_are_single_flight() {
        assert!(busy(UpdatePhase::Checking));
        assert!(busy(UpdatePhase::Downloading));
        assert!(busy(UpdatePhase::Installing));
        assert!(!busy(UpdatePhase::Ready));
    }

    #[test]
    fn production_selection_ignores_runtime_overrides() {
        assert_eq!(
            select_injected(None, Some("runtime-value".into()), false),
            None
        );
        assert_eq!(
            select_injected(Some("compiled-value"), Some("runtime-value".into()), false),
            Some("compiled-value".into())
        );
        assert_eq!(
            select_injected(Some("compiled-value"), Some("runtime-value".into()), true),
            Some("runtime-value".into())
        );
    }

    #[test]
    fn cancellation_restores_a_native_downloadable_state() {
        let mut inner = Inner::default();
        inner.snapshot.phase = UpdatePhase::Downloading;
        inner.snapshot.downloaded_bytes = 42;
        inner.snapshot.content_length = Some(100);
        inner.operation_id = 7;
        inner.cancel = Some(Arc::new(Notify::new()));

        let (snapshot, _) = cancel_download(&mut inner).unwrap();

        assert_eq!(snapshot.phase, UpdatePhase::Available);
        assert_eq!(snapshot.downloaded_bytes, 0);
        assert_eq!(snapshot.content_length, None);
        assert_eq!(snapshot.retry_action, None);
        assert_eq!(inner.operation_id, 8);
        assert!(can_download(&snapshot));
    }

    #[test]
    fn failed_downloads_remain_retryable() {
        let mut inner = Inner::default();
        inner.snapshot.phase = UpdatePhase::Downloading;
        inner.snapshot.downloaded_bytes = 42;
        inner.snapshot.content_length = Some(100);

        mark_failure(
            &mut inner,
            "network failed".into(),
            UpdateRetryAction::Download,
        );

        assert_eq!(inner.snapshot.phase, UpdatePhase::Error);
        assert_eq!(
            inner.snapshot.retry_action,
            Some(UpdateRetryAction::Download)
        );
        assert_eq!(inner.snapshot.downloaded_bytes, 0);
        assert!(can_download(&inner.snapshot));
    }

    #[test]
    fn failed_preinstall_steps_remain_install_retryable() {
        let mut inner = Inner::default();
        inner.snapshot.phase = UpdatePhase::Installing;
        inner.bytes = Some(vec![1, 2, 3]);

        mark_failure(
            &mut inner,
            "checkpoint failed".into(),
            UpdateRetryAction::Install,
        );

        assert_eq!(inner.snapshot.phase, UpdatePhase::Error);
        assert_eq!(
            inner.snapshot.retry_action,
            Some(UpdateRetryAction::Install)
        );
        assert_eq!(inner.bytes.as_deref(), Some([1, 2, 3].as_slice()));
        assert!(can_install(&inner.snapshot));
    }

    #[test]
    fn channels_are_closed_set() {
        assert!(load_config("nightly")
            .unwrap_err()
            .contains("stable or beta"));
    }

    #[test]
    fn urls_require_https_and_an_exact_allowed_host() {
        let hosts = HashSet::from(["updates.cutout.example".to_string()]);
        assert!(validate_url(
            &Url::parse("https://updates.cutout.example/stable.json").unwrap(),
            &hosts,
            "endpoint",
        )
        .is_ok());
        assert!(validate_url(
            &Url::parse("http://updates.cutout.example/stable.json").unwrap(),
            &hosts,
            "endpoint",
        )
        .is_err());
        assert!(validate_url(
            &Url::parse("https://updates.cutout.example.attacker.test/stable.json").unwrap(),
            &hosts,
            "endpoint",
        )
        .is_err());
    }

    #[test]
    fn projects_bounded_localized_notes_from_the_existing_raw_response() {
        let projected = project_localized_release_notes(&release_notes_raw("0.1.16"), "0.1.16")
            .expect("valid projection");

        assert_eq!(projected.protocol, RELEASE_NOTES_PROTOCOL);
        assert_eq!(projected.version, "0.1.16");
        assert_eq!(projected.locales.len(), 2);
        assert_eq!(projected.locales["zh-CN"].highlights[0].id, "review-first");
        assert_eq!(
            serde_json::to_value(projected).unwrap()["releasedOn"],
            "2026-08-03"
        );
    }

    #[test]
    fn release_note_versions_and_dates_use_strict_shared_vocabulary() {
        assert!(is_semantic_version("0.1.16"));
        assert!(is_semantic_version("0.1.16-beta.1"));
        assert!(!is_semantic_version("v0.1.16"));
        assert!(!is_semantic_version("0.1.16-01"));
        assert!(is_calendar_date("2028-02-29"));
        assert!(!is_calendar_date("2026-02-29"));
    }

    #[test]
    fn ignores_mismatched_unknown_and_oversized_extensions() {
        assert!(project_localized_release_notes(&release_notes_raw("0.1.16"), "0.1.17").is_none());

        let mut unknown = release_notes_raw("0.1.16");
        unknown["cutoutReleaseNotes"]["remoteUrl"] = json!("https://example.test/notes");
        assert!(project_localized_release_notes(&unknown, "0.1.16").is_none());

        let mut oversized = release_notes_raw("0.1.16");
        oversized["cutoutReleaseNotes"]["padding"] = json!("x".repeat(RELEASE_NOTES_MAX_BYTES));
        assert!(project_localized_release_notes(&oversized, "0.1.16").is_none());
    }

    #[test]
    fn rejects_malformed_locale_content_and_unshipped_media() {
        let mut parity = release_notes_raw("0.1.16");
        parity["cutoutReleaseNotes"]["locales"]["zh-CN"]["highlights"][0]["id"] =
            json!("different-id");
        assert!(project_localized_release_notes(&parity, "0.1.16").is_none());

        let mut control = release_notes_raw("0.1.16");
        control["cutoutReleaseNotes"]["locales"]["en"]["headline"] = json!("unsafe\nheadline");
        assert!(project_localized_release_notes(&control, "0.1.16").is_none());

        let mut markup = release_notes_raw("0.1.16");
        markup["cutoutReleaseNotes"]["locales"]["en"]["headline"] =
            json!("<strong>unsafe</strong>");
        assert!(project_localized_release_notes(&markup, "0.1.16").is_none());

        let mut media = release_notes_raw("0.1.16");
        media["cutoutReleaseNotes"]["locales"]["en"]["highlights"][0]["mediaId"] =
            json!("https://example.test/image.png");
        media["cutoutReleaseNotes"]["locales"]["en"]["highlights"][0]["alt"] = json!("Preview");
        assert!(project_localized_release_notes(&media, "0.1.16").is_none());
    }

    #[test]
    fn invalid_localized_notes_do_not_interfere_with_available_update_state() {
        let mut raw = release_notes_raw("0.1.16");
        raw["cutoutReleaseNotes"]["protocol"] = json!("unsupported");
        let mut snapshot = UpdateSnapshot::default();

        set_available_release(
            &mut snapshot,
            "0.1.16".into(),
            Some("Readable English fallback.".into()),
            Some("2026-08-03T00:00:00Z".into()),
            &raw,
        );

        assert_eq!(snapshot.phase, UpdatePhase::Available);
        assert_eq!(snapshot.available_version.as_deref(), Some("0.1.16"));
        assert_eq!(
            snapshot.release_notes.as_deref(),
            Some("Readable English fallback.")
        );
        assert_eq!(
            snapshot.published_at.as_deref(),
            Some("2026-08-03T00:00:00Z")
        );
        assert!(snapshot.localized_release_notes.is_none());
        assert!(can_download(&snapshot));
    }
}
