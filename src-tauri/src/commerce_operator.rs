use serde_json::{Map, Value};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const PROTOCOL: &str = "cutout.commerce-operator.v1";
const MAXIMUM_REQUEST_BYTES: u64 = 32 * 1024 * 1024;
const MAXIMUM_STDOUT_BYTES: u64 = 64 * 1024;
#[cfg(target_os = "macos")]
const RUNNER_MACOS_REQUIREMENT: &str = "identifier \"com.nebutra.cutout.commerce-runner\" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = \"2L5YC85FQ7\"";

#[derive(Debug, Clone, PartialEq, Eq)]
struct RequestIdentity {
    job_id: String,
    command: String,
}

fn valid_job_id(value: &str) -> bool {
    (16..=80).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

fn exact_keys(object: &Map<String, Value>, expected: &[&str]) -> bool {
    object.len() == expected.len() && expected.iter().all(|key| object.contains_key(*key))
}

fn has_schema(value: Option<&Value>, schema: &str, keys: &[&str]) -> bool {
    let Some(object) = value.and_then(Value::as_object) else {
        return false;
    };
    exact_keys(object, keys) && object.get("schema").and_then(Value::as_str) == Some(schema)
}

fn validate_request(value: &Value) -> Result<RequestIdentity, String> {
    let object = value
        .as_object()
        .ok_or_else(|| "Commerce operator request must be an object".to_string())?;
    if object.get("protocol").and_then(Value::as_str) != Some(PROTOCOL) {
        return Err("Commerce operator protocol is invalid".into());
    }
    let job_id = object
        .get("jobId")
        .and_then(Value::as_str)
        .filter(|value| valid_job_id(value))
        .ok_or_else(|| "Commerce operator job id is invalid".to_string())?;
    let command = object
        .get("command")
        .and_then(Value::as_str)
        .ok_or_else(|| "Commerce operator command is invalid".to_string())?;
    match command {
        "status" | "cancel" if exact_keys(object, &["protocol", "command", "jobId"]) => {}
        "preflight" | "run" | "recover"
            if exact_keys(
                object,
                &[
                    "protocol",
                    "command",
                    "jobId",
                    "providerId",
                    "evaluatorPackage",
                ],
            ) && object
                .get("providerId")
                .and_then(Value::as_str)
                .is_some_and(|value| !value.is_empty() && value.len() <= 240)
                && has_schema(
                    object.get("evaluatorPackage"),
                    "commerce.held-out-evaluator-package.v1",
                    &["schema", "input", "inputManifest", "evaluatorChallenge"],
                ) => {}
        "admit"
            if exact_keys(
                object,
                &["protocol", "command", "jobId", "evaluatorAttestation"],
            ) && object
                .get("evaluatorAttestation")
                .and_then(Value::as_object)
                .is_some_and(|value| exact_keys(value, &["payload", "signature"])) => {}
        _ => return Err("Commerce operator command envelope is invalid".into()),
    }
    Ok(RequestIdentity {
        job_id: job_id.to_owned(),
        command: command.to_owned(),
    })
}

fn read_request() -> Result<(Vec<u8>, RequestIdentity), String> {
    let mut bytes = Vec::new();
    std::io::stdin()
        .take(MAXIMUM_REQUEST_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Commerce operator standard input is unavailable".to_string())?;
    if bytes.is_empty() || bytes.len() as u64 > MAXIMUM_REQUEST_BYTES {
        return Err("Commerce operator request exceeds its input limit".into());
    }
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "Commerce operator request is invalid".to_string())?;
    let identity = validate_request(&value)?;
    Ok((bytes, identity))
}

fn valid_status(value: &str) -> bool {
    matches!(
        value,
        "created"
            | "preflighted"
            | "running"
            | "pending-evaluator"
            | "admitted"
            | "cancelled"
            | "failed"
    )
}

fn validate_result(result: &Value, request: &RequestIdentity) -> Result<(), String> {
    let object = result
        .as_object()
        .ok_or_else(|| "Commerce operator runner result is invalid".to_string())?;
    if object.get("protocol").and_then(Value::as_str) != Some(PROTOCOL)
        || !exact_keys(
            object,
            &["protocol", "jobId", "command", "status", "resultFile"],
        )
        || object.get("jobId").and_then(Value::as_str) != Some(request.job_id.as_str())
        || object.get("command").and_then(Value::as_str) != Some(request.command.as_str())
    {
        return Err("Commerce operator runner result is invalid".into());
    }
    let status = object
        .get("status")
        .and_then(Value::as_str)
        .filter(|status| valid_status(status))
        .ok_or_else(|| "Commerce operator runner result is invalid".to_string())?;
    let result_file = object
        .get("resultFile")
        .and_then(Value::as_str)
        .ok_or_else(|| "Commerce operator runner result is invalid".to_string())?;
    let exact = match request.command.as_str() {
        "preflight" => status == "preflighted" && result_file == "preflight.json",
        "run" | "recover" => status == "pending-evaluator" && result_file == "pending.json",
        "admit" => status == "admitted" && result_file == "admitted.json",
        "cancel" => status == "cancelled" && result_file == "status.json",
        "status" => result_file == "status.json",
        _ => false,
    };
    if !exact {
        return Err("Commerce operator runner result is invalid".into());
    }
    Ok(())
}

fn runner_path(current_executable: &Path) -> Result<PathBuf, String> {
    let suffix = if cfg!(windows) { ".exe" } else { "" };
    let path = current_executable
        .parent()
        .ok_or_else(|| "Commerce operator release directory is unavailable".to_string())?
        .join(format!("cutout-commerce-runner{suffix}"));
    let metadata = path
        .symlink_metadata()
        .map_err(|_| "Commerce operator runner is unavailable".to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("Commerce operator runner is invalid".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.uid() != unsafe { libc::geteuid() } {
            return Err("Commerce operator runner ownership is invalid".into());
        }
    }
    assert_runner_signature(&path)?;
    Ok(path)
}

#[cfg(target_os = "macos")]
fn assert_runner_signature(path: &Path) -> Result<(), String> {
    let status = Command::new("/usr/bin/codesign")
        .arg("--verify")
        .arg("--strict")
        .arg("--verbose=2")
        .arg(format!("-R={RUNNER_MACOS_REQUIREMENT}"))
        .arg(path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|_| "Commerce operator runner signature could not be verified".to_string())?;
    if !status.success() {
        return Err("Commerce operator runner signature is invalid".into());
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn assert_runner_signature(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn launch_runner(
    path: &Path,
    request: &[u8],
    request_identity: &RequestIdentity,
) -> Result<Vec<u8>, String> {
    let mut command = Command::new(path);
    command
        .env_clear()
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    for name in [
        "HOME",
        "LOCALAPPDATA",
        "APPDATA",
        "USERPROFILE",
        "XDG_CONFIG_HOME",
        "XDG_DATA_HOME",
        "TMPDIR",
        "TEMP",
        "TMP",
        "CUTOUT_COMMERCE_EVALUATOR_PUBKEY",
    ] {
        if let Some(value) = std::env::var_os(name) {
            command.env(name, value);
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .spawn()
        .map_err(|_| "Commerce operator runner could not start".to_string())?;
    child
        .stdin
        .take()
        .ok_or_else(|| "Commerce operator runner input is unavailable".to_string())?
        .write_all(request)
        .map_err(|_| "Commerce operator runner input failed".to_string())?;
    let mut output = Vec::new();
    child
        .stdout
        .take()
        .ok_or_else(|| "Commerce operator runner output is unavailable".to_string())?
        .take(MAXIMUM_STDOUT_BYTES + 1)
        .read_to_end(&mut output)
        .map_err(|_| "Commerce operator runner output failed".to_string())?;
    if output.len() as u64 > MAXIMUM_STDOUT_BYTES {
        let _ = child.kill();
        return Err("Commerce operator runner output exceeded its limit".into());
    }
    let status = child
        .wait()
        .map_err(|_| "Commerce operator runner status is unavailable".to_string())?;
    if !status.success() {
        return Err("Commerce operator request failed".into());
    }
    let result: Value = serde_json::from_slice(&output)
        .map_err(|_| "Commerce operator runner result is invalid".to_string())?;
    validate_result(&result, request_identity)?;
    Ok(output)
}

pub fn run() -> Result<(), String> {
    let (request, request_identity) = read_request()?;
    let executable = std::env::current_exe()
        .map_err(|_| "Commerce operator executable identity is unavailable".to_string())?;
    let output = launch_runner(&runner_path(&executable)?, &request, &request_identity)?;
    std::io::stdout()
        .write_all(&output)
        .map_err(|_| "Commerce operator result could not be written".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_surface_is_exact_and_rejects_paths_and_generic_provider_calls() {
        let status = serde_json::json!({
            "protocol": PROTOCOL,
            "command": "status",
            "jobId": "job_0123456789abcdef",
        });
        assert!(validate_request(&status).is_ok());
        for invalid in [
            serde_json::json!({
                "protocol": PROTOCOL,
                "command": "provider-invoke",
                "jobId": "job_0123456789abcdef",
            }),
            serde_json::json!({
                "protocol": PROTOCOL,
                "command": "status",
                "jobId": "job_0123456789abcdef",
                "exportPath": "/tmp/result.json",
            }),
            serde_json::json!({
                "protocol": PROTOCOL,
                "command": "status",
                "jobId": "../job",
            }),
        ] {
            assert!(validate_request(&invalid).is_err());
        }
    }

    #[test]
    fn evaluator_and_pending_documents_have_fixed_outer_shapes() {
        let request = serde_json::json!({
            "protocol": PROTOCOL,
            "command": "run",
            "jobId": "job_0123456789abcdef",
            "providerId": "dashscope-production",
            "evaluatorPackage": {
                "schema": "commerce.held-out-evaluator-package.v1",
                "input": {},
                "inputManifest": {},
                "evaluatorChallenge": {},
            },
        });
        assert!(validate_request(&request).is_ok());
        let mut drifted = request;
        drifted["evaluatorPackage"]["secret"] = Value::String("not-accepted".into());
        assert!(validate_request(&drifted).is_err());
    }

    #[test]
    fn runner_result_must_match_the_exact_request_and_fixed_publication() {
        let request = RequestIdentity {
            job_id: "job_0123456789abcdef".into(),
            command: "recover".into(),
        };
        let result = serde_json::json!({
            "protocol": PROTOCOL,
            "jobId": request.job_id,
            "command": "recover",
            "status": "pending-evaluator",
            "resultFile": "pending.json",
        });
        assert!(validate_result(&result, &request).is_ok());
        for drifted in [
            serde_json::json!({
                "protocol": PROTOCOL,
                "jobId": "job_other_0123456789",
                "command": "recover",
                "status": "pending-evaluator",
                "resultFile": "pending.json",
            }),
            serde_json::json!({
                "protocol": PROTOCOL,
                "jobId": request.job_id,
                "command": "recover",
                "status": "admitted",
                "resultFile": "pending.json",
            }),
            serde_json::json!({
                "protocol": PROTOCOL,
                "jobId": request.job_id,
                "command": "recover",
                "status": "pending-evaluator",
                "resultFile": "/tmp/pending.json",
            }),
        ] {
            assert!(validate_result(&drifted, &request).is_err());
        }
    }
}
