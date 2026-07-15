use super::{
    agent_host::{agent_host_shutdown, AgentHostDesktopState},
    registry_desktop::RegistryDesktopState,
};
use reqwest::Url;
use serde::Serialize;
use std::{collections::HashSet, env, sync::Arc, time::Duration};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::{Mutex, Notify};

const DEFAULT_TIMEOUT_SECS: u64 = 30;

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

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSnapshot {
    phase: UpdatePhase,
    available_version: Option<String>,
    release_notes: Option<String>,
    published_at: Option<String>,
    channel: Option<String>,
    downloaded_bytes: u64,
    content_length: Option<u64>,
    error: Option<String>,
    unavailable_reason: Option<String>,
}

#[derive(Default)]
struct Inner {
    snapshot: UpdateSnapshot,
    update: Option<Update>,
    bytes: Option<Vec<u8>>,
}

#[derive(Default)]
pub struct UpdateRuntimeState {
    inner: Arc<Mutex<Inner>>,
    cancel: Arc<Notify>,
}

#[derive(Clone, Debug)]
struct RuntimeConfig {
    pubkey: String,
    endpoints: Vec<Url>,
    allowed_hosts: HashSet<String>,
    timeout: Duration,
}

fn injected(name: &str, compiled: Option<&'static str>) -> Option<String> {
    env::var(name)
        .ok()
        .or_else(|| compiled.map(str::to_owned))
        .filter(|value| !value.trim().is_empty())
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

fn busy(phase: UpdatePhase) -> bool {
    matches!(
        phase,
        UpdatePhase::Checking | UpdatePhase::Downloading | UpdatePhase::Installing
    )
}

async fn fail(state: &UpdateRuntimeState, message: String) -> String {
    let mut inner = state.inner.lock().await;
    inner.snapshot.phase = UpdatePhase::Error;
    inner.snapshot.error = Some(message.clone());
    message
}

#[tauri::command]
pub async fn updater_status(
    state: State<'_, UpdateRuntimeState>,
) -> Result<UpdateSnapshot, String> {
    let mut inner = state.inner.lock().await;
    if inner.snapshot.phase == UpdatePhase::Idle {
        if let Err(reason) = load_config("stable") {
            inner.snapshot.unavailable_reason = Some(reason);
        }
    }
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
            state.inner.lock().await.snapshot.unavailable_reason = Some(error.clone());
            return Err(error);
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
        inner.update = None;
        inner.bytes = None;
    }
    let updater = app
        .updater_builder()
        .pubkey(config.pubkey)
        .endpoints(config.endpoints)
        .map_err(|error| error.to_string())?
        .timeout(config.timeout)
        .build()
        .map_err(|error| error.to_string())?;
    let checked = tokio::time::timeout(config.timeout, updater.check()).await;
    let update = match checked {
        Ok(Ok(value)) => value,
        Ok(Err(error)) => return Err(fail(&state, error.to_string()).await),
        Err(_) => return Err(fail(&state, "Update check timed out.".into()).await),
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
            )
            .await);
        }
        inner.snapshot.phase = UpdatePhase::Available;
        inner.snapshot.available_version = Some(update.version.clone());
        inner.snapshot.release_notes = update.body.clone();
        inner.snapshot.published_at = update.date.map(|date| date.to_string());
        inner.update = Some(update);
    } else {
        inner.snapshot.phase = UpdatePhase::Idle;
    }
    Ok(inner.snapshot.clone())
}

#[tauri::command]
pub async fn updater_download(
    app: AppHandle,
    state: State<'_, UpdateRuntimeState>,
) -> Result<UpdateSnapshot, String> {
    let update = {
        let mut inner = state.inner.lock().await;
        if inner.snapshot.phase != UpdatePhase::Available {
            return Err("No checked update is available to download.".into());
        }
        inner.snapshot.phase = UpdatePhase::Downloading;
        inner.update.clone().ok_or("Update metadata is missing.")?
    };
    let progress_state = state.inner.clone();
    let progress_app = app.clone();
    let download = update.download(
        move |chunk, total| {
            let state = progress_state.clone();
            let app = progress_app.clone();
            tauri::async_runtime::spawn(async move {
                let mut inner = state.lock().await;
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
        _ = state.cancel.notified() => Err("Update download cancelled.".into()),
    };
    match bytes {
        Ok(bytes) => {
            let mut inner = state.inner.lock().await;
            inner.bytes = Some(bytes);
            inner.snapshot.phase = UpdatePhase::Ready;
            Ok(inner.snapshot.clone())
        }
        Err(error) => Err(fail(&state, error).await),
    }
}

#[tauri::command]
pub async fn updater_cancel(
    state: State<'_, UpdateRuntimeState>,
) -> Result<UpdateSnapshot, String> {
    let inner = state.inner.lock().await;
    if inner.snapshot.phase != UpdatePhase::Downloading {
        return Err("Only an active update download can be cancelled.".into());
    }
    drop(inner);
    state.cancel.notify_waiters();
    Ok(state.inner.lock().await.snapshot.clone())
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
        if inner.snapshot.phase != UpdatePhase::Ready {
            return Err("A verified update must be downloaded before installation.".into());
        }
        inner.snapshot.phase = UpdatePhase::Installing;
        (
            inner.update.clone().ok_or("Update metadata is missing.")?,
            inner
                .bytes
                .take()
                .ok_or("Verified update bytes are missing.")?,
        )
    };
    if let Some(workspace_handle) = workspace_handle {
        if let Err(error) = agent_host_shutdown(registry, host, workspace_handle).await {
            return Err(fail(&state, format!("Agent Host checkpoint failed: {error}")).await);
        }
    }
    if let Err(error) = update.install(bytes) {
        return Err(fail(&state, error.to_string()).await);
    }
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn operation_phases_are_single_flight() {
        assert!(busy(UpdatePhase::Checking));
        assert!(busy(UpdatePhase::Downloading));
        assert!(busy(UpdatePhase::Installing));
        assert!(!busy(UpdatePhase::Ready));
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
}
