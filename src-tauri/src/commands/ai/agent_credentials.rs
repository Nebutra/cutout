//! Exact-path credential adapters for reviewed local coding Agents.
//!
//! Parsers return sanitized candidates only. Secret resolution re-reads the
//! same native source and never accepts a caller-selected path or field.

use std::collections::{HashMap, HashSet};
use std::ffi::OsString;
use std::path::{Component, Path, PathBuf};

use serde_json::Value as JsonValue;
use toml::Value as TomlValue;

use super::provider_discovery::{
    candidate_id, exact_regular_file_present, read_exact_config, CredentialPreview, DiscoveryError,
    ProviderCandidate,
};

const OPENAI_BASE: &str = "https://api.openai.com/v1";
const ANTHROPIC_BASE: &str = "https://api.anthropic.com/v1";
const GOOGLE_BASE: &str = "https://generativelanguage.googleapis.com/v1beta";
const DASHSCOPE_BASE: &str = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const MOONSHOT_BASE: &str = "https://api.moonshot.cn/v1";
const MISTRAL_BASE: &str = "https://api.mistral.ai/v1";

#[cfg(test)]
thread_local! {
    static TEST_ENVIRONMENT: std::cell::RefCell<Option<HashMap<String, OsString>>> = const { std::cell::RefCell::new(None) };
}

fn environment_value(name: &str) -> Option<OsString> {
    #[cfg(test)]
    if let Some(value) = TEST_ENVIRONMENT.with(|environment| {
        environment
            .borrow()
            .as_ref()
            .map(|values| values.get(name).cloned())
    }) {
        return value;
    }
    std::env::var_os(name)
}

fn environment_string(name: &str) -> Option<String> {
    environment_value(name)?.into_string().ok()
}

#[derive(Clone, Copy)]
struct Binding {
    provider_id: &'static str,
    kind: &'static str,
    label: &'static str,
    base_url: &'static str,
    wire_protocol: &'static str,
}

fn known_binding(provider_id: &str) -> Option<Binding> {
    match provider_id {
        "openai" => Some(Binding {
            provider_id: "openai",
            kind: "openai",
            label: "OpenAI",
            base_url: OPENAI_BASE,
            wire_protocol: "responses",
        }),
        "anthropic" => Some(Binding {
            provider_id: "anthropic",
            kind: "anthropic",
            label: "Anthropic",
            base_url: ANTHROPIC_BASE,
            wire_protocol: "anthropic-messages",
        }),
        "google" | "gemini" => Some(Binding {
            provider_id: "google",
            kind: "google",
            label: "Google AI",
            base_url: GOOGLE_BASE,
            wire_protocol: "google-generate-content",
        }),
        "qwen" | "dashscope" => Some(Binding {
            provider_id: "dashscope",
            kind: "dashscope",
            label: "DashScope (Qwen)",
            base_url: DASHSCOPE_BASE,
            wire_protocol: "chat-completions",
        }),
        "moonshot" | "kimi" => Some(Binding {
            provider_id: "moonshot",
            kind: "moonshot",
            label: "Moonshot AI",
            base_url: MOONSHOT_BASE,
            wire_protocol: "chat-completions",
        }),
        "mistral" => Some(Binding {
            provider_id: "mistral",
            kind: "mistral",
            label: "Mistral AI",
            base_url: MISTRAL_BASE,
            wire_protocol: "chat-completions",
        }),
        "deepseek" => Some(Binding {
            provider_id: "deepseek",
            kind: "deepseek",
            label: "DeepSeek",
            base_url: "https://api.deepseek.com/v1",
            wire_protocol: "chat-completions",
        }),
        "openrouter" => Some(Binding {
            provider_id: "openrouter",
            kind: "openrouter",
            label: "OpenRouter",
            base_url: "https://openrouter.ai/api/v1",
            wire_protocol: "chat-completions",
        }),
        "groq" => Some(Binding {
            provider_id: "groq",
            kind: "groq",
            label: "Groq",
            base_url: "https://api.groq.com/openai/v1",
            wire_protocol: "chat-completions",
        }),
        "xai" => Some(Binding {
            provider_id: "xai",
            kind: "xai",
            label: "xAI",
            base_url: "https://api.x.ai/v1",
            wire_protocol: "chat-completions",
        }),
        _ => None,
    }
}

fn safe_root(home: &Path, variable: &str, fallback: &str) -> Result<PathBuf, DiscoveryError> {
    match environment_value(variable) {
        Some(value) => {
            let path = PathBuf::from(value);
            if path.is_absolute()
                && path
                    .components()
                    .all(|part| !matches!(part, Component::CurDir | Component::ParentDir))
            {
                Ok(path)
            } else {
                Err(DiscoveryError::Read(format!("invalid {variable} root")))
            }
        }
        None => Ok(home.join(fallback)),
    }
}

fn strict_env_name(value: &str) -> bool {
    let mut bytes = value.bytes();
    matches!(bytes.next(), Some(b'A'..=b'Z' | b'a'..=b'z' | b'_'))
        && value.len() <= 128
        && bytes.all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
}

fn exact_file_present(path: &Path) -> Result<bool, DiscoveryError> {
    exact_regular_file_present(path)
}

fn candidate(
    agent_id: &str,
    source_label: &str,
    schema_id: &str,
    config_location: &str,
    binding: Binding,
    source_type: &str,
    reference: &str,
    available: bool,
    importable: bool,
    model_hint: Option<String>,
    warnings: Vec<String>,
) -> ProviderCandidate {
    candidate_with_selector(
        agent_id,
        source_label,
        schema_id,
        config_location,
        binding,
        binding.provider_id,
        source_type,
        reference,
        available,
        importable,
        model_hint,
        warnings,
    )
}

#[allow(clippy::too_many_arguments)]
fn candidate_with_selector(
    agent_id: &str,
    source_label: &str,
    schema_id: &str,
    config_location: &str,
    binding: Binding,
    source_selector: &str,
    source_type: &str,
    reference: &str,
    available: bool,
    importable: bool,
    model_hint: Option<String>,
    warnings: Vec<String>,
) -> ProviderCandidate {
    ProviderCandidate {
        id: candidate_id(&[
            agent_id,
            schema_id,
            source_selector,
            binding.provider_id,
            binding.base_url,
            source_type,
            reference,
        ]),
        source: agent_id.into(),
        source_label: source_label.into(),
        agent_id: Some(agent_id.into()),
        schema_id: Some(schema_id.into()),
        config_location: Some(config_location.into()),
        kind: binding.kind.into(),
        label: format!("{} {}", source_label, binding.label),
        base_url: Some(binding.base_url.into()),
        wire_protocol: Some(binding.wire_protocol.into()),
        model_hint,
        credential: CredentialPreview {
            source_type: source_type.into(),
            reference: Some(reference.into()),
            available,
            importable,
        },
        warnings,
    }
}

fn parse_json(raw: &str, label: &str) -> Result<JsonValue, DiscoveryError> {
    serde_json::from_str(raw).map_err(|_| DiscoveryError::Parse(format!("{label}: invalid JSON")))
}

fn parse_jsonc(raw: &str, label: &str) -> Result<JsonValue, DiscoveryError> {
    jsonc_parser::parse_to_serde_value(raw, &Default::default())
        .map_err(|_| DiscoveryError::Parse(format!("{label}: invalid JSONC")))
}

fn tagged_auth_candidates(
    raw: &str,
    agent_id: &str,
    source_label: &str,
    schema_id: &str,
    location: &str,
    api_tag: &str,
) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    let value = parse_json(raw, source_label)?;
    let entries = value
        .as_object()
        .ok_or_else(|| DiscoveryError::Parse(format!("{source_label}: expected provider map")))?;
    let mut rows = Vec::new();
    for (provider_id, entry) in entries {
        let Some(binding) = known_binding(provider_id) else {
            continue;
        };
        let Some(object) = entry.as_object() else {
            continue;
        };
        let credential_type = object.get("type").and_then(JsonValue::as_str);
        let key = object
            .get("key")
            .and_then(JsonValue::as_str)
            .filter(|value| !value.is_empty());
        match credential_type {
            Some(value) if value == api_tag && key.is_some() => rows.push(candidate_with_selector(
                agent_id,
                source_label,
                schema_id,
                location,
                binding,
                provider_id,
                "config-literal",
                "Provider API key",
                true,
                true,
                None,
                vec![],
            )),
            Some("oauth") => rows.push(candidate_with_selector(
                agent_id,
                source_label,
                schema_id,
                location,
                binding,
                provider_id,
                "session",
                "OAuth session",
                true,
                false,
                None,
                vec!["OAuth sessions are detected but cannot be imported as API keys.".into()],
            )),
            _ => {}
        }
    }
    Ok(rows)
}

fn discover_opencode(home: &Path) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    let config_root = if let Some(value) = environment_value("OPENCODE_CONFIG_DIR") {
        let root = PathBuf::from(value);
        if !root.is_absolute() {
            return Err(DiscoveryError::Read(
                "invalid OPENCODE_CONFIG_DIR root".into(),
            ));
        }
        root
    } else if let Some(value) = environment_value("XDG_CONFIG_HOME") {
        let root = PathBuf::from(value);
        if !root.is_absolute() {
            return Err(DiscoveryError::Read("invalid XDG_CONFIG_HOME root".into()));
        }
        root.join("opencode")
    } else {
        home.join(".config/opencode")
    };
    if let Some(raw) = read_exact_config(&config_root.join("opencode.json"))? {
        parse_json(&raw, "OpenCode config")?;
    } else if let Some(raw) = read_exact_config(&config_root.join("opencode.jsonc"))? {
        parse_jsonc(&raw, "OpenCode config")?;
    }
    let data_root = match environment_value("XDG_DATA_HOME") {
        Some(value) => {
            let root = PathBuf::from(value);
            if !root.is_absolute() {
                return Err(DiscoveryError::Read("invalid XDG_DATA_HOME root".into()));
            }
            root.join("opencode")
        }
        None => home.join(".local/share/opencode"),
    };
    let Some(raw) = read_exact_config(&data_root.join("auth.json"))? else {
        return Ok(vec![]);
    };
    tagged_auth_candidates(
        &raw,
        "opencode",
        "OpenCode",
        "opencode-auth-v1",
        "~/.local/share/opencode/auth.json",
        "api",
    )
}

fn pi_root(home: &Path) -> Result<PathBuf, DiscoveryError> {
    safe_root(home, "PI_CODING_AGENT_DIR", ".pi/agent")
}

fn omp_root(home: &Path) -> Result<PathBuf, DiscoveryError> {
    if environment_value("PI_CODING_AGENT_DIR").is_some() {
        return safe_root(home, "PI_CODING_AGENT_DIR", ".omp/agent");
    }
    if environment_value("PI_CONFIG_DIR").is_some() {
        return safe_root(home, "PI_CONFIG_DIR", ".omp").map(|root| root.join("agent"));
    }
    Ok(home.join(".omp/agent"))
}

fn omp_api_binding(provider_id: &str, api: &str, base_url: Option<&str>) -> Option<Binding> {
    let binding = known_binding(provider_id)?;
    let protocol_ok = matches!(
        (api, binding.wire_protocol),
        ("openai-completions", "chat-completions")
            | ("openai-responses", "responses")
            | ("anthropic-messages", "anthropic-messages")
            | ("google-generative-ai", "google-generate-content")
    );
    if !protocol_ok {
        return None;
    }
    match base_url {
        Some(url) if url.trim_end_matches('/') != binding.base_url.trim_end_matches('/') => None,
        _ => Some(binding),
    }
}

fn discover_models_json(
    root: &Path,
    agent_id: &str,
    source_label: &str,
    schema_id: &str,
    location: &str,
    allow_literal: bool,
) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    let Some(raw) = read_exact_config(&root.join("models.json"))? else {
        return Ok(vec![]);
    };
    let value = parse_json(&raw, source_label)?;
    let providers = value
        .get("providers")
        .and_then(JsonValue::as_object)
        .ok_or_else(|| DiscoveryError::Parse(format!("{source_label}: expected providers map")))?;
    let mut rows = Vec::new();
    for (provider_id, entry) in providers {
        let Some(entry) = entry.as_object() else {
            continue;
        };
        let Some(api) = entry.get("api").and_then(JsonValue::as_str) else {
            continue;
        };
        let Some(binding) = omp_api_binding(
            provider_id,
            api,
            entry.get("baseUrl").and_then(JsonValue::as_str),
        ) else {
            continue;
        };
        let Some(key) = entry
            .get("apiKey")
            .and_then(JsonValue::as_str)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        if key.starts_with('!') {
            rows.push(candidate_with_selector(
                agent_id,
                source_label,
                schema_id,
                location,
                binding,
                provider_id,
                "helper",
                "Command-backed credential",
                true,
                false,
                None,
                vec!["Command-backed credentials are never executed or imported.".into()],
            ));
        } else if strict_env_name(key) && key.ends_with("_API_KEY") {
            let available = environment_value(key).is_some();
            rows.push(candidate_with_selector(
                agent_id,
                source_label,
                schema_id,
                location,
                binding,
                provider_id,
                "environment",
                key,
                available,
                available,
                None,
                vec![],
            ));
        } else if allow_literal {
            rows.push(candidate_with_selector(
                agent_id,
                source_label,
                schema_id,
                location,
                binding,
                provider_id,
                "config-literal",
                "Provider API key",
                true,
                true,
                None,
                vec![],
            ));
        }
    }
    Ok(rows)
}

fn discover_pi(home: &Path) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    let root = pi_root(home)?;
    let mut rows = match read_exact_config(&root.join("auth.json"))? {
        Some(raw) => tagged_auth_candidates(
            &raw,
            "pi",
            "Pi Agent",
            "pi-auth-v1",
            "~/.pi/agent/auth.json",
            "api_key",
        )?,
        None => vec![],
    };
    rows.extend(discover_models_json(
        &root,
        "pi",
        "Pi Agent",
        "pi-models-json-v1",
        "~/.pi/agent/models.json",
        false,
    )?);
    Ok(rows)
}

fn yaml_hazards(raw: &str) -> bool {
    raw.lines().any(|line| {
        let trimmed = line.trim_start();
        if trimmed.starts_with("---") || trimmed.starts_with("<<:") {
            return true;
        }
        let mut single = false;
        let mut double = false;
        let mut escaped = false;
        for ch in line.chars() {
            if double {
                if escaped {
                    escaped = false;
                } else if ch == '\\' {
                    escaped = true;
                } else if ch == '"' {
                    double = false;
                }
            } else if single {
                if ch == '\'' {
                    single = false;
                }
            } else {
                match ch {
                    '#' => break,
                    '"' => double = true,
                    '\'' => single = true,
                    '!' | '&' | '*' => return true,
                    _ => {}
                }
            }
        }
        false
    })
}

fn discover_omp_yaml(root: &Path) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    let (raw, location) = if let Some(raw) = read_exact_config(&root.join("models.yml"))? {
        (raw, "~/.omp/agent/models.yml")
    } else if let Some(raw) = read_exact_config(&root.join("models.yaml"))? {
        (raw, "~/.omp/agent/models.yaml")
    } else {
        return Ok(vec![]);
    };
    if yaml_hazards(&raw) {
        return Err(DiscoveryError::Parse(
            "OMP models YAML uses unsupported tags, anchors, aliases, or merge keys".into(),
        ));
    }
    let value: serde_yaml_ng::Value = serde_yaml_ng::from_str(&raw)
        .map_err(|_| DiscoveryError::Parse("OMP models YAML: invalid YAML".into()))?;
    let providers = value
        .get("providers")
        .and_then(serde_yaml_ng::Value::as_mapping)
        .ok_or_else(|| DiscoveryError::Parse("OMP models YAML: expected providers map".into()))?;
    let mut rows = Vec::new();
    for (provider_key, entry) in providers {
        let Some(provider_id) = provider_key.as_str() else {
            continue;
        };
        let Some(object) = entry.as_mapping() else {
            continue;
        };
        let get = |name: &str| {
            object
                .get(serde_yaml_ng::Value::String(name.into()))
                .and_then(serde_yaml_ng::Value::as_str)
        };
        let Some(api) = get("api") else { continue };
        let Some(binding) = omp_api_binding(provider_id, api, get("baseUrl")) else {
            continue;
        };
        let auth = get("auth");
        let Some(key) = get("apiKey").filter(|value| !value.is_empty()) else {
            if auth == Some("oauth") {
                rows.push(candidate_with_selector(
                    "omp",
                    "OMP",
                    "omp-models-yaml-v1",
                    location,
                    binding,
                    provider_id,
                    "session",
                    "OAuth session",
                    true,
                    false,
                    None,
                    vec!["OAuth sessions cannot be imported as API keys.".into()],
                ));
            }
            continue;
        };
        if key.starts_with('!') {
            rows.push(candidate_with_selector(
                "omp",
                "OMP",
                "omp-models-yaml-v1",
                location,
                binding,
                provider_id,
                "helper",
                "Command-backed credential",
                true,
                false,
                None,
                vec!["Command-backed credentials are never executed or imported.".into()],
            ));
        } else if strict_env_name(key) && key.ends_with("_API_KEY") {
            let available = environment_value(key).is_some();
            rows.push(candidate_with_selector(
                "omp",
                "OMP",
                "omp-models-yaml-v1",
                location,
                binding,
                provider_id,
                "environment",
                key,
                available,
                available,
                None,
                vec![],
            ));
        } else {
            rows.push(candidate_with_selector(
                "omp",
                "OMP",
                "omp-models-yaml-v1",
                location,
                binding,
                provider_id,
                "config-literal",
                "Provider API key",
                true,
                true,
                None,
                vec![],
            ));
        }
    }
    Ok(rows)
}

fn discover_omp(home: &Path) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    let root = omp_root(home)?;
    let mut rows = if let Some(raw) = read_exact_config(&root.join("auth.json"))? {
        tagged_auth_candidates(
            &raw,
            "omp",
            "OMP",
            "omp-pi-auth-v1",
            "~/.omp/agent/auth.json",
            "api_key",
        )?
    } else {
        vec![]
    };
    rows.extend(discover_models_json(
        &root,
        "omp",
        "OMP",
        "omp-models-json-v1",
        "~/.omp/agent/models.json",
        true,
    )?);
    rows.extend(discover_omp_yaml(&root)?);
    Ok(rows)
}

fn discover_gemini(home: &Path) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    let root = safe_root(home, "GEMINI_CLI_HOME", ".gemini")?;
    let binding = known_binding("google").unwrap();
    let settings = match read_exact_config(&root.join("settings.json"))? {
        Some(raw) => Some(parse_json(&raw, "Gemini settings")?),
        None => None,
    };
    let mut rows = Vec::new();
    for name in ["GEMINI_API_KEY", "GOOGLE_API_KEY"] {
        if environment_value(name).is_some() {
            rows.push(candidate(
                "gemini",
                "Gemini CLI",
                "gemini-env-v1",
                "$PROCESS_ENV",
                binding,
                "environment",
                name,
                true,
                true,
                None,
                vec![],
            ));
            break;
        }
    }
    let selected_type = settings
        .as_ref()
        .and_then(|value| value.pointer("/security/auth/selectedType"))
        .and_then(JsonValue::as_str);
    if exact_file_present(&root.join("oauth_creds.json"))?
        || selected_type.is_some_and(|value| {
            matches!(
                value,
                "oauth-personal" | "login-with-google" | "vertex-ai" | "adc"
            )
        })
    {
        rows.push(candidate(
            "gemini",
            "Gemini CLI",
            "gemini-oauth-presence-v1",
            "~/.gemini/oauth_creds.json",
            binding,
            "session",
            "OAuth session",
            true,
            false,
            None,
            vec!["Gemini OAuth credentials are display-only.".into()],
        ));
    }
    Ok(rows)
}

fn discover_qwen(home: &Path) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    let root = safe_root(home, "QWEN_HOME", ".qwen")?;
    let Some(raw) = read_exact_config(&root.join("settings.json"))? else {
        return Ok(vec![]);
    };
    let value = parse_json(&raw, "Qwen settings")?;
    let binding = known_binding("dashscope").unwrap();
    if value
        .pointer("/security/auth/apiKey")
        .and_then(JsonValue::as_str)
        .is_some_and(|value| !value.is_empty())
    {
        return Ok(vec![candidate(
            "qwen-code",
            "Qwen Code",
            "qwen-settings-literal-v1",
            "~/.qwen/settings.json",
            binding,
            "config-literal",
            "Qwen settings API key",
            true,
            true,
            None,
            vec![],
        )]);
    }
    if let Some(providers) = value.get("modelProviders").and_then(JsonValue::as_object) {
        for (provider_id, entry) in providers {
            if !matches!(provider_id.as_str(), "qwen" | "dashscope") {
                continue;
            }
            let Some(entry) = entry.as_object() else {
                continue;
            };
            if entry
                .get("baseUrl")
                .and_then(JsonValue::as_str)
                .is_some_and(|url| url.trim_end_matches('/') != DASHSCOPE_BASE)
            {
                continue;
            }
            if let Some(name) = entry
                .get("envKey")
                .and_then(JsonValue::as_str)
                .filter(|name| strict_env_name(name))
            {
                let available = environment_value(name).is_some();
                return Ok(vec![candidate(
                    "qwen-code",
                    "Qwen Code",
                    "qwen-model-provider-env-v1",
                    "~/.qwen/settings.json",
                    binding,
                    "environment",
                    name,
                    available,
                    available,
                    None,
                    vec![],
                )]);
            }
        }
    }
    Ok(vec![])
}

fn kimi_binding(provider_type: &str, base_url: &str) -> Option<Binding> {
    if provider_type != "kimi" {
        return None;
    }
    match base_url.trim_end_matches('/') {
        "https://api.kimi.com/coding/v1" => Some(Binding {
            provider_id: "kimi-for-coding",
            kind: "moonshot",
            label: "Kimi for Coding",
            base_url: "https://api.kimi.com/coding/v1",
            wire_protocol: "chat-completions",
        }),
        _ => None,
    }
}

fn discover_kimi(home: &Path) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    let root = home.join(".kimi");
    let env_available = environment_value("KIMI_API_KEY").is_some();
    let providers: HashMap<String, TomlValue> =
        if let Some(raw) = read_exact_config(&root.join("config.toml"))? {
            let value: TomlValue = toml::from_str(&raw)
                .map_err(|_| DiscoveryError::Parse("Kimi config TOML: invalid TOML".into()))?;
            value
                .get("providers")
                .and_then(TomlValue::as_table)
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .collect()
        } else {
            if env_available {
                let binding = kimi_binding("kimi", "https://api.kimi.com/coding/v1").unwrap();
                return Ok(vec![candidate_with_selector(
                    "kimi",
                    "Kimi Code CLI",
                    "kimi-env-v1",
                    "$PROCESS_ENV",
                    binding,
                    "kimi-for-coding",
                    "environment",
                    "KIMI_API_KEY",
                    true,
                    true,
                    None,
                    vec![],
                )]);
            }
            return Ok(vec![]);
        };
    let mut rows = Vec::new();
    for (entry_id, entry) in &providers {
        let Some(entry) = entry.as_table() else {
            continue;
        };
        let Some(provider_type) = entry.get("type").and_then(TomlValue::as_str) else {
            continue;
        };
        let Some(base_url) = entry.get("base_url").and_then(TomlValue::as_str) else {
            continue;
        };
        let Some(binding) = kimi_binding(provider_type, base_url) else {
            continue;
        };
        let api_key = entry
            .get("api_key")
            .and_then(TomlValue::as_str)
            .filter(|value| !value.is_empty());
        if env_available {
            rows.push(candidate_with_selector(
                "kimi",
                "Kimi Code CLI",
                "kimi-config-toml-v1",
                "~/.kimi/config.toml",
                binding,
                entry_id,
                "environment",
                "KIMI_API_KEY",
                true,
                true,
                None,
                vec![],
            ));
        } else if api_key.is_some() {
            rows.push(candidate_with_selector(
                "kimi",
                "Kimi Code CLI",
                "kimi-config-toml-v1",
                "~/.kimi/config.toml",
                binding,
                entry_id,
                "config-literal",
                "Provider API key",
                true,
                true,
                None,
                vec![],
            ));
        } else if entry.get("oauth").is_some() {
            rows.push(candidate_with_selector(
                "kimi",
                "Kimi Code CLI",
                "kimi-config-toml-v1",
                "~/.kimi/config.toml",
                binding,
                entry_id,
                "session",
                "OAuth session",
                true,
                false,
                None,
                vec!["Kimi OAuth/keyring credentials cannot be imported as API keys.".into()],
            ));
        }
    }
    Ok(rows)
}

fn parse_dotenv(raw: &str) -> Result<HashMap<String, String>, DiscoveryError> {
    let mut values = HashMap::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if line.starts_with("export ")
            || line.contains("$(`")
            || line.contains("$(")
            || line.contains('`')
        {
            return Err(DiscoveryError::Parse(
                "Vibe dotenv uses unsupported expansion or command syntax".into(),
            ));
        }
        let Some((name, value)) = line.split_once('=') else {
            return Err(DiscoveryError::Parse(
                "Vibe dotenv assignment is malformed".into(),
            ));
        };
        if !strict_env_name(name)
            || values.contains_key(name)
            || value.contains("${")
            || value.chars().any(char::is_control)
        {
            return Err(DiscoveryError::Parse(
                "Vibe dotenv assignment is unsupported".into(),
            ));
        }
        let raw_value = value.trim();
        let value = if raw_value.starts_with('"') || raw_value.starts_with('\'') {
            let quote = raw_value.chars().next().unwrap();
            if raw_value.len() < 2 || !raw_value.ends_with(quote) {
                return Err(DiscoveryError::Parse(
                    "Vibe dotenv quoted value is malformed".into(),
                ));
            }
            raw_value[1..raw_value.len() - 1].to_owned()
        } else {
            raw_value.to_owned()
        };
        values.insert(name.into(), value);
    }
    Ok(values)
}

fn discover_vibe(home: &Path) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    let root = safe_root(home, "VIBE_HOME", ".vibe")?;
    let Some(raw) = read_exact_config(&root.join("config.toml"))? else {
        return Ok(vec![]);
    };
    let value: TomlValue = toml::from_str(&raw)
        .map_err(|_| DiscoveryError::Parse("Vibe config: invalid TOML".into()))?;
    let providers = value
        .get("providers")
        .and_then(TomlValue::as_array)
        .ok_or_else(|| DiscoveryError::Parse("Vibe config: expected providers array".into()))?;
    let dotenv = match read_exact_config(&root.join(".env"))? {
        Some(raw) => parse_dotenv(&raw)?,
        None => HashMap::new(),
    };
    let mut rows = Vec::new();
    for provider in providers.iter().filter_map(TomlValue::as_table) {
        let Some(name) = provider.get("name").and_then(TomlValue::as_str) else {
            continue;
        };
        let Some(base) = provider.get("api_base").and_then(TomlValue::as_str) else {
            continue;
        };
        let Some(env_name) = provider
            .get("api_key_env_var")
            .and_then(TomlValue::as_str)
            .filter(|value| strict_env_name(value))
        else {
            continue;
        };
        if provider.get("backend").and_then(TomlValue::as_str) != Some("mistral")
            || base.trim_end_matches('/') != MISTRAL_BASE
        {
            continue;
        }
        let binding = known_binding("mistral").unwrap();
        let env_available = environment_value(env_name).is_some();
        let file_available = dotenv.get(env_name).is_some_and(|value| !value.is_empty());
        let source_type = if env_available {
            "environment"
        } else if file_available {
            "dotenv"
        } else {
            "environment"
        };
        rows.push(candidate(
            "mistral-vibe",
            "Mistral Vibe",
            "vibe-provider-env-v1",
            "~/.vibe/config.toml",
            binding,
            source_type,
            env_name,
            env_available || file_available,
            env_available || file_available,
            Some(name.into()),
            vec![],
        ));
    }
    Ok(rows)
}

pub(super) fn discover(home: &Path) -> Result<Vec<ProviderCandidate>, DiscoveryError> {
    let mut rows = Vec::new();
    let mut first_error = None;
    for discover_source in [
        discover_opencode as fn(&Path) -> Result<Vec<ProviderCandidate>, DiscoveryError>,
        discover_pi,
        discover_omp,
        discover_gemini,
        discover_qwen,
        discover_kimi,
        discover_vibe,
    ] {
        match discover_source(home) {
            Ok(candidates) => rows.extend(candidates),
            Err(error) => {
                first_error.get_or_insert(error);
            }
        }
    }
    if rows.is_empty() {
        if let Some(error) = first_error {
            return Err(error);
        }
    }
    let mut seen = HashSet::new();
    rows.retain(|row| seen.insert(row.id.clone()));
    Ok(rows)
}

fn resolve_tagged_candidate(
    raw: &str,
    candidate: &ProviderCandidate,
    agent_id: &str,
    source_label: &str,
    schema_id: &str,
    location: &str,
    api_tag: &str,
) -> Result<String, DiscoveryError> {
    let value = parse_json(raw, "Agent auth")?;
    let entries = value
        .as_object()
        .ok_or_else(|| DiscoveryError::Parse("Agent auth: expected provider map".into()))?;
    for (source_provider_id, entry) in entries {
        let Some(binding) = known_binding(source_provider_id) else {
            continue;
        };
        let Some(entry) = entry.as_object() else {
            continue;
        };
        if entry.get("type").and_then(JsonValue::as_str) != Some(api_tag) {
            continue;
        }
        let Some(key) = entry
            .get("key")
            .and_then(JsonValue::as_str)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        let current = candidate_with_selector(
            agent_id,
            source_label,
            schema_id,
            location,
            binding,
            source_provider_id,
            "config-literal",
            "Provider API key",
            true,
            true,
            None,
            vec![],
        );
        if current.id == candidate.id {
            return Ok(key.to_owned());
        }
    }
    Err(DiscoveryError::CandidateMissing)
}

fn resolve_kimi(candidate: &ProviderCandidate, home: &Path) -> Result<String, DiscoveryError> {
    let root = home.join(".kimi");
    if candidate.schema_id.as_deref() != Some("kimi-config-toml-v1") {
        return Err(DiscoveryError::CandidateMissing);
    }
    let raw =
        read_exact_config(&root.join("config.toml"))?.ok_or(DiscoveryError::CandidateMissing)?;
    let value: TomlValue = toml::from_str(&raw)
        .map_err(|_| DiscoveryError::Parse("Kimi config: invalid TOML".into()))?;
    value
        .get("providers")
        .and_then(TomlValue::as_table)
        .and_then(|providers| {
            providers.iter().find_map(|(entry_id, entry)| {
                let table = entry.as_table()?;
                let binding = kimi_binding(
                    table.get("type")?.as_str()?,
                    table.get("base_url")?.as_str()?,
                )?;
                let current = candidate_with_selector(
                    "kimi",
                    "Kimi Code CLI",
                    "kimi-config-toml-v1",
                    "~/.kimi/config.toml",
                    binding,
                    entry_id,
                    "config-literal",
                    "Provider API key",
                    true,
                    true,
                    None,
                    vec![],
                );
                if current.id == candidate.id {
                    table.get("api_key")?.as_str().map(str::to_owned)
                } else {
                    None
                }
            })
        })
        .filter(|value| !value.is_empty())
        .ok_or(DiscoveryError::CandidateMissing)
}

fn resolve_vibe(candidate: &ProviderCandidate, home: &Path) -> Result<String, DiscoveryError> {
    let root = safe_root(home, "VIBE_HOME", ".vibe")?;
    let name = candidate
        .credential
        .reference
        .as_deref()
        .filter(|name| strict_env_name(name))
        .ok_or(DiscoveryError::NotImportable)?;
    if let Some(value) = environment_string(name) {
        if !value.is_empty() {
            return Ok(value);
        }
    }
    let raw = read_exact_config(&root.join(".env"))?.ok_or(DiscoveryError::CandidateMissing)?;
    parse_dotenv(&raw)?
        .remove(name)
        .filter(|value| !value.is_empty())
        .ok_or(DiscoveryError::CandidateMissing)
}

#[allow(clippy::too_many_arguments)]
fn resolve_models_json_candidate(
    candidate: &ProviderCandidate,
    root: &Path,
    agent_id: &str,
    source_label: &str,
    schema_id: &str,
    location: &str,
    allow_literal: bool,
) -> Result<String, DiscoveryError> {
    let current = discover_models_json(
        root,
        agent_id,
        source_label,
        schema_id,
        location,
        allow_literal,
    )?
    .into_iter()
    .find(|row| row.id == candidate.id)
    .ok_or(DiscoveryError::CandidateMissing)?;
    if current.credential.source_type == "environment" {
        return environment_string(
            current
                .credential
                .reference
                .as_deref()
                .ok_or(DiscoveryError::CandidateMissing)?,
        )
        .ok_or(DiscoveryError::CandidateMissing);
    }
    if current.credential.source_type != "config-literal" || !allow_literal {
        return Err(DiscoveryError::NotImportable);
    }
    let raw =
        read_exact_config(&root.join("models.json"))?.ok_or(DiscoveryError::CandidateMissing)?;
    let value = parse_json(&raw, source_label)?;
    let providers = value
        .get("providers")
        .and_then(JsonValue::as_object)
        .ok_or(DiscoveryError::CandidateMissing)?;
    for (provider_id, entry) in providers {
        let Some(entry) = entry.as_object() else {
            continue;
        };
        let Some(api) = entry.get("api").and_then(JsonValue::as_str) else {
            continue;
        };
        let Some(binding) = omp_api_binding(
            provider_id,
            api,
            entry.get("baseUrl").and_then(JsonValue::as_str),
        ) else {
            continue;
        };
        let Some(secret) = entry
            .get("apiKey")
            .and_then(JsonValue::as_str)
            .filter(|value| !value.is_empty() && !value.starts_with('!'))
        else {
            continue;
        };
        let source = candidate_with_selector(
            agent_id,
            source_label,
            schema_id,
            location,
            binding,
            provider_id,
            "config-literal",
            "Provider API key",
            true,
            true,
            None,
            vec![],
        );
        if source.id == candidate.id {
            return Ok(secret.to_owned());
        }
    }
    Err(DiscoveryError::CandidateMissing)
}

pub(super) fn resolve(
    candidate: &ProviderCandidate,
    home: &Path,
) -> Result<String, DiscoveryError> {
    if !candidate.credential.importable {
        return Err(DiscoveryError::NotImportable);
    }
    match candidate.source.as_str() {
        "opencode" => {
            let root = match environment_value("XDG_DATA_HOME") {
                Some(value) => PathBuf::from(value).join("opencode"),
                None => home.join(".local/share/opencode"),
            };
            resolve_tagged_candidate(
                &read_exact_config(&root.join("auth.json"))?
                    .ok_or(DiscoveryError::CandidateMissing)?,
                candidate,
                "opencode",
                "OpenCode",
                "opencode-auth-v1",
                "~/.local/share/opencode/auth.json",
                "api",
            )
        }
        "pi" if candidate.schema_id.as_deref() == Some("pi-models-json-v1") => {
            resolve_models_json_candidate(
                candidate,
                &pi_root(home)?,
                "pi",
                "Pi Agent",
                "pi-models-json-v1",
                "~/.pi/agent/models.json",
                false,
            )
        }
        "pi" => resolve_tagged_candidate(
            &read_exact_config(&pi_root(home)?.join("auth.json"))?
                .ok_or(DiscoveryError::CandidateMissing)?,
            candidate,
            "pi",
            "Pi Agent",
            "pi-auth-v1",
            "~/.pi/agent/auth.json",
            "api_key",
        ),
        "omp" if candidate.schema_id.as_deref() == Some("omp-pi-auth-v1") => {
            resolve_tagged_candidate(
                &read_exact_config(&omp_root(home)?.join("auth.json"))?
                    .ok_or(DiscoveryError::CandidateMissing)?,
                candidate,
                "omp",
                "OMP",
                "omp-pi-auth-v1",
                "~/.omp/agent/auth.json",
                "api_key",
            )
        }
        "omp" if candidate.schema_id.as_deref() == Some("omp-models-json-v1") => {
            resolve_models_json_candidate(
                candidate,
                &omp_root(home)?,
                "omp",
                "OMP",
                "omp-models-json-v1",
                "~/.omp/agent/models.json",
                true,
            )
        }
        "omp" => {
            let rows = discover_omp_yaml(&omp_root(home)?)?;
            let current = rows
                .into_iter()
                .find(|row| row.id == candidate.id)
                .ok_or(DiscoveryError::CandidateMissing)?;
            match current.credential.source_type.as_str() {
                "environment" => environment_string(
                    current
                        .credential
                        .reference
                        .as_deref()
                        .ok_or(DiscoveryError::CandidateMissing)?,
                )
                .ok_or(DiscoveryError::CandidateMissing),
                "config-literal" => {
                    let root = omp_root(home)?;
                    let raw = read_exact_config(&root.join("models.yml"))?
                        .or(read_exact_config(&root.join("models.yaml"))?)
                        .ok_or(DiscoveryError::CandidateMissing)?;
                    let value: serde_yaml_ng::Value =
                        serde_yaml_ng::from_str(&raw).map_err(|_| {
                            DiscoveryError::Parse("OMP models YAML: invalid YAML".into())
                        })?;
                    value
                        .get("providers")
                        .and_then(serde_yaml_ng::Value::as_mapping)
                        .and_then(|map| {
                            map.iter().find_map(|(key, value)| {
                                let id = key.as_str()?;
                                let table = value.as_mapping()?;
                                let api = table
                                    .get(serde_yaml_ng::Value::String("api".into()))?
                                    .as_str()?;
                                let base = table
                                    .get(serde_yaml_ng::Value::String("baseUrl".into()))
                                    .and_then(serde_yaml_ng::Value::as_str);
                                let binding = omp_api_binding(id, api, base)?;
                                let secret = table
                                    .get(serde_yaml_ng::Value::String("apiKey".into()))?
                                    .as_str()?;
                                let source = candidate_with_selector(
                                    "omp",
                                    "OMP",
                                    "omp-models-yaml-v1",
                                    candidate.config_location.as_deref()?,
                                    binding,
                                    id,
                                    "config-literal",
                                    "Provider API key",
                                    true,
                                    true,
                                    None,
                                    vec![],
                                );
                                (source.id == candidate.id).then(|| secret.to_owned())
                            })
                        })
                        .filter(|key| !key.is_empty() && !key.starts_with('!'))
                        .ok_or(DiscoveryError::CandidateMissing)
                }
                _ => Err(DiscoveryError::NotImportable),
            }
        }
        "gemini" | "qwen-code" if candidate.credential.source_type == "environment" => {
            environment_string(
                candidate
                    .credential
                    .reference
                    .as_deref()
                    .ok_or(DiscoveryError::CandidateMissing)?,
            )
            .ok_or(DiscoveryError::CandidateMissing)
        }
        "qwen-code" => {
            let root = safe_root(home, "QWEN_HOME", ".qwen")?;
            let value = parse_json(
                &read_exact_config(&root.join("settings.json"))?
                    .ok_or(DiscoveryError::CandidateMissing)?,
                "Qwen settings",
            )?;
            value
                .pointer("/security/auth/apiKey")
                .and_then(JsonValue::as_str)
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
                .ok_or(DiscoveryError::CandidateMissing)
        }
        "kimi" if candidate.credential.source_type == "environment" => {
            environment_string("KIMI_API_KEY").ok_or(DiscoveryError::CandidateMissing)
        }
        "kimi" => resolve_kimi(candidate, home),
        "mistral-vibe" => resolve_vibe(candidate, home),
        _ => Err(DiscoveryError::NotImportable),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn tempdir() -> std::io::Result<TempDir> {
        tempfile::tempdir_in(std::env::temp_dir().canonicalize()?)
    }

    struct TestEnvironmentGuard;

    impl Drop for TestEnvironmentGuard {
        fn drop(&mut self) {
            TEST_ENVIRONMENT.with(|environment| *environment.borrow_mut() = None);
        }
    }

    fn with_test_environment<T>(values: &[(&str, &str)], run: impl FnOnce() -> T) -> T {
        TEST_ENVIRONMENT.with(|environment| {
            *environment.borrow_mut() = Some(
                values
                    .iter()
                    .map(|(name, value)| ((*name).into(), OsString::from(value)))
                    .collect(),
            );
        });
        let _guard = TestEnvironmentGuard;
        run()
    }

    #[test]
    fn opencode_api_key_is_sanitized_and_resolves_natively() {
        let home = tempdir().unwrap();
        let config = home.path().join(".config/opencode");
        std::fs::create_dir_all(&config).unwrap();
        std::fs::write(
            config.join("opencode.jsonc"),
            "{ // reviewed JSONC\n  \"provider\": {},\n}\n",
        )
        .unwrap();
        let root = home.path().join(".local/share/opencode");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("auth.json"), r#"{"openai":{"type":"api","key":"sentinel-opencode"},"gemini":{"type":"api","key":"sentinel-gemini-alias"},"anthropic":{"type":"oauth","access":"never"}}"#).unwrap();
        let rows = discover_opencode(home.path()).unwrap();
        assert_eq!(rows.len(), 3);
        let api = rows.iter().find(|row| row.kind == "openai").unwrap();
        assert_eq!(resolve(api, home.path()).unwrap(), "sentinel-opencode");
        let alias = rows.iter().find(|row| row.kind == "google").unwrap();
        assert_eq!(
            resolve(alias, home.path()).unwrap(),
            "sentinel-gemini-alias"
        );
        let json = serde_json::to_string(&rows).unwrap();
        assert!(!json.contains("sentinel-opencode"));
        assert!(!json.contains("sentinel-gemini-alias"));
        assert!(!json.contains("never"));
    }

    #[test]
    fn qwen_literal_and_kimi_toml_are_exact() {
        let home = tempdir().unwrap();
        std::fs::create_dir(home.path().join(".qwen")).unwrap();
        std::fs::write(
            home.path().join(".qwen/settings.json"),
            r#"{"security":{"auth":{"apiKey":"qwen-secret"}}}"#,
        )
        .unwrap();
        let qwen = discover_qwen(home.path()).unwrap().remove(0);
        assert_eq!(resolve(&qwen, home.path()).unwrap(), "qwen-secret");
        std::fs::create_dir(home.path().join(".kimi")).unwrap();
        std::fs::write(home.path().join(".kimi/config.toml"), "[providers.kimi-for-coding]\ntype='kimi'\nbase_url='https://api.kimi.com/coding/v1'\napi_key='kimi-secret'\n").unwrap();
        let kimi = discover_kimi(home.path()).unwrap().remove(0);
        assert_eq!(resolve(&kimi, home.path()).unwrap(), "kimi-secret");
    }

    #[test]
    fn vibe_dotenv_rejects_commands_and_resolves_exact_declared_name() {
        let home = tempdir().unwrap();
        let root = home.path().join(".vibe");
        std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join("config.toml"), "[[providers]]\nname='mistral'\napi_base='https://api.mistral.ai/v1'\napi_key_env_var='CUTOUT_VIBE_KEY'\nbackend='mistral'\n").unwrap();
        std::fs::write(root.join(".env"), "CUTOUT_VIBE_KEY=vibe-secret\n").unwrap();
        let row = discover_vibe(home.path()).unwrap().remove(0);
        assert_eq!(resolve(&row, home.path()).unwrap(), "vibe-secret");
        std::fs::write(root.join(".env"), "CUTOUT_VIBE_KEY=$(echo bad)\n").unwrap();
        assert!(discover_vibe(home.path()).is_err());
    }

    #[test]
    fn omp_yaml_command_is_display_only() {
        let home = tempdir().unwrap();
        let root = home.path().join(".omp/agent");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("models.yml"), "providers:\n  openai:\n    api: openai-responses\n    apiKey: '!security find-generic-password'\n").unwrap();
        let row = discover_omp(home.path()).unwrap().remove(0);
        assert!(!row.credential.importable);
        assert!(!serde_json::to_string(&row)
            .unwrap()
            .contains("security find"));
        for unsafe_yaml in [
            "providers:\n  openai: &source\n    api: openai-responses\n    apiKey: key\n",
            "providers:\n  openai:\n    <<: *source\n    api: openai-responses\n    apiKey: key\n",
            "providers:\n  openai:\n    api: openai-responses\n    apiKey: !command helper\n",
            "providers:\n  openai:\n    api: openai-responses\n    api: openai-completions\n    apiKey: key\n",
        ] {
            std::fs::write(root.join("models.yml"), unsafe_yaml).unwrap();
            assert!(discover_omp(home.path()).is_err());
        }
    }

    #[test]
    fn all_adapter_absence_and_malformed_sources_fail_closed() {
        with_test_environment(&[], || {
            let home = tempdir().unwrap();
            assert!(discover_opencode(home.path()).unwrap().is_empty());
            assert!(discover_pi(home.path()).unwrap().is_empty());
            assert!(discover_omp(home.path()).unwrap().is_empty());
            assert!(discover_gemini(home.path()).unwrap().is_empty());
            assert!(discover_qwen(home.path()).unwrap().is_empty());
            assert!(discover_kimi(home.path()).unwrap().is_empty());
            assert!(discover_vibe(home.path()).unwrap().is_empty());

            let cases = [
                (".config/opencode/opencode.json", "{"),
                (".pi/agent/auth.json", "{"),
                (".omp/agent/models.yml", "providers: ["),
                (".gemini/settings.json", "{"),
                (".qwen/settings.json", "{"),
                (".kimi/config.toml", "[providers"),
                (".vibe/config.toml", "[[providers"),
            ];
            for (path, contents) in cases {
                let full = home.path().join(path);
                std::fs::create_dir_all(full.parent().unwrap()).unwrap();
                std::fs::write(full, contents).unwrap();
            }
            assert!(discover_opencode(home.path()).is_err());
            assert!(discover_pi(home.path()).is_err());
            assert!(discover_omp(home.path()).is_err());
            assert!(discover_gemini(home.path()).is_err());
            assert!(discover_qwen(home.path()).is_err());
            assert!(discover_kimi(home.path()).is_err());
            assert!(discover_vibe(home.path()).is_err());
        });
    }

    #[test]
    fn malformed_agent_config_does_not_discard_other_reviewed_candidates() {
        with_test_environment(&[], || {
            let home = tempdir().unwrap();
            let opencode = home.path().join(".config/opencode");
            std::fs::create_dir_all(&opencode).unwrap();
            std::fs::write(opencode.join("opencode.json"), "{").unwrap();
            let qwen = home.path().join(".qwen");
            std::fs::create_dir(&qwen).unwrap();
            std::fs::write(
                qwen.join("settings.json"),
                r#"{"security":{"auth":{"apiKey":"qwen-secret"}}}"#,
            )
            .unwrap();

            let rows = discover(home.path()).unwrap();
            assert_eq!(rows.len(), 1);
            assert_eq!(rows[0].source, "qwen-code");
            assert_eq!(resolve(&rows[0], home.path()).unwrap(), "qwen-secret");
            assert!(!serde_json::to_string(&rows)
                .unwrap()
                .contains("qwen-secret"));
        });
    }

    #[test]
    fn pi_and_omp_models_json_are_typed_redacted_and_source_bound() {
        with_test_environment(&[("PI_OPENAI_API_KEY", "pi-env-secret")], || {
            let home = tempdir().unwrap();
            let pi = home.path().join(".pi/agent");
            std::fs::create_dir_all(&pi).unwrap();
            std::fs::write(
                pi.join("models.json"),
                r#"{"providers":{"openai":{"api":"openai-responses","baseUrl":"https://api.openai.com/v1","apiKey":"PI_OPENAI_API_KEY"},"unknown":{"api":"openai-responses","apiKey":"unknown-secret"}}}"#,
            )
            .unwrap();
            let pi_rows = discover_pi(home.path()).unwrap();
            assert_eq!(pi_rows.len(), 1);
            assert_eq!(resolve(&pi_rows[0], home.path()).unwrap(), "pi-env-secret");

            let omp = home.path().join(".omp/agent");
            std::fs::create_dir_all(&omp).unwrap();
            std::fs::write(
                omp.join("models.json"),
                r#"{"providers":{"openai":{"api":"openai-responses","baseUrl":"https://api.openai.com/v1","apiKey":"omp-literal-secret"},"gemini":{"api":"google-generative-ai","baseUrl":"https://generativelanguage.googleapis.com/v1beta","apiKey":"!helper must-not-run"}}}"#,
            )
            .unwrap();
            let omp_rows = discover_omp(home.path()).unwrap();
            let literal = omp_rows
                .iter()
                .find(|row| row.credential.importable)
                .unwrap();
            assert_eq!(resolve(literal, home.path()).unwrap(), "omp-literal-secret");
            assert!(omp_rows
                .iter()
                .any(|row| row.credential.source_type == "helper" && !row.credential.importable));
            let serialized = serde_json::to_string(&(pi_rows, omp_rows)).unwrap();
            for secret in [
                "pi-env-secret",
                "unknown-secret",
                "omp-literal-secret",
                "must-not-run",
            ] {
                assert!(!serialized.contains(secret));
            }
        });
    }

    #[test]
    fn gemini_and_kimi_environment_precedence_is_exact() {
        with_test_environment(
            &[
                ("GEMINI_API_KEY", "gemini-primary"),
                ("GOOGLE_API_KEY", "gemini-secondary"),
                ("KIMI_API_KEY", "kimi-environment"),
            ],
            || {
                let home = tempdir().unwrap();
                std::fs::create_dir(home.path().join(".gemini")).unwrap();
                std::fs::write(
                    home.path().join(".gemini/settings.json"),
                    r#"{"security":{"auth":{"selectedType":"oauth-personal"}}}"#,
                )
                .unwrap();
                let gemini = discover_gemini(home.path()).unwrap();
                let api = gemini.iter().find(|row| row.credential.importable).unwrap();
                assert_eq!(api.credential.reference.as_deref(), Some("GEMINI_API_KEY"));
                assert!(gemini
                    .iter()
                    .any(|row| row.credential.source_type == "session"));

                std::fs::create_dir(home.path().join(".kimi")).unwrap();
                std::fs::write(home.path().join(".kimi/config.toml"), "[providers.kimi-for-coding]\ntype='kimi'\nbase_url='https://api.kimi.com/coding/v1'\napi_key='kimi-literal'\n").unwrap();
                let kimi = discover_kimi(home.path()).unwrap();
                assert_eq!(kimi.len(), 1);
                assert_eq!(
                    kimi[0].base_url.as_deref(),
                    Some("https://api.kimi.com/coding/v1")
                );
                assert_eq!(kimi[0].credential.source_type, "environment");
                assert_eq!(resolve(&kimi[0], home.path()).unwrap(), "kimi-environment");
                let serialized = serde_json::to_string(&kimi).unwrap();
                assert!(!serialized.contains("kimi-literal"));
            },
        );
    }

    #[test]
    fn qwen_unknown_provider_and_vibe_dotenv_hazards_are_rejected() {
        with_test_environment(&[("QWEN_API_KEY", "qwen-env-secret")], || {
            let home = tempdir().unwrap();
            std::fs::create_dir(home.path().join(".qwen")).unwrap();
            std::fs::write(
                home.path().join(".qwen/settings.json"),
                r#"{"modelProviders":{"unknown":{"envKey":"QWEN_API_KEY"},"qwen":{"baseUrl":"https://dashscope.aliyuncs.com/compatible-mode/v1","envKey":"QWEN_API_KEY"}}}"#,
            )
            .unwrap();
            let qwen = discover_qwen(home.path()).unwrap();
            assert_eq!(qwen.len(), 1);
            assert_eq!(resolve(&qwen[0], home.path()).unwrap(), "qwen-env-secret");

            let vibe = home.path().join(".vibe");
            std::fs::create_dir(&vibe).unwrap();
            std::fs::write(vibe.join("config.toml"), "[[providers]]\nname='mistral'\napi_base='https://api.mistral.ai/v1'\napi_key_env_var='VIBE_API_KEY'\nbackend='mistral'\n").unwrap();
            for invalid in [
                "export VIBE_API_KEY=x\n",
                "VIBE_API_KEY=x\nVIBE_API_KEY=y\n",
                "VIBE_API_KEY=${OTHER}\n",
                "VIBE_API_KEY=`helper`\n",
                "VIBE_API_KEY=$(helper)\n",
            ] {
                std::fs::write(vibe.join(".env"), invalid).unwrap();
                assert!(discover_vibe(home.path()).is_err());
            }
        });
    }

    #[cfg(unix)]
    #[test]
    fn shared_reader_rejects_symlinked_components_files_nonfiles_and_oversize() {
        use std::os::unix::fs::symlink;
        let home = tempdir().unwrap();
        let actual = home.path().join("actual");
        std::fs::create_dir(&actual).unwrap();
        std::fs::write(actual.join("auth.json"), "{}").unwrap();
        symlink(&actual, home.path().join("linked")).unwrap();
        assert!(matches!(
            read_exact_config(&home.path().join("linked/auth.json")),
            Err(DiscoveryError::Symlink(_))
        ));
        symlink(actual.join("auth.json"), home.path().join("auth.json")).unwrap();
        assert!(matches!(
            read_exact_config(&home.path().join("auth.json")),
            Err(DiscoveryError::Symlink(_))
        ));
        assert!(read_exact_config(&actual).is_err());
        let oversized = actual.join("oversized.json");
        std::fs::File::create(&oversized)
            .unwrap()
            .set_len(1024 * 1024 + 1)
            .unwrap();
        assert!(matches!(
            read_exact_config(&oversized),
            Err(DiscoveryError::TooLarge(_))
        ));
    }
}
