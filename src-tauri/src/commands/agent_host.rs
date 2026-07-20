use super::registry_desktop::{authorized, RegistryDesktopState};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::State;
use tokio::fs;
const FILE: &str = "agent-host-state.json";
#[derive(Default)]
pub struct AgentHostDesktopState {
    locks: Mutex<HashMap<String, std::sync::Arc<tokio::sync::Mutex<()>>>>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostFile {
    version: u8,
    status: String,
    instance_id: Option<String>,
    runs: HashMap<String, Run>,
    receipts: HashMap<String, Receipt>,
    events: Vec<HostEvent>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    id: String,
    status: String,
    created_at: u64,
    updated_at: u64,
    nodes: HashMap<String, Node>,
    cancel_reason: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    id: String,
    effect_key: Option<String>,
    status: String,
    attempts: Vec<Attempt>,
    lease: Option<Lease>,
    receipt_id: Option<String>,
    next_attempt_at: Option<u64>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attempt {
    number: u32,
    started_at: u64,
    completed_at: Option<u64>,
    error: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lease {
    owner: String,
    #[serde(default)]
    lease_id: String,
    heartbeat_at: u64,
    expires_at: u64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaseGrant {
    owner: String,
    lease_id: String,
    attempt: u32,
    expires_at: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimOutcome {
    claimed: bool,
    grant: Option<LeaseGrant>,
    state: HostFile,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    receipt_id: String,
    run_id: String,
    node_id: String,
    committed_at: u64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostEvent {
    id: String,
    run_id: Option<String>,
    node_id: Option<String>,
    kind: String,
    at: u64,
    detail: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeInput {
    id: String,
    effect_key: Option<String>,
}
fn empty() -> HostFile {
    HostFile {
        version: 1,
        status: "stopped".into(),
        instance_id: None,
        runs: HashMap::new(),
        receipts: HashMap::new(),
        events: Vec::new(),
    }
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn event(
    state: &mut HostFile,
    run: Option<&str>,
    node: Option<&str>,
    kind: &str,
    detail: Option<String>,
) {
    let at = now();
    state.events.push(HostEvent {
        id: format!("host.{at}.{}", state.events.len()),
        run_id: run.map(str::to_owned),
        node_id: node.map(str::to_owned),
        kind: kind.into(),
        at,
        detail,
    })
}
fn path(root: &Path) -> PathBuf {
    root.join(".cutout").join(FILE)
}
async fn load(root: &Path) -> Result<HostFile, String> {
    match fs::read(path(root)).await {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|e| format!("Invalid Agent Host checkpoint: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(empty()),
        Err(e) => Err(e.to_string()),
    }
}
async fn save(root: &Path, state: &HostFile) -> Result<(), String> {
    let dir = root.join(".cutout");
    fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    let target = path(root);
    let tmp = dir.join(format!(".{FILE}.tmp"));
    fs::write(
        &tmp,
        serde_json::to_vec_pretty(state).map_err(|e| e.to_string())?,
    )
    .await
    .map_err(|e| e.to_string())?;
    fs::rename(&tmp, &target).await.map_err(|e| e.to_string())
}
fn recover(mut state: HostFile, instance: &str) -> HostFile {
    let at = now();
    for run in state.runs.values_mut() {
        if run.status == "queued" {
            run.status = "paused".into();
            run.updated_at = at
        } else if run.status == "running" {
            run.status = "recovering".into();
            run.updated_at = at;
            for node in run.nodes.values_mut() {
                if node.status == "running" {
                    node.status = "queued".into();
                    node.lease = None
                }
            }
        }
    }
    state.status = "running".into();
    state.instance_id = Some(instance.into());
    event(&mut state, None, None, "host-recovered", None);
    state
}
fn lock_for(
    state: &AgentHostDesktopState,
    handle: &str,
) -> Result<std::sync::Arc<tokio::sync::Mutex<()>>, String> {
    let mut locks = state
        .locks
        .lock()
        .map_err(|_| "Agent Host lock poisoned.".to_string())?;
    Ok(locks.entry(handle.into()).or_default().clone())
}
async fn root_locked<'a>(
    registry: &RegistryDesktopState,
    host: &AgentHostDesktopState,
    handle: &str,
) -> Result<(PathBuf, std::sync::Arc<tokio::sync::Mutex<()>>), String> {
    Ok((authorized(registry, handle)?, lock_for(host, handle)?))
}
#[tauri::command]
pub async fn agent_host_start(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    instance_id: String,
) -> Result<HostFile, String> {
    let (root, lock) = root_locked(&registry, &host, &workspace_handle).await?;
    let _guard = lock.lock().await;
    let state = recover(load(&root).await?, &instance_id);
    save(&root, &state).await?;
    Ok(state)
}
#[tauri::command]
pub async fn agent_host_status(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
) -> Result<HostFile, String> {
    let (root, lock) = root_locked(&registry, &host, &workspace_handle).await?;
    let _guard = lock.lock().await;
    load(&root).await
}
#[tauri::command]
pub async fn agent_host_shutdown(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
) -> Result<HostFile, String> {
    mutate(&registry, &host, &workspace_handle, |state| {
        state.status = "stopped".into();
        state.instance_id = None;
        event(state, None, None, "host-stopped", None);
        Ok(())
    })
    .await
}
#[tauri::command]
pub async fn agent_host_recover(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    instance_id: String,
) -> Result<HostFile, String> {
    agent_host_start(registry, host, workspace_handle, instance_id).await
}
#[tauri::command]
pub async fn agent_host_run_start(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    run_id: String,
    nodes: Vec<NodeInput>,
) -> Result<HostFile, String> {
    mutate(&registry, &host, &workspace_handle, move |state| {
        if state.runs.contains_key(&run_id) {
            return Ok(());
        }
        let at = now();
        let map = nodes
            .into_iter()
            .map(|n| {
                (
                    n.id.clone(),
                    Node {
                        id: n.id,
                        effect_key: n.effect_key,
                        status: "queued".into(),
                        attempts: vec![],
                        lease: None,
                        receipt_id: None,
                        next_attempt_at: None,
                    },
                )
            })
            .collect();
        state.runs.insert(
            run_id.clone(),
            Run {
                id: run_id.clone(),
                status: "queued".into(),
                created_at: at,
                updated_at: at,
                nodes: map,
                cancel_reason: None,
            },
        );
        event(state, Some(&run_id), None, "run-started", None);
        Ok(())
    })
    .await
}
#[tauri::command]
pub async fn agent_host_node_claim(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    run_id: String,
    node_id: String,
    lease_ms: u64,
    max_attempts: u32,
) -> Result<ClaimOutcome, String> {
    let mut granted = None;
    let state = mutate(&registry, &host, &workspace_handle, |state| {
        let at = now();
        let run = state.runs.get_mut(&run_id).ok_or("Unknown run.")?;
        let node = run.nodes.get_mut(&node_id).ok_or("Unknown node.")?;
        if matches!(node.status.as_str(), "succeeded" | "failed" | "cancelled")
            || node.lease.as_ref().is_some_and(|v| v.expires_at > at)
            || node.next_attempt_at.is_some_and(|value| value > at)
        {
            return Ok(());
        }
        if node.attempts.len() as u32 >= max_attempts {
            node.status = "failed".into();
            return Ok(());
        }
        let attempt = node.attempts.len() as u32 + 1;
        node.attempts.push(Attempt {
            number: attempt,
            started_at: at,
            completed_at: None,
            error: None,
        });
        node.status = "running".into();
        node.next_attempt_at = None;
        let owner = state.instance_id.clone().ok_or("Host is not started.")?;
        let lease_id = format!("{owner}:{run_id}:{node_id}:{attempt}:{at}");
        let expires_at = at.saturating_add(lease_ms);
        node.lease = Some(Lease {
            owner: owner.clone(),
            lease_id: lease_id.clone(),
            heartbeat_at: at,
            expires_at,
        });
        granted = Some(LeaseGrant {
            owner,
            lease_id,
            attempt,
            expires_at,
        });
        run.status = "running".into();
        run.updated_at = at;
        event(state, Some(&run_id), Some(&node_id), "node-started", None);
        Ok(())
    })
    .await?;
    Ok(ClaimOutcome {
        claimed: granted.is_some(),
        grant: granted,
        state,
    })
}
fn validate_grant(node: &Node, grant: &LeaseGrant, at: u64) -> Result<(), String> {
    let lease = node.lease.as_ref().ok_or("Node has no active lease.")?;
    let attempt = node.attempts.last().map(|value| value.number);
    if node.status != "running"
        || lease.owner != grant.owner
        || lease.lease_id.is_empty()
        || lease.lease_id != grant.lease_id
        || attempt != Some(grant.attempt)
        || at >= lease.expires_at
    {
        return Err("Node lease grant is stale.".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn agent_host_node_heartbeat(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    run_id: String,
    node_id: String,
    lease_ms: u64,
    grant: LeaseGrant,
) -> Result<HostFile, String> {
    mutate(&registry, &host, &workspace_handle, move |state| {
        let at = now();
        let node = state
            .runs
            .get_mut(&run_id)
            .ok_or("Unknown run.")?
            .nodes
            .get_mut(&node_id)
            .ok_or("Unknown node.")?;
        validate_grant(node, &grant, at)?;
        let lease = node.lease.as_mut().ok_or("Node has no active lease.")?;
        lease.heartbeat_at = at;
        lease.expires_at = at.saturating_add(lease_ms);
        Ok(())
    })
    .await
}
#[tauri::command]
pub async fn agent_host_run_pause(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    run_id: String,
) -> Result<HostFile, String> {
    mutate(&registry, &host, &workspace_handle, move |state| {
        let run = state.runs.get_mut(&run_id).ok_or("Unknown run.")?;
        if !matches!(run.status.as_str(), "completed" | "failed" | "cancelled") {
            run.status = "paused".into();
            run.updated_at = now();
            event(state, Some(&run_id), None, "run-paused", None)
        }
        Ok(())
    })
    .await
}
#[tauri::command]
pub async fn agent_host_run_resume(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    run_id: String,
) -> Result<HostFile, String> {
    mutate(&registry, &host, &workspace_handle, move |state| {
        let run = state.runs.get_mut(&run_id).ok_or("Unknown run.")?;
        if matches!(run.status.as_str(), "paused" | "recovering") {
            run.status = "queued".into();
            run.updated_at = now();
            event(state, Some(&run_id), None, "run-resumed", None)
        }
        Ok(())
    })
    .await
}
#[tauri::command]
pub async fn agent_host_node_fail(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    run_id: String,
    node_id: String,
    error: String,
    max_attempts: u32,
    base_delay_ms: u64,
    max_delay_ms: u64,
    jitter_milli: u16,
    grant: LeaseGrant,
) -> Result<HostFile, String> {
    mutate(&registry, &host, &workspace_handle, move |state| {
        if jitter_milli > 1000 {
            return Err("Retry jitter must be at most 1000 milli-units.".into());
        }
        let at = now();
        let run = state.runs.get_mut(&run_id).ok_or("Unknown run.")?;
        if run.status == "cancelled" {
            return Ok(());
        }
        let node = run.nodes.get_mut(&node_id).ok_or("Unknown node.")?;
        validate_grant(node, &grant, at)?;
        if let Some(attempt) = node.attempts.last_mut() {
            attempt.completed_at = Some(at);
            attempt.error = Some(error.clone())
        }
        node.lease = None;
        if node.attempts.len() as u32 >= max_attempts {
            node.status = "failed".into();
            run.status = "failed".into();
            event(
                state,
                Some(&run_id),
                Some(&node_id),
                "node-failed",
                Some(error),
            );
            return Ok(());
        }
        let exponent = (node.attempts.len().saturating_sub(1)).min(31) as u32;
        let base = base_delay_ms
            .saturating_mul(2u64.saturating_pow(exponent))
            .min(max_delay_ms);
        let spread = base.saturating_mul(jitter_milli as u64) / 1000;
        let offset = if spread == 0 {
            0
        } else {
            at % (spread.saturating_mul(2) + 1)
        };
        node.next_attempt_at = Some(at + base.saturating_sub(spread) + offset);
        node.status = "retry-wait".into();
        event(
            state,
            Some(&run_id),
            Some(&node_id),
            "node-retry-scheduled",
            Some(error),
        );
        Ok(())
    })
    .await
}
#[tauri::command]
pub async fn agent_host_node_complete(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    run_id: String,
    node_id: String,
    receipt_id: Option<String>,
    grant: LeaseGrant,
) -> Result<HostFile, String> {
    mutate(&registry, &host, &workspace_handle, move |state| {
        let at = now();
        let run = state.runs.get_mut(&run_id).ok_or("Unknown run.")?;
        if run.status == "cancelled" {
            return Ok(());
        }
        let node = run.nodes.get_mut(&node_id).ok_or("Unknown node.")?;
        if node.status == "succeeded" {
            if node.receipt_id != receipt_id {
                return Err("Side-effect receipt conflict.".into());
            }
            return Ok(());
        }
        if node.status != "running" {
            return Err("Node completion requires an active attempt.".into());
        }
        validate_grant(node, &grant, at)?;
        if let Some(key) = &node.effect_key {
            let receipt_id = receipt_id
                .clone()
                .ok_or("Side-effect completion requires a receipt.")?;
            if let Some(existing) = state.receipts.get(key) {
                if existing.receipt_id != receipt_id {
                    return Err("Side-effect receipt conflict.".into());
                }
            } else {
                state.receipts.insert(
                    key.clone(),
                    Receipt {
                        receipt_id: receipt_id.clone(),
                        run_id: run_id.clone(),
                        node_id: node_id.clone(),
                        committed_at: at,
                    },
                );
            }
        }
        node.status = "succeeded".into();
        node.lease = None;
        node.receipt_id = receipt_id;
        if let Some(attempt) = node.attempts.last_mut() {
            attempt.completed_at = Some(at)
        }
        run.updated_at = at;
        if run.nodes.values().all(|n| n.status == "succeeded") {
            run.status = "completed".into()
        }
        event(state, Some(&run_id), Some(&node_id), "node-succeeded", None);
        Ok(())
    })
    .await
}
#[tauri::command]
pub async fn agent_host_run_cancel(
    registry: State<'_, RegistryDesktopState>,
    host: State<'_, AgentHostDesktopState>,
    workspace_handle: String,
    run_id: String,
    reason: String,
) -> Result<HostFile, String> {
    mutate(&registry, &host, &workspace_handle, move |state| {
        let run = state.runs.get_mut(&run_id).ok_or("Unknown run.")?;
        if run.status == "completed" {
            return Ok(());
        }
        run.status = "cancelled".into();
        run.cancel_reason = Some(reason.clone());
        run.updated_at = now();
        for node in run.nodes.values_mut() {
            if node.status != "succeeded" {
                node.status = "cancelled".into();
                node.lease = None
            }
        }
        event(state, Some(&run_id), None, "run-cancelled", Some(reason));
        Ok(())
    })
    .await
}
async fn mutate<F>(
    registry: &RegistryDesktopState,
    host: &AgentHostDesktopState,
    handle: &str,
    change: F,
) -> Result<HostFile, String>
where
    F: FnOnce(&mut HostFile) -> Result<(), String>,
{
    let (root, lock) = root_locked(registry, host, handle).await?;
    let _guard = lock.lock().await;
    let mut state = load(&root).await?;
    change(&mut state)?;
    save(&root, &state).await?;
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn atomic_file_recovery_keeps_completed_nodes() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut state = empty();
        state.status = "running".into();
        state.runs.insert(
            "r".into(),
            Run {
                id: "r".into(),
                status: "running".into(),
                created_at: 1,
                updated_at: 1,
                nodes: HashMap::from([
                    (
                        "done".into(),
                        Node {
                            id: "done".into(),
                            effect_key: None,
                            status: "succeeded".into(),
                            attempts: vec![],
                            lease: None,
                            receipt_id: None,
                            next_attempt_at: None,
                        },
                    ),
                    (
                        "active".into(),
                        Node {
                            id: "active".into(),
                            effect_key: None,
                            status: "running".into(),
                            attempts: vec![],
                            lease: Some(Lease {
                                owner: "old".into(),
                                lease_id: "old:r:active:1:1".into(),
                                heartbeat_at: 1,
                                expires_at: 2,
                            }),
                            receipt_id: None,
                            next_attempt_at: None,
                        },
                    ),
                ]),
                cancel_reason: None,
            },
        );
        save(root, &state).await.unwrap();
        let next = recover(load(root).await.unwrap(), "new");
        assert_eq!(next.runs["r"].status, "recovering");
        assert_eq!(next.runs["r"].nodes["done"].status, "succeeded");
        assert_eq!(next.runs["r"].nodes["active"].status, "queued");
        assert!(next.runs["r"].nodes["active"].lease.is_none())
    }

    #[test]
    fn lease_grant_is_bound_to_owner_attempt_and_live_lease() {
        let node = Node {
            id: "node".into(),
            effect_key: None,
            status: "running".into(),
            attempts: vec![Attempt {
                number: 2,
                started_at: 10,
                completed_at: None,
                error: None,
            }],
            lease: Some(Lease {
                owner: "host".into(),
                lease_id: "lease-2".into(),
                heartbeat_at: 10,
                expires_at: 20,
            }),
            receipt_id: None,
            next_attempt_at: None,
        };
        let grant = LeaseGrant {
            owner: "host".into(),
            lease_id: "lease-2".into(),
            attempt: 2,
            expires_at: 20,
        };
        assert!(validate_grant(&node, &grant, 19).is_ok());
        assert!(validate_grant(&node, &grant, 20).is_err());
        assert!(validate_grant(
            &node,
            &LeaseGrant {
                lease_id: "other".into(),
                ..grant
            },
            19
        )
        .is_err());
    }
}
