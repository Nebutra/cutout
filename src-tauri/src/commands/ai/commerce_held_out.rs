//! Native trust boundary for held-out Commerce production rehearsals.
//!
//! An evaluator signs the exact challenge selection before Cutout commits.
//! Every admitted native receipt then carries that commitment hash and a second
//! evaluator signature closes the exact completed bundle.

use base64::Engine;
use keyring::{Entry, Error as KeyringError};
use minisign_verify::{PublicKey, Signature};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Manager};

use super::ai_proxy::ProxyError;
use super::commerce_source_ingest::{
    verify_receipt as verify_source_receipt, CommerceSourceIngestReceipt,
};
use super::keys::active_keychain_service;
use super::multimodal_receipt::{
    sha256, sign_host_payload, verify_host_payload, verify_receipt as verify_multimodal_receipt,
    MultimodalHostReceipt,
};

const CHALLENGE_PROTOCOL: &str = "cutout.commerce-held-out-challenge-selection.v2";
const COMMITMENT_PROTOCOL: &str = "cutout.commerce-held-out-commitment.v2";
const INPUT_MANIFEST_SCHEMA: &str = "commerce.held-out-input-manifest.v1";
const ATTESTATION_PROTOCOL: &str = "cutout.commerce-held-out-evaluator-completion.v2";
const ADMISSION_PROTOCOL: &str = "cutout.commerce-held-out-admission.v2";
const HOST_BUILD_VERSION: &str = env!("CARGO_PKG_VERSION");
const COMMERCE_BENCHMARK_ID: &str = "benchmark:commerce-profile:p1-p7";
const COMMERCE_BENCHMARK_VERSION: u32 = 2;
const COMMERCE_PROFILE_ID: &str = "profile:commerce-materials";
const COMMERCE_PROFILE_VERSION: &str = "1.1.0";
const DELIVERABLE_COUNT: usize = 11;
const MEDIA_QA_COUNT: usize = 7;
const COMMERCE_SEMANTIC_ROLES: [&str; DELIVERABLE_COUNT] = [
    "localized-description:en-US",
    "localized-description:ko-KR",
    "localized-description:pt-BR",
    "main-image",
    "detail-image:1",
    "detail-image:2",
    "detail-image:3",
    "detail-image:4",
    "detail-image:5",
    "product-video",
    "strategy-document",
];
const MAX_CHALLENGE_WINDOW_MS: u64 = 24 * 60 * 60 * 1_000;
const CHALLENGE_REGISTRATION_PROTOCOL: &str = "cutout.commerce-held-out-challenge-registration.v1";
const EXECUTION_LEDGER_PROTOCOL: &str = "cutout.commerce-held-out-execution-ledger.v1";
const REPLAY_RESPONSE_PROTOCOL: &str = "cutout.commerce-held-out-replay-response.v1";
const MAX_RECEIPT_SLOTS: usize = 32;
const MAX_REPLAY_RESPONSE_BYTES: usize = 96 * 1024 * 1024;
const TRUSTED_EVALUATOR_PUBLIC_KEY: Option<&str> = option_env!("CUTOUT_COMMERCE_EVALUATOR_PUBKEY");

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommerceHeldOutIdentity {
    id: String,
    revision: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommerceHeldOutSelectedSource {
    fact_id: String,
    source_file: String,
    source_pointer: String,
    source_descriptor: String,
    source_descriptor_sha256: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommerceHeldOutInputManifest {
    schema: String,
    rehearsal_identity: CommerceHeldOutIdentity,
    facts_hash: String,
    category_catalog_hash: String,
    attribute_catalog_hash: String,
    selected_sources: Vec<CommerceHeldOutSelectedSource>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProtocolIdentity {
    id: String,
    version: Value,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommerceHeldOutChallengeSelectionPayload {
    protocol: String,
    benchmark: ProtocolIdentity,
    profile: ProtocolIdentity,
    host_build_version: String,
    challenge_id: String,
    challenge_nonce: String,
    input_manifest_hash: String,
    allowed_run_id: String,
    evaluator_key_id: String,
    issued_at: u64,
    expires_at: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommerceHeldOutChallengeSelection {
    payload: CommerceHeldOutChallengeSelectionPayload,
    signature: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CommerceHeldOutCommitmentPayload {
    protocol: String,
    commitment_id: String,
    challenge_selection: CommerceHeldOutChallengeSelection,
    challenge_hash: String,
    evaluator_key_id: String,
    host_build_version: String,
    input_manifest: CommerceHeldOutInputManifest,
    input_manifest_hash: String,
    run_id: String,
    issued_at: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommerceHeldOutCommitment {
    protocol: String,
    commitment_id: String,
    commitment_hash: String,
    challenge_selection: CommerceHeldOutChallengeSelection,
    challenge_hash: String,
    evaluator_key_id: String,
    host_build_version: String,
    input_manifest: CommerceHeldOutInputManifest,
    input_manifest_hash: String,
    run_id: String,
    issued_at: u64,
    signature: String,
}

impl CommerceHeldOutCommitment {
    fn payload(&self) -> CommerceHeldOutCommitmentPayload {
        CommerceHeldOutCommitmentPayload {
            protocol: self.protocol.clone(),
            commitment_id: self.commitment_id.clone(),
            challenge_selection: self.challenge_selection.clone(),
            challenge_hash: self.challenge_hash.clone(),
            evaluator_key_id: self.evaluator_key_id.clone(),
            host_build_version: self.host_build_version.clone(),
            input_manifest: self.input_manifest.clone(),
            input_manifest_hash: self.input_manifest_hash.clone(),
            run_id: self.run_id.clone(),
            issued_at: self.issued_at,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommerceHeldOutEvaluatorAttestationPayload {
    protocol: String,
    attestation_id: String,
    challenge_hash: String,
    challenge_id: String,
    evaluator_key_id: String,
    host_build_version: String,
    commitment_hash: String,
    input_manifest_hash: String,
    run_id: String,
    bundle_hash: String,
    decision: String,
    deliverable_count: usize,
    completed_at: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommerceHeldOutEvaluatorAttestation {
    payload: CommerceHeldOutEvaluatorAttestationPayload,
    signature: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RehearsalSourceMaterial {
    fact_id: String,
    source: RehearsalSource,
    ingest_receipt: CommerceSourceIngestReceipt,
    artifact_bytes_base64: String,
    #[serde(flatten)]
    _rest: std::collections::BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RehearsalSource {
    file: String,
    pointer: String,
    descriptor: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RetainedSemanticQa {
    receipt: MultimodalHostReceipt,
    artifact_bytes_base64: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RehearsalArtifact {
    semantic_role: String,
    receipt: MultimodalHostReceipt,
    playback_source_receipt: Option<MultimodalHostReceipt>,
    artifact_bytes_base64: String,
    semantic_qa: Option<RetainedSemanticQa>,
    #[serde(flatten)]
    _rest: std::collections::BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommerceProductionRehearsalBundle {
    schema: String,
    identity: CommerceHeldOutIdentity,
    run_id: String,
    facts: Value,
    category_catalog: String,
    attribute_catalog: String,
    source_materials: Vec<RehearsalSourceMaterial>,
    artifacts: Vec<RehearsalArtifact>,
    #[serde(flatten)]
    _rest: std::collections::BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommerceHeldOutAdmission {
    protocol: String,
    challenge_id: String,
    challenge_hash: String,
    evaluator_key_id: String,
    host_build_version: String,
    commitment_id: String,
    commitment_hash: String,
    attestation_id: String,
    input_manifest_hash: String,
    run_id: String,
    bundle_hash: String,
    commitment_issued_at: u64,
    evaluator_completed_at: u64,
    deliverable_count: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ChallengeRegistration {
    protocol: String,
    challenge_hash: String,
    commitment_id: String,
    commitment_hash: String,
    input_manifest_hash: String,
    run_id: String,
    issued_at: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReceiptSlotRegistration {
    slot_id: String,
    receipt_hash: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ExecutionLedger {
    protocol: String,
    challenge_hash: String,
    commitment_hash: String,
    input_manifest_hash: String,
    run_id: String,
    receipt_slots: Vec<ReceiptSlotRegistration>,
    admitted_bundle_hash: Option<String>,
    attestation_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReplayResponsePayload {
    protocol: String,
    commitment_hash: String,
    run_id: String,
    slot_id: String,
    request_hash: String,
    receipt_hash: String,
    response_hash: String,
}

#[derive(Debug)]
struct StoredReplayResponse {
    payload: ReplayResponsePayload,
    response: Vec<u8>,
    record_hash: String,
    signature: String,
}

fn replay_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn replay_database_path(app: &AppHandle) -> Result<PathBuf, ProxyError> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| ProxyError::Request("held-out Commerce replay store is unavailable".into()))?;
    replay_database_path_for_app_data(&root)
}

pub(crate) fn replay_database_path_for_app_data(app_data: &Path) -> Result<PathBuf, ProxyError> {
    let root = app_data.join("commerce-held-out");
    std::fs::create_dir_all(&root)
        .map_err(|_| ProxyError::Request("held-out Commerce replay store is unavailable".into()))?;
    if std::fs::symlink_metadata(&root)
        .map_err(|_| ProxyError::Request("held-out Commerce replay store is unavailable".into()))?
        .file_type()
        .is_symlink()
    {
        return Err(ProxyError::Request(
            "held-out Commerce replay store path is invalid".into(),
        ));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).map_err(|_| {
            ProxyError::Request("held-out Commerce replay store is unavailable".into())
        })?;
    }
    Ok(root.join("replay-v1.sqlite3"))
}

fn open_replay_database(path: &Path) -> Result<Connection, ProxyError> {
    if path
        .symlink_metadata()
        .is_ok_and(|metadata| metadata.file_type().is_symlink())
    {
        return Err(ProxyError::Request(
            "held-out Commerce replay database path is invalid".into(),
        ));
    }
    let connection = Connection::open(path)
        .map_err(|_| ProxyError::Request("held-out Commerce replay store is unavailable".into()))?;
    connection
        .busy_timeout(Duration::from_secs(10))
        .map_err(|_| ProxyError::Request("held-out Commerce replay store is unavailable".into()))?;
    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = FULL;
             CREATE TABLE IF NOT EXISTS replay_responses (
               commitment_hash TEXT NOT NULL,
               slot_id TEXT NOT NULL,
               payload_json BLOB NOT NULL,
               response_json BLOB NOT NULL,
               record_hash TEXT NOT NULL,
               signature TEXT NOT NULL,
               PRIMARY KEY (commitment_hash, slot_id)
             );",
        )
        .map_err(|_| ProxyError::Request("held-out Commerce replay store is unavailable".into()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).map_err(|_| {
            ProxyError::Request("held-out Commerce replay store is unavailable".into())
        })?;
    }
    Ok(connection)
}

fn with_replay_lock<T>(
    app: &AppHandle,
    operation: impl FnOnce() -> Result<T, ProxyError>,
) -> Result<T, ProxyError> {
    with_replay_lock_path(&replay_database_path(app)?, operation)
}

fn with_replay_lock_path<T>(
    database_path: &Path,
    operation: impl FnOnce() -> Result<T, ProxyError>,
) -> Result<T, ProxyError> {
    let _guard = replay_lock().lock().map_err(|_| ProxyError::Keychain)?;
    let mut connection = open_replay_database(database_path)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| ProxyError::Request("held-out Commerce replay store is busy".into()))?;
    let result = operation()?;
    transaction
        .commit()
        .map_err(|_| ProxyError::Request("held-out Commerce replay store is unavailable".into()))?;
    Ok(result)
}

fn replay_entry(account: &str) -> Result<Entry, ProxyError> {
    Entry::new(active_keychain_service(), account).map_err(|_| ProxyError::Keychain)
}

fn read_replay_entry(account: &str) -> Result<Option<String>, ProxyError> {
    match replay_entry(account)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(_) => Err(ProxyError::Keychain),
    }
}

fn write_replay_entry(account: &str, value: &str) -> Result<(), ProxyError> {
    replay_entry(account)?
        .set_password(value)
        .map_err(|_| ProxyError::Keychain)
}

fn challenge_account(challenge_hash: &str) -> String {
    format!("host:commerce-held-out:challenge:v1:{challenge_hash}")
}

fn ledger_account(commitment_hash: &str) -> String {
    format!("host:commerce-held-out:commitment:v1:{commitment_hash}")
}

fn decode_registration<T: for<'de> Deserialize<'de>>(
    value: &str,
    label: &str,
) -> Result<T, ProxyError> {
    serde_json::from_str(value)
        .map_err(|_| ProxyError::Request(format!("held-out Commerce {label} is invalid")))
}

fn encode_registration<T: Serialize>(value: &T) -> Result<String, ProxyError> {
    serde_json::to_string(value)
        .map_err(|_| ProxyError::Request("could not persist held-out Commerce replay state".into()))
}

fn ensure_execution_ledger(registration: &ChallengeRegistration) -> Result<(), ProxyError> {
    let account = ledger_account(&registration.commitment_hash);
    let expected = ExecutionLedger {
        protocol: EXECUTION_LEDGER_PROTOCOL.into(),
        challenge_hash: registration.challenge_hash.clone(),
        commitment_hash: registration.commitment_hash.clone(),
        input_manifest_hash: registration.input_manifest_hash.clone(),
        run_id: registration.run_id.clone(),
        receipt_slots: vec![],
        admitted_bundle_hash: None,
        attestation_id: None,
    };
    match read_replay_entry(&account)? {
        Some(value) => {
            let existing: ExecutionLedger = decode_registration(&value, "execution ledger")?;
            if existing.protocol != expected.protocol
                || existing.challenge_hash != expected.challenge_hash
                || existing.commitment_hash != expected.commitment_hash
                || existing.input_manifest_hash != expected.input_manifest_hash
                || existing.run_id != expected.run_id
            {
                return Err(ProxyError::Request(
                    "held-out Commerce execution ledger identity drifted".into(),
                ));
            }
            Ok(())
        }
        None => write_replay_entry(&account, &encode_registration(&expected)?),
    }
}

fn register_receipt_slot(
    ledger: &mut ExecutionLedger,
    slot_id: &str,
    receipt_hash: &str,
) -> Result<bool, ProxyError> {
    if slot_id.is_empty()
        || slot_id.len() > 512
        || slot_id.chars().any(char::is_control)
        || !valid_hash(receipt_hash)
    {
        return Err(ProxyError::Request(
            "held-out Commerce receipt replay slot is invalid".into(),
        ));
    }
    if ledger.admitted_bundle_hash.is_some() || ledger.attestation_id.is_some() {
        return Err(ProxyError::Request(
            "held-out Commerce commitment is already sealed".into(),
        ));
    }
    if let Some(existing) = ledger
        .receipt_slots
        .iter()
        .find(|entry| entry.slot_id == slot_id)
    {
        return if existing.receipt_hash == receipt_hash {
            Ok(false)
        } else {
            Err(ProxyError::Request(format!(
                "held-out Commerce receipt slot was already settled: {slot_id}"
            )))
        };
    }
    if ledger.receipt_slots.len() >= MAX_RECEIPT_SLOTS {
        return Err(ProxyError::Request(
            "held-out Commerce receipt replay ledger is full".into(),
        ));
    }
    ledger.receipt_slots.push(ReceiptSlotRegistration {
        slot_id: slot_id.into(),
        receipt_hash: receipt_hash.into(),
    });
    Ok(true)
}

pub(crate) fn assert_registered_held_out_execution(
    app: &AppHandle,
    commitment_hash: &str,
    run_id: &str,
) -> Result<(), ProxyError> {
    if !valid_hash(commitment_hash) || !valid_identifier(run_id) {
        return Err(ProxyError::Request(
            "held-out Commerce execution identity is invalid".into(),
        ));
    }
    with_replay_lock(app, || {
        let account = ledger_account(commitment_hash);
        let value = read_replay_entry(&account)?.ok_or_else(|| {
            ProxyError::Request("held-out Commerce commitment is not registered".into())
        })?;
        let ledger: ExecutionLedger = decode_registration(&value, "execution ledger")?;
        if ledger.protocol != EXECUTION_LEDGER_PROTOCOL
            || ledger.commitment_hash != commitment_hash
            || ledger.run_id != run_id
        {
            return Err(ProxyError::Request(
                "held-out Commerce execution does not bind the registered run".into(),
            ));
        }
        if ledger.admitted_bundle_hash.is_some() || ledger.attestation_id.is_some() {
            return Err(ProxyError::Request(
                "held-out Commerce commitment is already sealed".into(),
            ));
        }
        Ok(())
    })
}

pub(crate) fn register_held_out_receipt(
    app: &AppHandle,
    commitment_hash: &str,
    run_id: &str,
    slot_id: &str,
    receipt_hash: &str,
) -> Result<(), ProxyError> {
    with_replay_lock(app, || {
        let account = ledger_account(commitment_hash);
        let value = read_replay_entry(&account)?.ok_or_else(|| {
            ProxyError::Request("held-out Commerce commitment is not registered".into())
        })?;
        let mut ledger: ExecutionLedger = decode_registration(&value, "execution ledger")?;
        if ledger.protocol != EXECUTION_LEDGER_PROTOCOL
            || ledger.commitment_hash != commitment_hash
            || ledger.run_id != run_id
        {
            return Err(ProxyError::Request(
                "held-out Commerce receipt does not bind the registered run".into(),
            ));
        }
        if register_receipt_slot(&mut ledger, slot_id, receipt_hash)? {
            write_replay_entry(&account, &encode_registration(&ledger)?)?;
        }
        Ok(())
    })
}

pub(crate) fn held_out_request_hash<T: Serialize>(request: &T) -> Result<String, ProxyError> {
    Ok(sha256(&canonical_json_bytes(request)?))
}

fn decode_stored_replay_response(
    payload_json: Vec<u8>,
    response: Vec<u8>,
    record_hash: String,
    signature: String,
) -> Result<StoredReplayResponse, ProxyError> {
    if payload_json.len() > 16 * 1024
        || response.is_empty()
        || response.len() > MAX_REPLAY_RESPONSE_BYTES
    {
        return Err(ProxyError::Request(
            "held-out Commerce replay response is invalid".into(),
        ));
    }
    let payload: ReplayResponsePayload = serde_json::from_slice(&payload_json)
        .map_err(|_| ProxyError::Request("held-out Commerce replay response is invalid".into()))?;
    verify_host_payload(&payload, &record_hash, &signature)?;
    if payload.protocol != REPLAY_RESPONSE_PROTOCOL
        || !valid_hash(&payload.commitment_hash)
        || !valid_identifier(&payload.run_id)
        || payload.slot_id.is_empty()
        || payload.slot_id.len() > 512
        || payload.slot_id.chars().any(char::is_control)
        || !valid_hash(&payload.request_hash)
        || !valid_hash(&payload.receipt_hash)
        || !valid_hash(&payload.response_hash)
        || payload.response_hash != sha256(&response)
    {
        return Err(ProxyError::Request(
            "held-out Commerce replay response is invalid".into(),
        ));
    }
    Ok(StoredReplayResponse {
        payload,
        response,
        record_hash,
        signature,
    })
}

fn read_stored_replay_response(
    connection: &Connection,
    commitment_hash: &str,
    slot_id: &str,
) -> Result<Option<StoredReplayResponse>, ProxyError> {
    let stored = connection
        .query_row(
            "SELECT payload_json, response_json, record_hash, signature
             FROM replay_responses WHERE commitment_hash = ?1 AND slot_id = ?2",
            params![commitment_hash, slot_id],
            |row| {
                Ok((
                    row.get::<_, Vec<u8>>(0)?,
                    row.get::<_, Vec<u8>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .optional()
        .map_err(|_| ProxyError::Request("held-out Commerce replay store is unavailable".into()))?;
    stored
        .map(|(payload, response, record_hash, signature)| {
            decode_stored_replay_response(payload, response, record_hash, signature)
        })
        .transpose()
}

fn validate_replay_identity(
    stored: &StoredReplayResponse,
    commitment_hash: &str,
    run_id: &str,
    slot_id: &str,
    request_hash: &str,
) -> Result<(), ProxyError> {
    if stored.payload.commitment_hash != commitment_hash
        || stored.payload.run_id != run_id
        || stored.payload.slot_id != slot_id
        || stored.payload.request_hash != request_hash
    {
        return Err(ProxyError::Request(
            "held-out Commerce replay request drifted from its settled execution slot".into(),
        ));
    }
    Ok(())
}

fn persist_replay_response(
    database_path: &Path,
    candidate: StoredReplayResponse,
) -> Result<StoredReplayResponse, ProxyError> {
    let _guard = replay_lock().lock().map_err(|_| ProxyError::Keychain)?;
    let mut connection = open_replay_database(database_path)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| ProxyError::Request("held-out Commerce replay store is busy".into()))?;
    let stored = match read_stored_replay_response(
        &transaction,
        &candidate.payload.commitment_hash,
        &candidate.payload.slot_id,
    )? {
        Some(existing) => {
            validate_replay_identity(
                &existing,
                &candidate.payload.commitment_hash,
                &candidate.payload.run_id,
                &candidate.payload.slot_id,
                &candidate.payload.request_hash,
            )?;
            existing
        }
        None => {
            transaction
                .execute(
                    "INSERT INTO replay_responses
                     (commitment_hash, slot_id, payload_json, response_json, record_hash, signature)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        &candidate.payload.commitment_hash,
                        &candidate.payload.slot_id,
                        serde_json::to_vec(&candidate.payload).map_err(|_| {
                            ProxyError::Request(
                                "could not encode held-out Commerce replay response".into(),
                            )
                        })?,
                        &candidate.response,
                        &candidate.record_hash,
                        &candidate.signature,
                    ],
                )
                .map_err(|_| {
                    ProxyError::Request("held-out Commerce replay store is unavailable".into())
                })?;
            candidate
        }
    };
    transaction
        .commit()
        .map_err(|_| ProxyError::Request("held-out Commerce replay store is unavailable".into()))?;
    Ok(stored)
}

pub(crate) fn recover_held_out_response<T: DeserializeOwned>(
    app: &AppHandle,
    commitment_hash: &str,
    run_id: &str,
    slot_id: &str,
    request_hash: &str,
) -> Result<Option<T>, ProxyError> {
    let connection = open_replay_database(&replay_database_path(app)?)?;
    let Some(stored) = read_stored_replay_response(&connection, commitment_hash, slot_id)? else {
        return Ok(None);
    };
    validate_replay_identity(&stored, commitment_hash, run_id, slot_id, request_hash)?;
    let response = serde_json::from_slice(&stored.response)
        .map_err(|_| ProxyError::Request("held-out Commerce replay response is invalid".into()))?;
    register_held_out_receipt(
        app,
        commitment_hash,
        run_id,
        slot_id,
        &stored.payload.receipt_hash,
    )?;
    Ok(Some(response))
}

pub(crate) fn settle_held_out_response<T: Serialize + DeserializeOwned>(
    app: &AppHandle,
    commitment_hash: &str,
    run_id: &str,
    slot_id: &str,
    request_hash: &str,
    receipt_hash: &str,
    response: &T,
) -> Result<T, ProxyError> {
    if !valid_hash(commitment_hash)
        || !valid_hash(request_hash)
        || !valid_hash(receipt_hash)
        || !valid_identifier(run_id)
        || slot_id.is_empty()
        || slot_id.len() > 512
        || slot_id.chars().any(char::is_control)
    {
        return Err(ProxyError::Request(
            "held-out Commerce replay response identity is invalid".into(),
        ));
    }
    let response = serde_json::to_vec(response)
        .map_err(|_| ProxyError::Request("could not encode held-out Commerce response".into()))?;
    if response.is_empty() || response.len() > MAX_REPLAY_RESPONSE_BYTES {
        return Err(ProxyError::Request(
            "held-out Commerce replay response exceeds its byte limit".into(),
        ));
    }
    let payload = ReplayResponsePayload {
        protocol: REPLAY_RESPONSE_PROTOCOL.into(),
        commitment_hash: commitment_hash.into(),
        run_id: run_id.into(),
        slot_id: slot_id.into(),
        request_hash: request_hash.into(),
        receipt_hash: receipt_hash.into(),
        response_hash: sha256(&response),
    };
    let (record_hash, signature) = sign_host_payload(&payload)?;
    let candidate = StoredReplayResponse {
        payload,
        response,
        record_hash,
        signature,
    };
    let stored = persist_replay_response(&replay_database_path(app)?, candidate)?;
    register_held_out_receipt(
        app,
        commitment_hash,
        run_id,
        slot_id,
        &stored.payload.receipt_hash,
    )?;
    serde_json::from_slice(&stored.response)
        .map_err(|_| ProxyError::Request("held-out Commerce replay response is invalid".into()))
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 240
        && !value.chars().any(char::is_control)
        && !value.contains("Bearer ")
        && !value.starts_with("sk-")
}

fn valid_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn canonicalize(value: &Value) -> Result<String, ProxyError> {
    match value {
        Value::Null => Ok("null".into()),
        Value::Bool(value) => Ok(if *value { "true" } else { "false" }.into()),
        Value::Number(value) => Ok(value.to_string()),
        Value::String(value) => serde_json::to_string(value)
            .map_err(|_| ProxyError::Request("could not canonicalize held-out evidence".into())),
        Value::Array(values) => {
            let values = values
                .iter()
                .map(canonicalize)
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", values.join(",")))
        }
        Value::Object(values) => {
            let mut entries = values.iter().collect::<Vec<_>>();
            entries.sort_by(|(left, _), (right, _)| left.cmp(right));
            let entries = entries
                .into_iter()
                .map(|(key, value)| {
                    let key = serde_json::to_string(key).map_err(|_| {
                        ProxyError::Request("could not canonicalize held-out evidence".into())
                    })?;
                    Ok(format!("{key}:{}", canonicalize(value)?))
                })
                .collect::<Result<Vec<_>, ProxyError>>()?;
            Ok(format!("{{{}}}", entries.join(",")))
        }
    }
}

fn canonical_json_bytes<T: Serialize>(value: &T) -> Result<Vec<u8>, ProxyError> {
    let value: Value = serde_json::to_value(value)
        .map_err(|_| ProxyError::Request("could not encode held-out Commerce evidence".into()))?;
    Ok(canonicalize(&value)?.into_bytes())
}

fn validate_input_manifest(manifest: &CommerceHeldOutInputManifest) -> Result<(), ProxyError> {
    let identity = &manifest.rehearsal_identity;
    if manifest.schema != INPUT_MANIFEST_SCHEMA
        || !valid_identifier(&identity.id)
        || !valid_identifier(&identity.revision)
        || !valid_hash(&manifest.facts_hash)
        || !valid_hash(&manifest.category_catalog_hash)
        || !valid_hash(&manifest.attribute_catalog_hash)
        || manifest.selected_sources.is_empty()
        || manifest.selected_sources.len() > 3
    {
        return Err(ProxyError::Request(
            "held-out Commerce input manifest is invalid".into(),
        ));
    }
    let mut fact_ids = std::collections::HashSet::new();
    for source in &manifest.selected_sources {
        if !valid_identifier(&source.fact_id)
            || source.source_file.is_empty()
            || source.source_file.len() > 512
            || source.source_file.starts_with('/')
            || source
                .source_file
                .split('/')
                .any(|part| part.is_empty() || part == "." || part == "..")
            || !source.source_pointer.starts_with('/')
            || source.source_pointer.len() > 2_000
            || source.source_descriptor.is_empty()
            || source.source_descriptor.len() > 4_096
            || source.source_descriptor.chars().any(char::is_control)
            || !valid_hash(&source.source_descriptor_sha256)
            || sha256(source.source_descriptor.as_bytes()) != source.source_descriptor_sha256
            || !fact_ids.insert(&source.fact_id)
        {
            return Err(ProxyError::Request(
                "held-out Commerce selected source closure is invalid".into(),
            ));
        }
    }
    Ok(())
}

fn decode_trusted_evaluator_key(
    configured: Option<&str>,
) -> Result<(PublicKey, String), ProxyError> {
    let configured = configured
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            ProxyError::Request(
                "capability-required: no trusted Commerce evaluator key is configured in this build"
                    .into(),
            )
        })?;
    let public_key_base64 = configured
        .lines()
        .filter(|line| !line.trim().is_empty())
        .last()
        .map(str::trim)
        .ok_or_else(|| ProxyError::Request("trusted Commerce evaluator key is invalid".into()))?;
    let public_key = PublicKey::from_base64(public_key_base64)
        .map_err(|_| ProxyError::Request("trusted Commerce evaluator key is invalid".into()))?;
    let key_id = format!(
        "evaluator:minisign:sha256:{}",
        sha256(public_key_base64.as_bytes())
    );
    Ok((public_key, key_id))
}

fn verify_minisign_bytes(
    public_key: &PublicKey,
    signature_text: &str,
    bytes: &[u8],
) -> Result<(), ProxyError> {
    let signature = Signature::decode(signature_text)
        .map_err(|_| ProxyError::Request("Commerce evaluator signature is invalid".into()))?;
    public_key
        .verify(bytes, &signature, false)
        .map_err(|_| ProxyError::Request("Commerce evaluator signature is invalid".into()))
}

fn validate_challenge_binding(
    challenge: &CommerceHeldOutChallengeSelectionPayload,
    input_manifest_hash: &str,
    trusted_key_id: &str,
    now: u64,
) -> Result<(), ProxyError> {
    if challenge.protocol != CHALLENGE_PROTOCOL
        || challenge.benchmark.id != COMMERCE_BENCHMARK_ID
        || challenge.benchmark.version != Value::from(COMMERCE_BENCHMARK_VERSION)
        || challenge.profile.id != COMMERCE_PROFILE_ID
        || challenge.profile.version != Value::from(COMMERCE_PROFILE_VERSION)
        || challenge.host_build_version != HOST_BUILD_VERSION
        || !valid_identifier(&challenge.challenge_id)
        || challenge.challenge_nonce.len() < 32
        || challenge.challenge_nonce.len() > 128
        || !challenge
            .challenge_nonce
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
        || !valid_identifier(&challenge.allowed_run_id)
        || challenge.evaluator_key_id != trusted_key_id
        || challenge.input_manifest_hash != input_manifest_hash
        || challenge.expires_at <= challenge.issued_at
        || challenge.expires_at - challenge.issued_at > MAX_CHALLENGE_WINDOW_MS
        || now < challenge.issued_at
        || now > challenge.expires_at
    {
        return Err(ProxyError::Request(
            "held-out Commerce evaluator challenge is invalid, expired, or identity-drifted".into(),
        ));
    }
    Ok(())
}

fn manifest_from_bundle(
    bundle: &CommerceProductionRehearsalBundle,
) -> Result<CommerceHeldOutInputManifest, ProxyError> {
    if bundle.schema != "commerce.production-rehearsal.v1" {
        return Err(ProxyError::Request(
            "held-out Commerce rehearsal bundle schema is invalid".into(),
        ));
    }
    let selected_sources = bundle
        .source_materials
        .iter()
        .map(|material| CommerceHeldOutSelectedSource {
            fact_id: material.fact_id.clone(),
            source_file: material.source.file.clone(),
            source_pointer: material.source.pointer.clone(),
            source_descriptor: material.source.descriptor.clone(),
            source_descriptor_sha256: sha256(material.source.descriptor.as_bytes()),
        })
        .collect();
    let manifest = CommerceHeldOutInputManifest {
        schema: INPUT_MANIFEST_SCHEMA.into(),
        rehearsal_identity: bundle.identity.clone(),
        facts_hash: sha256(&canonical_json_bytes(&bundle.facts)?),
        category_catalog_hash: sha256(bundle.category_catalog.as_bytes()),
        attribute_catalog_hash: sha256(bundle.attribute_catalog.as_bytes()),
        selected_sources,
    };
    validate_input_manifest(&manifest)?;
    Ok(manifest)
}

fn verify_challenge(
    challenge: &CommerceHeldOutChallengeSelection,
    input_manifest_hash: &str,
    public_key: &PublicKey,
    trusted_key_id: &str,
    now: u64,
) -> Result<String, ProxyError> {
    validate_challenge_binding(&challenge.payload, input_manifest_hash, trusted_key_id, now)?;
    let bytes = canonical_json_bytes(&challenge.payload)?;
    verify_minisign_bytes(public_key, &challenge.signature, &bytes)?;
    Ok(sha256(&bytes))
}

fn decode_retained_bytes(value: &str) -> Result<Vec<u8>, ProxyError> {
    base64::engine::general_purpose::STANDARD
        .decode(value)
        .map_err(|_| ProxyError::Request("held-out rehearsal retained bytes are invalid".into()))
}

fn multimodal_slot(receipt: &MultimodalHostReceipt, prefix: &str) -> Result<String, ProxyError> {
    let node_id = receipt.node_id().ok_or_else(|| {
        ProxyError::Request("held-out Commerce receipt is missing its native Plan node".into())
    })?;
    let slot = format!("{prefix}:{node_id}");
    if slot.len() > 512 || slot.chars().any(char::is_control) {
        return Err(ProxyError::Request(
            "held-out Commerce receipt replay slot is invalid".into(),
        ));
    }
    Ok(slot)
}

fn verify_receipt_closure(
    bundle: &CommerceProductionRehearsalBundle,
    commitment_hash: &str,
) -> Result<(u64, u64, Vec<ReceiptSlotRegistration>), ProxyError> {
    if bundle.artifacts.len() != DELIVERABLE_COUNT {
        return Err(ProxyError::Request(
            "held-out rehearsal must contain exactly eleven deliverables".into(),
        ));
    }
    if bundle
        .artifacts
        .iter()
        .map(|artifact| artifact.semantic_role.as_str())
        .ne(COMMERCE_SEMANTIC_ROLES)
        || bundle
            .artifacts
            .iter()
            .filter(|artifact| artifact.semantic_qa.is_some())
            .count()
            != MEDIA_QA_COUNT
    {
        return Err(ProxyError::Request(
            "held-out rehearsal semantic role and QA closure is incomplete".into(),
        ));
    }
    let mut first_started = u64::MAX;
    let mut last_completed = 0;
    let mut receipt_slots = Vec::new();
    for source in &bundle.source_materials {
        let bytes = decode_retained_bytes(&source.artifact_bytes_base64)?;
        verify_source_receipt(&source.ingest_receipt, &bytes)?;
        if source.ingest_receipt.run_id() != bundle.run_id
            || source.ingest_receipt.held_out_commitment_hash() != Some(commitment_hash)
            || !source.ingest_receipt.binds_selected_source(
                &source.fact_id,
                &source.source.file,
                &source.source.pointer,
                &source.source.descriptor,
            )
        {
            return Err(ProxyError::Request(
                "held-out Commerce source receipt commitment binding is incomplete".into(),
            ));
        }
        receipt_slots.push(ReceiptSlotRegistration {
            slot_id: format!("source-ingest:{}", source.fact_id),
            receipt_hash: source.ingest_receipt.receipt_hash().into(),
        });
        first_started = first_started.min(source.ingest_receipt.started_at());
        last_completed = last_completed.max(source.ingest_receipt.completed_at());
    }
    for artifact in &bundle.artifacts {
        let bytes = decode_retained_bytes(&artifact.artifact_bytes_base64)?;
        verify_multimodal_receipt(&artifact.receipt, &bytes)?;
        if artifact.receipt.run_id() != bundle.run_id
            || artifact.receipt.semantic_role() != Some(artifact.semantic_role.as_str())
            || artifact.receipt.held_out_commitment_hash() != Some(commitment_hash)
        {
            return Err(ProxyError::Request(
                "held-out Commerce Provider receipt commitment binding is incomplete".into(),
            ));
        }
        let structured = artifact.semantic_role.starts_with("localized-description:")
            || artifact.semantic_role == "strategy-document";
        let video = artifact.semantic_role == "product-video";
        if structured != artifact.semantic_qa.is_none()
            || video != artifact.receipt.playback_source_receipt_hash().is_some()
        {
            return Err(ProxyError::Request(
                "held-out Commerce semantic-QA or playback receipt closure is incomplete".into(),
            ));
        }
        if let Some(source_receipt_hash) = artifact.receipt.playback_source_receipt_hash() {
            let source_receipt = artifact.playback_source_receipt.as_ref().ok_or_else(|| {
                ProxyError::Request("held-out Commerce playback source receipt is missing".into())
            })?;
            verify_multimodal_receipt(source_receipt, &bytes)?;
            if source_receipt.receipt_hash() != source_receipt_hash
                || source_receipt.run_id() != bundle.run_id
                || source_receipt.semantic_role() != Some(artifact.semantic_role.as_str())
                || source_receipt.held_out_commitment_hash() != Some(commitment_hash)
            {
                return Err(ProxyError::Request(
                    "held-out Commerce playback receipt commitment binding is incomplete".into(),
                ));
            }
            receipt_slots.push(ReceiptSlotRegistration {
                slot_id: multimodal_slot(source_receipt, "multimodal")?,
                receipt_hash: source_receipt.receipt_hash().into(),
            });
            receipt_slots.push(ReceiptSlotRegistration {
                slot_id: multimodal_slot(&artifact.receipt, "playback-promotion")?,
                receipt_hash: artifact.receipt.receipt_hash().into(),
            });
            first_started = first_started.min(source_receipt.started_at());
            last_completed = last_completed.max(source_receipt.completed_at());
        } else {
            receipt_slots.push(ReceiptSlotRegistration {
                slot_id: multimodal_slot(&artifact.receipt, "multimodal")?,
                receipt_hash: artifact.receipt.receipt_hash().into(),
            });
        }
        first_started = first_started.min(artifact.receipt.started_at());
        last_completed = last_completed.max(artifact.receipt.completed_at());
        if let Some(qa) = &artifact.semantic_qa {
            let qa_bytes = decode_retained_bytes(&qa.artifact_bytes_base64)?;
            verify_multimodal_receipt(&qa.receipt, &qa_bytes)?;
            if qa.receipt.run_id() != bundle.run_id
                || qa.receipt.semantic_role() != Some(artifact.semantic_role.as_str())
                || qa.receipt.held_out_commitment_hash() != Some(commitment_hash)
            {
                return Err(ProxyError::Request(
                    "held-out Commerce semantic-QA receipt commitment binding is incomplete".into(),
                ));
            }
            receipt_slots.push(ReceiptSlotRegistration {
                slot_id: multimodal_slot(&qa.receipt, "multimodal")?,
                receipt_hash: qa.receipt.receipt_hash().into(),
            });
            first_started = first_started.min(qa.receipt.started_at());
            last_completed = last_completed.max(qa.receipt.completed_at());
        }
    }
    receipt_slots.sort_by(|left, right| left.slot_id.cmp(&right.slot_id));
    if receipt_slots
        .windows(2)
        .any(|pair| pair[0].slot_id == pair[1].slot_id)
    {
        return Err(ProxyError::Request(
            "held-out Commerce receipt replay slots are not unique".into(),
        ));
    }
    Ok((first_started, last_completed, receipt_slots))
}

fn validate_attestation_binding(
    commitment: &CommerceHeldOutCommitment,
    attestation: &CommerceHeldOutEvaluatorAttestationPayload,
    trusted_key_id: &str,
    bundle_hash: &str,
    source_provider_started_at: u64,
    artifact_completed_at: u64,
) -> Result<(), ProxyError> {
    let challenge = &commitment.challenge_selection.payload;
    if commitment.protocol != COMMITMENT_PROTOCOL
        || attestation.protocol != ATTESTATION_PROTOCOL
        || !valid_identifier(&commitment.commitment_id)
        || !valid_identifier(&commitment.run_id)
        || !valid_identifier(&attestation.attestation_id)
        || !valid_hash(&commitment.commitment_hash)
        || !valid_hash(&commitment.challenge_hash)
        || !valid_hash(&commitment.input_manifest_hash)
        || !valid_hash(&attestation.bundle_hash)
        || commitment.host_build_version != HOST_BUILD_VERSION
        || challenge.host_build_version != HOST_BUILD_VERSION
        || attestation.host_build_version != HOST_BUILD_VERSION
        || attestation.decision != "accepted"
        || attestation.deliverable_count != DELIVERABLE_COUNT
    {
        return Err(ProxyError::Request(
            "held-out Commerce completion attestation closure is invalid".into(),
        ));
    }
    if commitment.evaluator_key_id != trusted_key_id
        || attestation.evaluator_key_id != trusted_key_id
        || commitment.host_build_version != challenge.host_build_version
        || attestation.host_build_version != commitment.host_build_version
        || attestation.challenge_id != challenge.challenge_id
        || attestation.challenge_hash != commitment.challenge_hash
        || attestation.commitment_hash != commitment.commitment_hash
        || attestation.input_manifest_hash != commitment.input_manifest_hash
        || attestation.run_id != commitment.run_id
        || attestation.bundle_hash != bundle_hash
    {
        return Err(ProxyError::Request(
            "held-out Commerce completion does not bind the exact challenge, commitment, run, input, bundle, and evaluator key"
                .into(),
        ));
    }
    // Defense in depth only. The signed challenge and receipt-carried
    // commitment, not the local clock, establish pre-run authority.
    if source_provider_started_at <= commitment.issued_at
        || artifact_completed_at < source_provider_started_at
        || attestation.completed_at <= artifact_completed_at
    {
        return Err(ProxyError::Request(
            "held-out Commerce chronology is invalid".into(),
        ));
    }
    Ok(())
}

fn unix_millis() -> Result<u64, ProxyError> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|_| ProxyError::Request("system clock is unavailable".into()))
}

fn commitment_from_registration(
    registration: &ChallengeRegistration,
    evaluator_challenge: CommerceHeldOutChallengeSelection,
    input_manifest: CommerceHeldOutInputManifest,
    evaluator_key_id: String,
) -> Result<CommerceHeldOutCommitment, ProxyError> {
    if registration.protocol != CHALLENGE_REGISTRATION_PROTOCOL
        || registration.evaluator_identity_drifted(
            &evaluator_challenge,
            &input_manifest,
            &evaluator_key_id,
        )?
    {
        return Err(ProxyError::Request(
            "held-out Commerce challenge was already committed with different evidence".into(),
        ));
    }
    let host_build_version = evaluator_challenge.payload.host_build_version.clone();
    let payload = CommerceHeldOutCommitmentPayload {
        protocol: COMMITMENT_PROTOCOL.into(),
        commitment_id: registration.commitment_id.clone(),
        challenge_selection: evaluator_challenge,
        challenge_hash: registration.challenge_hash.clone(),
        evaluator_key_id,
        host_build_version,
        input_manifest,
        input_manifest_hash: registration.input_manifest_hash.clone(),
        run_id: registration.run_id.clone(),
        issued_at: registration.issued_at,
    };
    let (commitment_hash, signature) = sign_host_payload(&payload)?;
    if commitment_hash != registration.commitment_hash {
        return Err(ProxyError::Request(
            "held-out Commerce registered commitment is invalid".into(),
        ));
    }
    Ok(CommerceHeldOutCommitment {
        protocol: payload.protocol,
        commitment_id: payload.commitment_id,
        commitment_hash,
        challenge_selection: payload.challenge_selection,
        challenge_hash: payload.challenge_hash,
        evaluator_key_id: payload.evaluator_key_id,
        host_build_version: payload.host_build_version,
        input_manifest: payload.input_manifest,
        input_manifest_hash: payload.input_manifest_hash,
        run_id: payload.run_id,
        issued_at: payload.issued_at,
        signature,
    })
}

fn registration_from_retained_commitment(
    retained: CommerceHeldOutCommitment,
    evaluator_challenge: CommerceHeldOutChallengeSelection,
    input_manifest: CommerceHeldOutInputManifest,
    evaluator_key_id: String,
    challenge_hash: String,
    input_manifest_hash: String,
    now: u64,
) -> Result<(ChallengeRegistration, CommerceHeldOutCommitment), ProxyError> {
    if retained.issued_at < evaluator_challenge.payload.issued_at
        || retained.issued_at > evaluator_challenge.payload.expires_at
        || retained.issued_at > now
    {
        return Err(ProxyError::Request(
            "held-out Commerce retained commitment chronology is invalid".into(),
        ));
    }
    let registration = ChallengeRegistration {
        protocol: CHALLENGE_REGISTRATION_PROTOCOL.into(),
        challenge_hash,
        commitment_id: retained.commitment_id.clone(),
        commitment_hash: retained.commitment_hash.clone(),
        input_manifest_hash,
        run_id: evaluator_challenge.payload.allowed_run_id.clone(),
        issued_at: retained.issued_at,
    };
    let recovered = commitment_from_registration(
        &registration,
        evaluator_challenge,
        input_manifest,
        evaluator_key_id,
    )?;
    if canonical_json_bytes(&recovered)? != canonical_json_bytes(&retained)? {
        return Err(ProxyError::Request(
            "held-out Commerce retained commitment is invalid".into(),
        ));
    }
    Ok((registration, recovered))
}

impl ChallengeRegistration {
    fn evaluator_identity_drifted(
        &self,
        challenge: &CommerceHeldOutChallengeSelection,
        manifest: &CommerceHeldOutInputManifest,
        evaluator_key_id: &str,
    ) -> Result<bool, ProxyError> {
        Ok(
            self.challenge_hash != sha256(&canonical_json_bytes(&challenge.payload)?)
                || self.input_manifest_hash != sha256(&canonical_json_bytes(manifest)?)
                || self.run_id != challenge.payload.allowed_run_id
                || challenge.payload.evaluator_key_id != evaluator_key_id,
        )
    }
}

fn verify_registered_commitment(
    database_path: &Path,
    commitment: &CommerceHeldOutCommitment,
) -> Result<(), ProxyError> {
    with_replay_lock_path(database_path, || {
        let value = read_replay_entry(&challenge_account(&commitment.challenge_hash))?.ok_or_else(
            || ProxyError::Request("held-out Commerce commitment is not registered".into()),
        )?;
        let registration: ChallengeRegistration =
            decode_registration(&value, "challenge registration")?;
        if registration.protocol != CHALLENGE_REGISTRATION_PROTOCOL
            || registration.challenge_hash != commitment.challenge_hash
            || registration.commitment_id != commitment.commitment_id
            || registration.commitment_hash != commitment.commitment_hash
            || registration.input_manifest_hash != commitment.input_manifest_hash
            || registration.run_id != commitment.run_id
            || registration.issued_at != commitment.issued_at
        {
            return Err(ProxyError::Request(
                "held-out Commerce commitment does not match its single-use registration".into(),
            ));
        }
        ensure_execution_ledger(&registration)
    })
}

fn seal_execution_ledger(
    database_path: &Path,
    commitment: &CommerceHeldOutCommitment,
    expected_slots: &[ReceiptSlotRegistration],
    bundle_hash: &str,
    attestation_id: &str,
) -> Result<(), ProxyError> {
    with_replay_lock_path(database_path, || {
        let account = ledger_account(&commitment.commitment_hash);
        let value = read_replay_entry(&account)?.ok_or_else(|| {
            ProxyError::Request("held-out Commerce execution ledger is missing".into())
        })?;
        let mut ledger: ExecutionLedger = decode_registration(&value, "execution ledger")?;
        let mut registered_slots = ledger.receipt_slots.clone();
        registered_slots.sort_by(|left, right| left.slot_id.cmp(&right.slot_id));
        if ledger.protocol != EXECUTION_LEDGER_PROTOCOL
            || ledger.challenge_hash != commitment.challenge_hash
            || ledger.commitment_hash != commitment.commitment_hash
            || ledger.input_manifest_hash != commitment.input_manifest_hash
            || ledger.run_id != commitment.run_id
            || registered_slots != expected_slots
        {
            return Err(ProxyError::Request(
                "held-out Commerce receipt ledger does not match the complete admitted closure"
                    .into(),
            ));
        }
        match (
            ledger.admitted_bundle_hash.as_deref(),
            ledger.attestation_id.as_deref(),
        ) {
            (None, None) => {
                ledger.admitted_bundle_hash = Some(bundle_hash.into());
                ledger.attestation_id = Some(attestation_id.into());
                write_replay_entry(&account, &encode_registration(&ledger)?)
            }
            (Some(existing_bundle), Some(existing_attestation))
                if existing_bundle == bundle_hash && existing_attestation == attestation_id =>
            {
                Ok(())
            }
            _ => Err(ProxyError::Request(
                "held-out Commerce commitment was already admitted with different evidence".into(),
            )),
        }
    })
}

#[tauri::command]
pub async fn create_commerce_held_out_commitment(
    app: AppHandle,
    evaluator_challenge: CommerceHeldOutChallengeSelection,
    input_manifest: CommerceHeldOutInputManifest,
) -> Result<CommerceHeldOutCommitment, ProxyError> {
    let database_path = replay_database_path(&app)?;
    create_commerce_held_out_commitment_inner(&database_path, evaluator_challenge, input_manifest)
        .await
}

pub(crate) async fn create_commerce_held_out_commitment_inner(
    database_path: &Path,
    evaluator_challenge: CommerceHeldOutChallengeSelection,
    input_manifest: CommerceHeldOutInputManifest,
) -> Result<CommerceHeldOutCommitment, ProxyError> {
    create_commerce_held_out_commitment_with_recovery(
        database_path,
        evaluator_challenge,
        input_manifest,
        None,
    )
    .await
}

pub(crate) async fn create_commerce_held_out_commitment_with_recovery(
    database_path: &Path,
    evaluator_challenge: CommerceHeldOutChallengeSelection,
    input_manifest: CommerceHeldOutInputManifest,
    retained_commitment: Option<CommerceHeldOutCommitment>,
) -> Result<CommerceHeldOutCommitment, ProxyError> {
    validate_input_manifest(&input_manifest)?;
    let input_manifest_hash = sha256(&canonical_json_bytes(&input_manifest)?);
    let (public_key, evaluator_key_id) =
        decode_trusted_evaluator_key(TRUSTED_EVALUATOR_PUBLIC_KEY)?;
    with_replay_lock_path(database_path, || {
        let issued_at = unix_millis()?;
        let challenge_hash = verify_challenge(
            &evaluator_challenge,
            &input_manifest_hash,
            &public_key,
            &evaluator_key_id,
            issued_at,
        )?;
        let account = challenge_account(&challenge_hash);
        if let Some(value) = read_replay_entry(&account)? {
            let registration: ChallengeRegistration =
                decode_registration(&value, "challenge registration")?;
            let commitment = commitment_from_registration(
                &registration,
                evaluator_challenge,
                input_manifest,
                evaluator_key_id,
            )?;
            ensure_execution_ledger(&registration)?;
            return Ok(commitment);
        }
        if let Some(retained) = retained_commitment {
            let (registration, recovered) = registration_from_retained_commitment(
                retained,
                evaluator_challenge,
                input_manifest,
                evaluator_key_id,
                challenge_hash,
                input_manifest_hash,
                issued_at,
            )?;
            write_replay_entry(&account, &encode_registration(&registration)?)?;
            ensure_execution_ledger(&registration)?;
            return Ok(recovered);
        }
        let host_build_version = evaluator_challenge.payload.host_build_version.clone();
        let payload = CommerceHeldOutCommitmentPayload {
            protocol: COMMITMENT_PROTOCOL.into(),
            commitment_id: format!(
                "commitment:commerce-held-out:{}",
                uuid::Uuid::new_v4().simple()
            ),
            run_id: evaluator_challenge.payload.allowed_run_id.clone(),
            challenge_selection: evaluator_challenge,
            challenge_hash: challenge_hash.clone(),
            evaluator_key_id: evaluator_key_id.clone(),
            host_build_version,
            input_manifest,
            input_manifest_hash: input_manifest_hash.clone(),
            issued_at,
        };
        let (commitment_hash, signature) = sign_host_payload(&payload)?;
        let registration = ChallengeRegistration {
            protocol: CHALLENGE_REGISTRATION_PROTOCOL.into(),
            challenge_hash,
            commitment_id: payload.commitment_id.clone(),
            commitment_hash: commitment_hash.clone(),
            input_manifest_hash,
            run_id: payload.run_id.clone(),
            issued_at,
        };
        write_replay_entry(&account, &encode_registration(&registration)?)?;
        ensure_execution_ledger(&registration)?;
        Ok(CommerceHeldOutCommitment {
            protocol: payload.protocol,
            commitment_id: payload.commitment_id,
            commitment_hash,
            challenge_selection: payload.challenge_selection,
            challenge_hash: payload.challenge_hash,
            evaluator_key_id: payload.evaluator_key_id,
            host_build_version: payload.host_build_version,
            input_manifest: payload.input_manifest,
            input_manifest_hash: payload.input_manifest_hash,
            run_id: payload.run_id,
            issued_at: payload.issued_at,
            signature,
        })
    })
}

#[tauri::command]
pub async fn verify_commerce_held_out_attestation(
    app: AppHandle,
    commitment: CommerceHeldOutCommitment,
    evaluator_attestation: CommerceHeldOutEvaluatorAttestation,
    rehearsal_bundle: Value,
) -> Result<CommerceHeldOutAdmission, ProxyError> {
    let database_path = replay_database_path(&app)?;
    verify_commerce_held_out_attestation_inner(
        &database_path,
        commitment,
        evaluator_attestation,
        rehearsal_bundle,
    )
    .await
}

pub(crate) async fn verify_commerce_held_out_attestation_inner(
    database_path: &Path,
    commitment: CommerceHeldOutCommitment,
    evaluator_attestation: CommerceHeldOutEvaluatorAttestation,
    rehearsal_bundle: Value,
) -> Result<CommerceHeldOutAdmission, ProxyError> {
    validate_input_manifest(&commitment.input_manifest)?;
    let expected_manifest_hash = sha256(&canonical_json_bytes(&commitment.input_manifest)?);
    if commitment.input_manifest_hash != expected_manifest_hash {
        return Err(ProxyError::Request(
            "held-out Commerce commitment input manifest hash is invalid".into(),
        ));
    }
    verify_host_payload(
        &commitment.payload(),
        &commitment.commitment_hash,
        &commitment.signature,
    )?;
    verify_registered_commitment(database_path, &commitment)?;
    let (public_key, evaluator_key_id) =
        decode_trusted_evaluator_key(TRUSTED_EVALUATOR_PUBLIC_KEY)?;
    let now = unix_millis()?;
    let challenge_hash = verify_challenge(
        &commitment.challenge_selection,
        &commitment.input_manifest_hash,
        &public_key,
        &evaluator_key_id,
        now,
    )?;
    if commitment.challenge_hash != challenge_hash
        || commitment.challenge_selection.payload.allowed_run_id != commitment.run_id
        || commitment.evaluator_key_id != evaluator_key_id
        || commitment.host_build_version != HOST_BUILD_VERSION
        || commitment.challenge_selection.payload.host_build_version
            != commitment.host_build_version
    {
        return Err(ProxyError::Request(
            "held-out Commerce commitment challenge binding is invalid".into(),
        ));
    }
    let bundle_hash = sha256(canonicalize(&rehearsal_bundle)?.as_bytes());
    let bundle: CommerceProductionRehearsalBundle = serde_json::from_value(rehearsal_bundle)
        .map_err(|_| ProxyError::Request("held-out Commerce rehearsal bundle is invalid".into()))?;
    if bundle.run_id != commitment.run_id {
        return Err(ProxyError::Request(
            "held-out Commerce rehearsal run identity drifted".into(),
        ));
    }
    let bundle_manifest = manifest_from_bundle(&bundle)?;
    if canonical_json_bytes(&bundle_manifest)? != canonical_json_bytes(&commitment.input_manifest)?
    {
        return Err(ProxyError::Request(
            "held-out Commerce rehearsal input drifted from the evaluator-selected manifest".into(),
        ));
    }
    let (source_provider_started_at, artifact_completed_at, receipt_slots) =
        verify_receipt_closure(&bundle, &commitment.commitment_hash)?;
    validate_attestation_binding(
        &commitment,
        &evaluator_attestation.payload,
        &evaluator_key_id,
        &bundle_hash,
        source_provider_started_at,
        artifact_completed_at,
    )?;
    verify_minisign_bytes(
        &public_key,
        &evaluator_attestation.signature,
        &canonical_json_bytes(&evaluator_attestation.payload)?,
    )?;
    seal_execution_ledger(
        database_path,
        &commitment,
        &receipt_slots,
        &bundle_hash,
        &evaluator_attestation.payload.attestation_id,
    )?;
    Ok(CommerceHeldOutAdmission {
        protocol: ADMISSION_PROTOCOL.into(),
        challenge_id: commitment.challenge_selection.payload.challenge_id,
        challenge_hash: commitment.challenge_hash,
        evaluator_key_id,
        host_build_version: commitment.host_build_version,
        commitment_id: commitment.commitment_id,
        commitment_hash: commitment.commitment_hash,
        attestation_id: evaluator_attestation.payload.attestation_id,
        input_manifest_hash: commitment.input_manifest_hash,
        run_id: commitment.run_id,
        bundle_hash,
        commitment_issued_at: commitment.issued_at,
        evaluator_completed_at: evaluator_attestation.payload.completed_at,
        deliverable_count: DELIVERABLE_COUNT,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROTOCOL_VECTOR_PUBLIC_KEY: &str =
        "RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3";
    const PROTOCOL_VECTOR_SIGNATURE: &str = "untrusted comment: signature from minisign secret key\nRUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\ntrusted comment: timestamp:1556193335\tfile:test\ny/rUw2y8/hOUYjZU71eHp/Wo1KZ40fGy2VJEDl34XMJM+TX48Ss/17u3IvIfbVR1FkZZSNCisQbuQY+bHwhEBg==";

    fn challenge() -> CommerceHeldOutChallengeSelectionPayload {
        CommerceHeldOutChallengeSelectionPayload {
            protocol: CHALLENGE_PROTOCOL.into(),
            benchmark: ProtocolIdentity {
                id: COMMERCE_BENCHMARK_ID.into(),
                version: Value::from(COMMERCE_BENCHMARK_VERSION),
            },
            profile: ProtocolIdentity {
                id: COMMERCE_PROFILE_ID.into(),
                version: Value::from(COMMERCE_PROFILE_VERSION),
            },
            host_build_version: HOST_BUILD_VERSION.into(),
            challenge_id: "challenge:test".into(),
            challenge_nonce: "n".repeat(32),
            input_manifest_hash: "a".repeat(64),
            allowed_run_id: "run:test".into(),
            evaluator_key_id: "evaluator:test".into(),
            issued_at: 10,
            expires_at: 100,
        }
    }

    #[test]
    fn protocol_verification_accepts_a_cryptographically_real_minisign_vector() {
        let public_key = PublicKey::from_base64(PROTOCOL_VECTOR_PUBLIC_KEY).unwrap();
        verify_minisign_bytes(&public_key, PROTOCOL_VECTOR_SIGNATURE, b"test").unwrap();
        assert!(
            verify_minisign_bytes(&public_key, PROTOCOL_VECTOR_SIGNATURE, b"tampered").is_err()
        );
    }

    #[test]
    fn missing_trusted_evaluator_key_is_capability_required() {
        let error = decode_trusted_evaluator_key(None).unwrap_err();
        assert!(error.to_string().contains("capability-required"));
    }

    #[test]
    fn challenge_window_and_exact_identity_fail_closed() {
        let mut value = challenge();
        assert_eq!(HOST_BUILD_VERSION, "0.1.28");
        assert!(validate_challenge_binding(&value, &"a".repeat(64), "evaluator:test", 20).is_ok());
        assert!(
            validate_challenge_binding(&value, &"a".repeat(64), "evaluator:test", 101).is_err()
        );
        value.protocol = "cutout.commerce-held-out-challenge-selection.v1".into();
        assert!(validate_challenge_binding(&value, &"a".repeat(64), "evaluator:test", 20).is_err());
        value.protocol = CHALLENGE_PROTOCOL.into();
        value.host_build_version = "0.1.19".into();
        assert!(validate_challenge_binding(&value, &"a".repeat(64), "evaluator:test", 20).is_err());

        let mut missing_build = serde_json::to_value(challenge()).unwrap();
        missing_build
            .as_object_mut()
            .unwrap()
            .remove("hostBuildVersion");
        assert!(
            serde_json::from_value::<CommerceHeldOutChallengeSelectionPayload>(missing_build)
                .is_err()
        );
    }

    #[test]
    fn completion_rejects_rollback_retro_signing_and_identity_drift() {
        let challenge_payload = challenge();
        let commitment = CommerceHeldOutCommitment {
            protocol: COMMITMENT_PROTOCOL.into(),
            commitment_id: "commitment:test".into(),
            commitment_hash: "b".repeat(64),
            challenge_selection: CommerceHeldOutChallengeSelection {
                payload: challenge_payload,
                signature: "signed".into(),
            },
            challenge_hash: "c".repeat(64),
            evaluator_key_id: "evaluator:test".into(),
            host_build_version: HOST_BUILD_VERSION.into(),
            input_manifest: CommerceHeldOutInputManifest {
                schema: INPUT_MANIFEST_SCHEMA.into(),
                rehearsal_identity: CommerceHeldOutIdentity {
                    id: "id".into(),
                    revision: "rev".into(),
                },
                facts_hash: "d".repeat(64),
                category_catalog_hash: "e".repeat(64),
                attribute_catalog_hash: "f".repeat(64),
                selected_sources: vec![],
            },
            input_manifest_hash: "a".repeat(64),
            run_id: "run:test".into(),
            issued_at: 20,
            signature: "0".repeat(64),
        };
        let mut completion = CommerceHeldOutEvaluatorAttestationPayload {
            protocol: ATTESTATION_PROTOCOL.into(),
            attestation_id: "attestation:test".into(),
            challenge_hash: "c".repeat(64),
            challenge_id: "challenge:test".into(),
            evaluator_key_id: "evaluator:test".into(),
            host_build_version: HOST_BUILD_VERSION.into(),
            commitment_hash: "b".repeat(64),
            input_manifest_hash: "a".repeat(64),
            run_id: "run:test".into(),
            bundle_hash: "1".repeat(64),
            decision: "accepted".into(),
            deliverable_count: DELIVERABLE_COUNT,
            completed_at: 50,
        };
        assert!(validate_attestation_binding(
            &commitment,
            &completion,
            "evaluator:test",
            &"1".repeat(64),
            30,
            40
        )
        .is_ok());
        assert!(validate_attestation_binding(
            &commitment,
            &completion,
            "evaluator:test",
            &"1".repeat(64),
            20,
            40
        )
        .is_err());
        completion.run_id = "run:other".into();
        assert!(validate_attestation_binding(
            &commitment,
            &completion,
            "evaluator:test",
            &"1".repeat(64),
            30,
            40
        )
        .is_err());
        completion.run_id = "run:test".into();
        completion.host_build_version = "0.1.19".into();
        assert!(validate_attestation_binding(
            &commitment,
            &completion,
            "evaluator:test",
            &"1".repeat(64),
            30,
            40
        )
        .is_err());
    }

    #[test]
    fn challenge_payload_uses_the_cross_runtime_canonical_json_contract() {
        let encoded = String::from_utf8(canonical_json_bytes(&challenge()).unwrap()).unwrap();
        assert_eq!(encoded, format!(
            "{{\"allowedRunId\":\"run:test\",\"benchmark\":{{\"id\":\"benchmark:commerce-profile:p1-p7\",\"version\":2}},\"challengeId\":\"challenge:test\",\"challengeNonce\":\"{}\",\"evaluatorKeyId\":\"evaluator:test\",\"expiresAt\":100,\"hostBuildVersion\":\"0.1.28\",\"inputManifestHash\":\"{}\",\"issuedAt\":10,\"profile\":{{\"id\":\"profile:commerce-materials\",\"version\":\"1.1.0\"}},\"protocol\":\"cutout.commerce-held-out-challenge-selection.v2\"}}",
            "n".repeat(32), "a".repeat(64)
        ));
    }

    #[test]
    fn retained_commitment_recovery_requires_the_exact_host_signed_commitment() {
        super::super::multimodal_receipt::install_ephemeral_test_signing_key();
        let mut evaluator_challenge = CommerceHeldOutChallengeSelection {
            payload: challenge(),
            signature: "evaluator-signature".into(),
        };
        let input_manifest = CommerceHeldOutInputManifest {
            schema: INPUT_MANIFEST_SCHEMA.into(),
            rehearsal_identity: CommerceHeldOutIdentity {
                id: "rehearsal:test".into(),
                revision: "revision:test".into(),
            },
            facts_hash: "b".repeat(64),
            category_catalog_hash: "c".repeat(64),
            attribute_catalog_hash: "d".repeat(64),
            selected_sources: vec![],
        };
        let input_manifest_hash = sha256(&canonical_json_bytes(&input_manifest).unwrap());
        evaluator_challenge.payload.input_manifest_hash = input_manifest_hash.clone();
        let challenge_hash = sha256(&canonical_json_bytes(&evaluator_challenge.payload).unwrap());
        let registration = ChallengeRegistration {
            protocol: CHALLENGE_REGISTRATION_PROTOCOL.into(),
            challenge_hash: challenge_hash.clone(),
            commitment_id: "commitment:test".into(),
            commitment_hash: String::new(),
            input_manifest_hash: input_manifest_hash.clone(),
            run_id: "run:test".into(),
            issued_at: 20,
        };
        let payload = CommerceHeldOutCommitmentPayload {
            protocol: COMMITMENT_PROTOCOL.into(),
            commitment_id: registration.commitment_id.clone(),
            challenge_selection: evaluator_challenge.clone(),
            challenge_hash: registration.challenge_hash.clone(),
            evaluator_key_id: "evaluator:test".into(),
            host_build_version: HOST_BUILD_VERSION.into(),
            input_manifest: input_manifest.clone(),
            input_manifest_hash: registration.input_manifest_hash.clone(),
            run_id: registration.run_id.clone(),
            issued_at: registration.issued_at,
        };
        let (commitment_hash, signature) = sign_host_payload(&payload).unwrap();
        let retained = CommerceHeldOutCommitment {
            protocol: payload.protocol,
            commitment_id: payload.commitment_id,
            commitment_hash,
            challenge_selection: payload.challenge_selection,
            challenge_hash: payload.challenge_hash,
            evaluator_key_id: payload.evaluator_key_id,
            host_build_version: payload.host_build_version,
            input_manifest: payload.input_manifest,
            input_manifest_hash: payload.input_manifest_hash,
            run_id: payload.run_id,
            issued_at: payload.issued_at,
            signature,
        };
        let recovered = registration_from_retained_commitment(
            retained.clone(),
            evaluator_challenge.clone(),
            input_manifest.clone(),
            "evaluator:test".into(),
            challenge_hash.clone(),
            input_manifest_hash.clone(),
            40,
        )
        .unwrap();
        assert_eq!(recovered.0.commitment_hash, retained.commitment_hash);

        let mut drifted = retained;
        drifted.run_id = "run:other".into();
        assert!(registration_from_retained_commitment(
            drifted,
            evaluator_challenge,
            input_manifest,
            "evaluator:test".into(),
            challenge_hash,
            input_manifest_hash,
            40,
        )
        .is_err());
    }

    #[test]
    fn replay_ledger_allows_one_successful_receipt_per_native_execution_slot() {
        let mut ledger = ExecutionLedger {
            protocol: EXECUTION_LEDGER_PROTOCOL.into(),
            challenge_hash: "a".repeat(64),
            commitment_hash: "b".repeat(64),
            input_manifest_hash: "c".repeat(64),
            run_id: "run:test".into(),
            receipt_slots: vec![],
            admitted_bundle_hash: None,
            attestation_id: None,
        };
        assert!(register_receipt_slot(
            &mut ledger,
            "multimodal:plan-node:main-image",
            &"d".repeat(64),
        )
        .unwrap());
        let registered = ledger.clone();
        assert!(!register_receipt_slot(
            &mut ledger,
            "multimodal:plan-node:main-image",
            &"d".repeat(64),
        )
        .unwrap());
        assert_eq!(ledger.receipt_slots, registered.receipt_slots);
        assert!(register_receipt_slot(
            &mut ledger,
            "multimodal:plan-node:main-image",
            &"e".repeat(64),
        )
        .is_err());
        ledger.admitted_bundle_hash = Some("f".repeat(64));
        ledger.attestation_id = Some("attestation:test".into());
        assert!(register_receipt_slot(
            &mut ledger,
            "multimodal:plan-node:detail-image-1",
            &"0".repeat(64),
        )
        .is_err());
    }

    fn replay_candidate(
        request_hash: String,
        receipt_hash: String,
        response: Value,
    ) -> StoredReplayResponse {
        let response = serde_json::to_vec(&response).unwrap();
        let payload = ReplayResponsePayload {
            protocol: REPLAY_RESPONSE_PROTOCOL.into(),
            commitment_hash: "b".repeat(64),
            run_id: "run:test".into(),
            slot_id: "multimodal:plan-node:main-image".into(),
            request_hash,
            receipt_hash,
            response_hash: sha256(&response),
        };
        let (record_hash, signature) = sign_host_payload(&payload).unwrap();
        StoredReplayResponse {
            payload,
            response,
            record_hash,
            signature,
        }
    }

    #[test]
    fn durable_replay_response_recovers_the_first_receipt_and_rejects_drift() {
        super::super::multimodal_receipt::install_ephemeral_test_signing_key();
        let root = tempfile::tempdir().unwrap();
        let database = root.path().join("replay.sqlite3");
        let first = persist_replay_response(
            &database,
            replay_candidate(
                "c".repeat(64),
                "d".repeat(64),
                serde_json::json!({ "receipt": "first", "data": "retained" }),
            ),
        )
        .unwrap();
        let retry = persist_replay_response(
            &database,
            replay_candidate(
                "c".repeat(64),
                "e".repeat(64),
                serde_json::json!({ "receipt": "second", "data": "regenerated" }),
            ),
        )
        .unwrap();
        assert_eq!(retry.payload.receipt_hash, first.payload.receipt_hash);
        assert_eq!(retry.response, first.response);

        let drift = persist_replay_response(
            &database,
            replay_candidate(
                "f".repeat(64),
                "d".repeat(64),
                serde_json::json!({ "receipt": "first", "data": "retained" }),
            ),
        )
        .unwrap_err();
        assert!(drift.to_string().contains("request drifted"));

        let connection = open_replay_database(&database).unwrap();
        connection
            .execute(
                "UPDATE replay_responses SET response_json = ?1",
                params![b"{\"receipt\":\"tampered\"}"],
            )
            .unwrap();
        let tampered = read_stored_replay_response(
            &connection,
            &"b".repeat(64),
            "multimodal:plan-node:main-image",
        )
        .unwrap_err();
        assert!(tampered.to_string().contains("replay response is invalid"));

        connection
            .execute(
                "UPDATE replay_responses SET response_json = ?1, signature = ?2",
                params![&first.response, "0".repeat(64)],
            )
            .unwrap();
        let forged_signature = read_stored_replay_response(
            &connection,
            &"b".repeat(64),
            "multimodal:plan-node:main-image",
        )
        .unwrap_err();
        assert!(forged_signature
            .to_string()
            .contains("multimodal Host receipt signature is invalid"));
    }
}
