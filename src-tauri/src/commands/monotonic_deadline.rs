//! Native monotonic deadline settlement for renderer work that may be background-throttled.

use std::{collections::hash_map::Entry, collections::HashMap, sync::Mutex, time::Duration};
use tokio::sync::oneshot;
use uuid::Uuid;

const MAX_DEADLINE_MS: u64 = 10 * 60 * 1_000;

#[derive(Default)]
pub struct MonotonicDeadlineState {
    active: Mutex<HashMap<Uuid, oneshot::Sender<()>>>,
}

fn validated_id(deadline_id: &str) -> Result<Uuid, String> {
    let id = Uuid::parse_str(deadline_id)
        .map_err(|_| "monotonic deadline id must be an opaque UUID".to_string())?;
    if id.get_version_num() != 4 {
        return Err("monotonic deadline id must be an opaque UUID".into());
    }
    Ok(id)
}

fn validated_duration(timeout_ms: u64) -> Result<Duration, String> {
    if !(1..=MAX_DEADLINE_MS).contains(&timeout_ms) {
        return Err("monotonic deadline is outside the reviewed duration bound".into());
    }
    Ok(Duration::from_millis(timeout_ms))
}

impl MonotonicDeadlineState {
    fn register(
        &self,
        deadline_id: &str,
        timeout_ms: u64,
    ) -> Result<(Uuid, Duration, oneshot::Receiver<()>), String> {
        let id = validated_id(deadline_id)?;
        let duration = validated_duration(timeout_ms)?;
        let (cancel, canceled) = oneshot::channel();
        let mut active = self
            .active
            .lock()
            .map_err(|_| "monotonic deadline registry is unavailable".to_string())?;
        match active.entry(id) {
            Entry::Vacant(entry) => {
                entry.insert(cancel);
            }
            Entry::Occupied(_) => {
                return Err("monotonic deadline id is already active".into());
            }
        }
        Ok((id, duration, canceled))
    }

    fn remove(&self, id: &Uuid) {
        if let Ok(mut active) = self.active.lock() {
            active.remove(id);
        }
    }

    fn cancel(&self, deadline_id: &str) -> Result<(), String> {
        let id = validated_id(deadline_id)?;
        let cancel = self
            .active
            .lock()
            .map_err(|_| "monotonic deadline registry is unavailable".to_string())?
            .remove(&id)
            .ok_or_else(|| "monotonic deadline id is not active".to_string())?;
        let _ = cancel.send(());
        Ok(())
    }
}

async fn wait_for_deadline(
    state: &MonotonicDeadlineState,
    deadline_id: &str,
    timeout_ms: u64,
) -> Result<(), String> {
    let (id, duration, canceled) = state.register(deadline_id, timeout_ms)?;
    tokio::select! {
        _ = tokio::time::sleep(duration) => {}
        _ = canceled => {}
    }
    state.remove(&id);
    Ok(())
}

#[tauri::command]
pub async fn wait_for_monotonic_deadline(
    app: tauri::AppHandle,
    state: tauri::State<'_, MonotonicDeadlineState>,
    deadline_id: String,
    timeout_ms: u64,
) -> Result<(), String> {
    let result = wait_for_deadline(&state, &deadline_id, timeout_ms).await;
    let _ = crate::commands::packaged_e2e::pulse_background_renderer(&app);
    result
}

#[tauri::command]
pub fn cancel_monotonic_deadline(
    state: tauri::State<'_, MonotonicDeadlineState>,
    deadline_id: String,
) -> Result<(), String> {
    state.cancel(&deadline_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    const DEADLINE_ID: &str = "4d36e968-e325-4a86-bd25-3fa1649b8374";

    #[test]
    fn deadline_duration_is_positive_and_bounded() {
        assert!(validated_duration(0).is_err());
        assert_eq!(validated_duration(1).unwrap(), Duration::from_millis(1));
        assert_eq!(
            validated_duration(MAX_DEADLINE_MS).unwrap(),
            Duration::from_millis(MAX_DEADLINE_MS)
        );
        assert!(validated_duration(MAX_DEADLINE_MS + 1).is_err());
    }

    #[test]
    fn rejects_invalid_and_duplicate_ids() {
        let state = MonotonicDeadlineState::default();
        assert!(state.register("not-a-uuid", 1).is_err());
        assert!(state.cancel("not-a-uuid").is_err());

        let registered = state.register(DEADLINE_ID, 1).unwrap();
        assert!(state.register(DEADLINE_ID, 1).is_err());
        state.remove(&registered.0);
    }

    #[tokio::test]
    async fn native_deadline_settles_without_a_renderer_timer() {
        let state = MonotonicDeadlineState::default();
        wait_for_deadline(&state, DEADLINE_ID, 1).await.unwrap();
    }

    #[tokio::test]
    async fn cancellation_settles_and_removes_the_native_sleep() {
        let state = Arc::new(MonotonicDeadlineState::default());
        let waiter_state = Arc::clone(&state);
        let waiter = tokio::spawn(async move {
            wait_for_deadline(&waiter_state, DEADLINE_ID, MAX_DEADLINE_MS).await
        });

        while state.active.lock().unwrap().is_empty() {
            tokio::task::yield_now().await;
        }
        state.cancel(DEADLINE_ID).unwrap();

        assert!(waiter.await.unwrap().is_ok());
        assert!(state.active.lock().unwrap().is_empty());
        assert!(state.cancel(DEADLINE_ID).is_err());
    }
}
