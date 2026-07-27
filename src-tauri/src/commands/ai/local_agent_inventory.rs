//! Offline inventory of reviewed local coding Agent installations.
//!
//! The registry is compile-time data. Discovery only inspects executable and
//! directory metadata at registered locations; it never reads credential files
//! or launches an Agent, package manager, installer, login flow, or shell.

use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
use std::fs::Metadata;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

const CATALOG_NAME: &str = "Paseo 39-Agent catalog";
const CATALOG_REVIEWED_AT: &str = "2026-07-27";
const MAX_PATH_ENTRIES: usize = 128;
const REVIEWED_ROOT_ENVIRONMENT: &[&str] = &[
    "CODEX_HOME",
    "CLAUDE_CONFIG_DIR",
    "OPENCODE_CONFIG_DIR",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "PI_CONFIG_DIR",
    "PI_CODING_AGENT_DIR",
    "GEMINI_CLI_HOME",
    "QWEN_HOME",
    "VIBE_HOME",
];

#[derive(Clone, Copy)]
struct RootDefinition {
    relative: &'static str,
    label: &'static str,
    environment_overrides: &'static [RootEnvironmentOverride],
    markers: &'static [&'static str],
}

#[derive(Clone, Copy)]
struct RootEnvironmentOverride {
    variable: &'static str,
    suffix: &'static str,
    label: &'static str,
}

#[derive(Clone, Copy)]
struct LocalAgentDefinition {
    id: &'static str,
    display_name: &'static str,
    aliases: &'static [&'static str],
    roots: &'static [RootDefinition],
    credential_adapter: CapabilitySupport,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CapabilitySupport {
    Supported,
    Unsupported,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum InstallationStatus {
    NotInstalled,
    Installed,
    PermissionRequired,
    ProbeFailed,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RootStatus {
    NotFound,
    Found,
    PermissionRequired,
    ProbeFailed,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentRegistryProvenance {
    catalog: &'static str,
    slug: &'static str,
    reviewed_at: &'static str,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentInstallation {
    status: InstallationStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    executable_alias: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfigRoot {
    label: &'static str,
    status: RootStatus,
    markers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentInventoryCapabilities {
    credential_adapter: CapabilitySupport,
    session_delegation: CapabilitySupport,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalAgentInventoryRow {
    id: &'static str,
    display_name: &'static str,
    cli_aliases: &'static [&'static str],
    provenance: AgentRegistryProvenance,
    installation: AgentInstallation,
    config_roots: Vec<AgentConfigRoot>,
    capabilities: AgentInventoryCapabilities,
}

const NO_ROOTS: &[RootDefinition] = &[];
const CODEX_ROOTS: &[RootDefinition] = &[
    RootDefinition {
        relative: ".codex",
        label: "~/.codex",
        environment_overrides: &[RootEnvironmentOverride {
            variable: "CODEX_HOME",
            suffix: "",
            label: "$CODEX_HOME",
        }],
        markers: &["config.toml", "auth.json"],
    },
    RootDefinition {
        relative: ".config/codex",
        label: "~/.config/codex",
        environment_overrides: &[],
        markers: &["auth.json"],
    },
];
const CLAUDE_ROOTS: &[RootDefinition] = &[RootDefinition {
    relative: ".claude",
    label: "~/.claude",
    environment_overrides: &[RootEnvironmentOverride {
        variable: "CLAUDE_CONFIG_DIR",
        suffix: "",
        label: "$CLAUDE_CONFIG_DIR",
    }],
    markers: &["settings.json", ".credentials.json"],
}];
const OPENCODE_ROOTS: &[RootDefinition] = &[
    RootDefinition {
        relative: ".config/opencode",
        label: "~/.config/opencode",
        environment_overrides: &[
            RootEnvironmentOverride {
                variable: "OPENCODE_CONFIG_DIR",
                suffix: "",
                label: "$OPENCODE_CONFIG_DIR",
            },
            RootEnvironmentOverride {
                variable: "XDG_CONFIG_HOME",
                suffix: "opencode",
                label: "$XDG_CONFIG_HOME/opencode",
            },
        ],
        markers: &["opencode.json", "opencode.jsonc"],
    },
    RootDefinition {
        relative: ".local/share/opencode",
        label: "~/.local/share/opencode",
        environment_overrides: &[RootEnvironmentOverride {
            variable: "XDG_DATA_HOME",
            suffix: "opencode",
            label: "$XDG_DATA_HOME/opencode",
        }],
        markers: &["auth.json"],
    },
];
const OMP_ROOTS: &[RootDefinition] = &[
    RootDefinition {
        relative: ".omp",
        label: "~/.omp",
        environment_overrides: &[RootEnvironmentOverride {
            variable: "PI_CONFIG_DIR",
            suffix: "",
            label: "$PI_CONFIG_DIR",
        }],
        markers: &[
            "agent/auth.json",
            "agent/settings.json",
            "agent/models.json",
            "agent/agent.db",
            "agent/models.yml",
            "agent/models.yaml",
            "agent/config.yml",
        ],
    },
    RootDefinition {
        relative: ".omp/agent",
        label: "~/.omp/agent",
        environment_overrides: &[RootEnvironmentOverride {
            variable: "PI_CODING_AGENT_DIR",
            suffix: "",
            label: "$PI_CODING_AGENT_DIR",
        }],
        markers: &[
            "auth.json",
            "settings.json",
            "models.json",
            "agent.db",
            "models.yml",
            "models.yaml",
            "config.yml",
        ],
    },
];
const PI_ROOTS: &[RootDefinition] = &[RootDefinition {
    relative: ".pi/agent",
    label: "~/.pi/agent",
    environment_overrides: &[RootEnvironmentOverride {
        variable: "PI_CODING_AGENT_DIR",
        suffix: "",
        label: "$PI_CODING_AGENT_DIR",
    }],
    markers: &["auth.json", "settings.json", "models.json"],
}];
const GEMINI_ROOTS: &[RootDefinition] = &[RootDefinition {
    relative: ".gemini",
    label: "~/.gemini",
    environment_overrides: &[RootEnvironmentOverride {
        variable: "GEMINI_CLI_HOME",
        suffix: "",
        label: "$GEMINI_CLI_HOME",
    }],
    markers: &["settings.json", "oauth_creds.json"],
}];
const QWEN_ROOTS: &[RootDefinition] = &[RootDefinition {
    relative: ".qwen",
    label: "~/.qwen",
    environment_overrides: &[RootEnvironmentOverride {
        variable: "QWEN_HOME",
        suffix: "",
        label: "$QWEN_HOME",
    }],
    markers: &["settings.json", "oauth_creds.json"],
}];
const KIMI_ROOTS: &[RootDefinition] = &[RootDefinition {
    relative: ".kimi",
    label: "~/.kimi",
    environment_overrides: &[],
    markers: &["config.toml", "config.json"],
}];
const VIBE_ROOTS: &[RootDefinition] = &[RootDefinition {
    relative: ".vibe",
    label: "~/.vibe",
    environment_overrides: &[RootEnvironmentOverride {
        variable: "VIBE_HOME",
        suffix: "",
        label: "$VIBE_HOME",
    }],
    markers: &["config.toml", ".env"],
}];

macro_rules! agent {
    ($id:literal, $name:literal, [$($alias:literal),+ $(,)?], $roots:expr, $credential:ident) => {
        LocalAgentDefinition {
            id: $id,
            display_name: $name,
            aliases: &[$($alias),+],
            roots: $roots,
            credential_adapter: CapabilitySupport::$credential,
        }
    };
}

const LOCAL_AGENT_REGISTRY: &[LocalAgentDefinition] = &[
    agent!(
        "claude-code",
        "Claude Code",
        ["claude"],
        CLAUDE_ROOTS,
        Supported
    ),
    agent!("codex", "Codex", ["codex"], CODEX_ROOTS, Supported),
    agent!(
        "opencode",
        "OpenCode",
        ["opencode"],
        OPENCODE_ROOTS,
        Supported
    ),
    agent!(
        "copilot",
        "GitHub Copilot",
        ["copilot"],
        NO_ROOTS,
        Unsupported
    ),
    agent!("omp", "OMP (Oh My Pi)", ["omp"], OMP_ROOTS, Supported),
    agent!("pi", "Pi Agent", ["pi"], PI_ROOTS, Supported),
    agent!("cursor", "Cursor", ["cursor-agent"], NO_ROOTS, Unsupported),
    agent!("gemini", "Gemini CLI", ["gemini"], GEMINI_ROOTS, Supported),
    agent!("hermes", "Hermes Agent", ["hermes"], NO_ROOTS, Unsupported),
    agent!("qwen-code", "Qwen Code", ["qwen"], QWEN_ROOTS, Supported),
    agent!("kimi", "Kimi Code CLI", ["kimi"], KIMI_ROOTS, Supported),
    agent!("amp", "Amp", ["amp", "amp-acp"], NO_ROOTS, Unsupported),
    agent!("auggie", "Auggie CLI", ["auggie"], NO_ROOTS, Unsupported),
    agent!("cline", "Cline", ["cline"], NO_ROOTS, Unsupported),
    agent!(
        "codebuddy",
        "Codebuddy Code",
        ["codebuddy"],
        NO_ROOTS,
        Unsupported
    ),
    agent!(
        "cortex-code",
        "Cortex Code",
        ["cortex"],
        NO_ROOTS,
        Unsupported
    ),
    agent!(
        "corust",
        "Corust Agent",
        ["corust-agent-acp"],
        NO_ROOTS,
        Unsupported
    ),
    agent!("crow", "crow-cli", ["crow-cli"], NO_ROOTS, Unsupported),
    agent!(
        "deepagents",
        "DeepAgents",
        ["deepagents-acp"],
        NO_ROOTS,
        Unsupported
    ),
    agent!(
        "deepseek-tui",
        "CodeWhale",
        ["codewhale"],
        NO_ROOTS,
        Unsupported
    ),
    agent!("dimcode", "DimCode", ["dimcode"], NO_ROOTS, Unsupported),
    agent!("dirac", "Dirac", ["dirac"], NO_ROOTS, Unsupported),
    agent!(
        "factory-droid",
        "Factory Droid",
        ["droid"],
        NO_ROOTS,
        Unsupported
    ),
    agent!(
        "fast-agent",
        "fast-agent",
        ["fast-agent", "fast-agent-acp"],
        NO_ROOTS,
        Unsupported
    ),
    agent!(
        "glm",
        "GLM Agent",
        ["glm", "glm-acp-agent"],
        NO_ROOTS,
        Unsupported
    ),
    agent!("goose", "goose", ["goose"], NO_ROOTS, Unsupported),
    agent!("junie", "Junie", ["junie"], NO_ROOTS, Unsupported),
    agent!("kilo", "Kilo Code", ["kilo"], NO_ROOTS, Unsupported),
    agent!(
        "minion-code",
        "Minion Code",
        ["minion-code"],
        NO_ROOTS,
        Unsupported
    ),
    agent!(
        "mistral-vibe",
        "Mistral Vibe",
        ["vibe", "vibe-acp"],
        VIBE_ROOTS,
        Supported
    ),
    agent!("nova", "Nova", ["nova"], NO_ROOTS, Unsupported),
    agent!("poolside", "Poolside", ["pool"], NO_ROOTS, Unsupported),
    agent!("qoder", "Qoder CLI", ["qoder"], NO_ROOTS, Unsupported),
    agent!("sigit", "siGit Code", ["sigit"], NO_ROOTS, Unsupported),
    agent!("stakpak", "Stakpak", ["stakpak"], NO_ROOTS, Unsupported),
    agent!("vtcode", "VT Code", ["vtcode"], NO_ROOTS, Unsupported),
    agent!(
        "agoragentic",
        "Agoragentic",
        ["agoragentic-mcp"],
        NO_ROOTS,
        Unsupported
    ),
    agent!(
        "autohand",
        "Autohand Code",
        ["autohand-acp"],
        NO_ROOTS,
        Unsupported
    ),
    agent!("grok", "Grok", ["grok"], NO_ROOTS, Unsupported),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MetadataFailure {
    Permission,
    Symlink,
    Other,
}

type ReviewedEnvironment = HashMap<&'static str, OsString>;

fn metadata_failure(error: std::io::Error) -> MetadataFailure {
    if error.kind() == std::io::ErrorKind::PermissionDenied {
        MetadataFailure::Permission
    } else {
        MetadataFailure::Other
    }
}

fn metadata_without_symlinks(path: &Path) -> Result<Option<Metadata>, MetadataFailure> {
    if !path.is_absolute() {
        return Err(MetadataFailure::Other);
    }
    let mut cursor = PathBuf::new();
    let mut latest = None;
    for component in path.components() {
        match component {
            Component::Prefix(_) | Component::RootDir | Component::Normal(_) => {
                cursor.push(component.as_os_str());
            }
            Component::CurDir | Component::ParentDir => return Err(MetadataFailure::Other),
        }
        match std::fs::symlink_metadata(&cursor) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() {
                    return Err(MetadataFailure::Symlink);
                }
                latest = Some(metadata);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
                return Err(MetadataFailure::Permission);
            }
            Err(_) => return Err(MetadataFailure::Other),
        }
    }
    Ok(latest)
}

fn executable_metadata(path: &Path) -> Result<Option<Metadata>, MetadataFailure> {
    let parent = path.parent().ok_or(MetadataFailure::Other)?;
    match metadata_without_symlinks(parent)? {
        Some(metadata) if metadata.is_dir() => {}
        Some(_) => return Err(MetadataFailure::Other),
        None => return Ok(None),
    }
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(metadata_failure(error)),
    };
    if !metadata.file_type().is_symlink() {
        return Ok(Some(metadata));
    }
    let target = std::fs::canonicalize(path).map_err(metadata_failure)?;
    metadata_without_symlinks(&target)
}

fn is_bare_alias(alias: &str) -> bool {
    !alias.is_empty()
        && alias.len() <= 64
        && alias != "npx"
        && alias != "uvx"
        && alias
            .bytes()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, b'-' | b'_' | b'.'))
}

fn is_safe_relative_path(value: &str) -> bool {
    let path = Path::new(value);
    !path.as_os_str().is_empty()
        && !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

#[cfg(unix)]
fn is_executable(metadata: &Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    metadata.is_file() && metadata.permissions().mode() & 0o111 != 0
}

#[cfg(not(unix))]
fn is_executable(metadata: &Metadata) -> bool {
    metadata.is_file()
}

fn probe_installation(aliases: &[&str], path_value: Option<&OsStr>) -> AgentInstallation {
    let Some(path_value) = path_value else {
        return AgentInstallation {
            status: InstallationStatus::NotInstalled,
            executable_alias: None,
        };
    };
    let mut failure = None;
    for directory in std::env::split_paths(path_value).take(MAX_PATH_ENTRIES) {
        if !directory.is_absolute() {
            continue;
        }
        for alias in aliases.iter().copied().filter(|alias| is_bare_alias(alias)) {
            let candidate = directory.join(alias);
            match executable_metadata(&candidate) {
                Ok(Some(metadata)) if is_executable(&metadata) => {
                    return AgentInstallation {
                        status: InstallationStatus::Installed,
                        executable_alias: Some((*alias).to_owned()),
                    };
                }
                Ok(Some(_)) => {
                    failure.get_or_insert(MetadataFailure::Other);
                }
                Ok(None) => {}
                Err(MetadataFailure::Permission) => {
                    failure = Some(MetadataFailure::Permission);
                }
                Err(error) if failure != Some(MetadataFailure::Permission) => {
                    failure = Some(error);
                }
                Err(_) => {}
            }
        }
    }
    let status = match failure {
        Some(MetadataFailure::Permission) => InstallationStatus::PermissionRequired,
        Some(MetadataFailure::Symlink | MetadataFailure::Other) => InstallationStatus::ProbeFailed,
        None => InstallationStatus::NotInstalled,
    };
    AgentInstallation {
        status,
        executable_alias: None,
    }
}

fn marker_label(label: &str, marker: &str) -> String {
    format!("{label}/{marker}")
}

fn resolve_root(
    home: &Path,
    root: &RootDefinition,
    environment: &ReviewedEnvironment,
) -> Result<(PathBuf, &'static str), MetadataFailure> {
    let Some((environment_override, value)) =
        root.environment_overrides.iter().find_map(|definition| {
            environment
                .get(definition.variable)
                .map(|value| (definition, value))
        })
    else {
        return Ok((home.join(root.relative), root.label));
    };
    let base = PathBuf::from(value);
    if !base.is_absolute()
        || (!environment_override.suffix.is_empty()
            && !is_safe_relative_path(environment_override.suffix))
    {
        return Err(MetadataFailure::Other);
    }
    let path = if environment_override.suffix.is_empty() {
        base
    } else {
        base.join(environment_override.suffix)
    };
    Ok((path, environment_override.label))
}

fn probe_root(
    home: &Path,
    root: &RootDefinition,
    environment: &ReviewedEnvironment,
) -> AgentConfigRoot {
    if !is_safe_relative_path(root.relative)
        || !root
            .markers
            .iter()
            .all(|marker| is_safe_relative_path(marker))
    {
        return AgentConfigRoot {
            label: root.label,
            status: RootStatus::ProbeFailed,
            markers: Vec::new(),
        };
    }
    let (path, label) = match resolve_root(home, root, environment) {
        Ok(value) => value,
        Err(_) => {
            return AgentConfigRoot {
                label: root
                    .environment_overrides
                    .iter()
                    .find(|definition| environment.contains_key(definition.variable))
                    .map(|value| value.label)
                    .unwrap_or(root.label),
                status: RootStatus::ProbeFailed,
                markers: Vec::new(),
            };
        }
    };
    match metadata_without_symlinks(&path) {
        Ok(Some(metadata)) if metadata.is_dir() => {}
        Ok(Some(_)) | Err(MetadataFailure::Symlink | MetadataFailure::Other) => {
            return AgentConfigRoot {
                label,
                status: RootStatus::ProbeFailed,
                markers: Vec::new(),
            };
        }
        Ok(None) => {
            return AgentConfigRoot {
                label,
                status: RootStatus::NotFound,
                markers: Vec::new(),
            };
        }
        Err(MetadataFailure::Permission) => {
            return AgentConfigRoot {
                label,
                status: RootStatus::PermissionRequired,
                markers: Vec::new(),
            };
        }
    }

    let mut markers = Vec::new();
    for marker in root.markers {
        match metadata_without_symlinks(&path.join(marker)) {
            Ok(Some(metadata)) if metadata.is_file() => markers.push(marker_label(label, marker)),
            Ok(Some(_)) | Err(MetadataFailure::Symlink | MetadataFailure::Other) => {
                return AgentConfigRoot {
                    label,
                    status: RootStatus::ProbeFailed,
                    markers: Vec::new(),
                };
            }
            Err(MetadataFailure::Permission) => {
                return AgentConfigRoot {
                    label,
                    status: RootStatus::PermissionRequired,
                    markers: Vec::new(),
                };
            }
            Ok(None) => {}
        }
    }
    AgentConfigRoot {
        label,
        status: RootStatus::Found,
        markers,
    }
}

fn inventory(
    home: &Path,
    path_value: Option<&OsStr>,
    environment: &ReviewedEnvironment,
) -> Vec<LocalAgentInventoryRow> {
    LOCAL_AGENT_REGISTRY
        .iter()
        .map(|definition| LocalAgentInventoryRow {
            id: definition.id,
            display_name: definition.display_name,
            cli_aliases: definition.aliases,
            provenance: AgentRegistryProvenance {
                catalog: CATALOG_NAME,
                slug: definition.id,
                reviewed_at: CATALOG_REVIEWED_AT,
            },
            installation: probe_installation(definition.aliases, path_value),
            config_roots: definition
                .roots
                .iter()
                .map(|root| probe_root(home, root, environment))
                .collect(),
            capabilities: AgentInventoryCapabilities {
                credential_adapter: definition.credential_adapter,
                session_delegation: CapabilitySupport::Unsupported,
            },
        })
        .collect()
}

#[tauri::command]
pub fn discover_local_agent_inventory<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<LocalAgentInventoryRow>, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|_| "local-agent-home-unavailable".to_owned())?;
    let environment = REVIEWED_ROOT_ENVIRONMENT
        .iter()
        .filter_map(|variable| std::env::var_os(variable).map(|value| (*variable, value)))
        .collect();
    Ok(inventory(
        &home,
        std::env::var_os("PATH").as_deref(),
        &environment,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use tempfile::tempdir_in;

    const PINNED_IDS: &[&str] = &[
        "claude-code",
        "codex",
        "opencode",
        "copilot",
        "omp",
        "pi",
        "cursor",
        "gemini",
        "hermes",
        "qwen-code",
        "kimi",
        "amp",
        "auggie",
        "cline",
        "codebuddy",
        "cortex-code",
        "corust",
        "crow",
        "deepagents",
        "deepseek-tui",
        "dimcode",
        "dirac",
        "factory-droid",
        "fast-agent",
        "glm",
        "goose",
        "junie",
        "kilo",
        "minion-code",
        "mistral-vibe",
        "nova",
        "poolside",
        "qoder",
        "sigit",
        "stakpak",
        "vtcode",
        "agoragentic",
        "autohand",
        "grok",
    ];

    fn workspace_tempdir() -> tempfile::TempDir {
        tempdir_in(std::env::current_dir().unwrap()).unwrap()
    }

    #[test]
    fn registry_matches_the_pinned_catalog_and_rejects_installer_forms() {
        assert_eq!(LOCAL_AGENT_REGISTRY.len(), 39);
        assert_eq!(
            LOCAL_AGENT_REGISTRY
                .iter()
                .map(|row| row.id)
                .collect::<Vec<_>>(),
            PINNED_IDS
        );
        let ids = LOCAL_AGENT_REGISTRY
            .iter()
            .map(|row| row.id)
            .collect::<HashSet<_>>();
        assert_eq!(ids.len(), 39);
        for definition in LOCAL_AGENT_REGISTRY {
            assert!(!definition.aliases.is_empty());
            assert!(definition.aliases.iter().all(|alias| is_bare_alias(alias)));
            for root in definition.roots {
                assert!(is_safe_relative_path(root.relative));
                assert!(root
                    .markers
                    .iter()
                    .all(|marker| is_safe_relative_path(marker)));
                for environment_override in root.environment_overrides {
                    assert!(REVIEWED_ROOT_ENVIRONMENT.contains(&environment_override.variable));
                    assert!(
                        environment_override.suffix.is_empty()
                            || is_safe_relative_path(environment_override.suffix)
                    );
                    assert!(environment_override.label.starts_with('$'));
                }
            }
        }
        assert!(!is_bare_alias("npx"));
        assert!(!is_bare_alias("uvx"));
        assert!(!is_bare_alias("npx -y cline"));
        assert!(!is_bare_alias("/tmp/codex"));
    }

    #[test]
    fn emits_all_rows_when_nothing_is_installed() {
        let home = workspace_tempdir();
        let empty_path = std::env::join_paths([home.path().join("missing")]).unwrap();
        let rows = inventory(home.path(), Some(&empty_path), &HashMap::new());
        assert_eq!(rows.len(), 39);
        assert!(rows
            .iter()
            .all(|row| row.installation.status == InstallationStatus::NotInstalled));
        assert!(rows.iter().all(|row| row
            .config_roots
            .iter()
            .all(|root| root.status == RootStatus::NotFound)));
    }

    #[cfg(unix)]
    #[test]
    fn finds_direct_and_safely_resolved_symlinked_executables() {
        use std::os::unix::fs::{symlink, PermissionsExt};

        let home = workspace_tempdir();
        let bin = home.path().join("bin");
        std::fs::create_dir(&bin).unwrap();
        let direct = bin.join("codex");
        std::fs::write(&direct, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&direct, std::fs::Permissions::from_mode(0o700)).unwrap();
        let path = std::env::join_paths([&bin]).unwrap();
        let installed = probe_installation(&["codex"], Some(&path));
        assert_eq!(installed.status, InstallationStatus::Installed);
        assert_eq!(installed.executable_alias.as_deref(), Some("codex"));

        symlink(&direct, bin.join("claude")).unwrap();
        let resolved = probe_installation(&["claude"], Some(&path));
        assert_eq!(resolved.status, InstallationStatus::Installed);
        assert_eq!(resolved.executable_alias.as_deref(), Some("claude"));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_in_any_registered_root_component() {
        use std::os::unix::fs::symlink;

        let home = workspace_tempdir();
        let actual = home.path().join("actual-agent");
        std::fs::create_dir_all(&actual).unwrap();
        std::fs::write(actual.join("auth.json"), "secret = 'not-read'").unwrap();
        std::fs::create_dir(home.path().join(".omp")).unwrap();
        symlink(&actual, home.path().join(".omp/agent")).unwrap();

        let root = probe_root(home.path(), &OMP_ROOTS[0], &HashMap::new());
        assert_eq!(root.status, RootStatus::ProbeFailed);
        assert!(root.markers.is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn reports_permission_errors_without_returning_host_paths() {
        use std::os::unix::fs::PermissionsExt;

        let home = workspace_tempdir();
        let bin = home.path().join("private-bin");
        std::fs::create_dir(&bin).unwrap();
        std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o000)).unwrap();
        let path = std::env::join_paths([&bin]).unwrap();
        let result = probe_installation(&["codex"], Some(&path));
        std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o700)).unwrap();

        assert_eq!(result.status, InstallationStatus::PermissionRequired);
        assert_eq!(result.executable_alias, None);
        let serialized = serde_json::to_string(&result).unwrap();
        assert!(!serialized.contains(home.path().to_string_lossy().as_ref()));
    }

    #[test]
    fn returns_only_sanitized_root_and_alias_labels() {
        let home = workspace_tempdir();
        std::fs::create_dir(home.path().join(".codex")).unwrap();
        std::fs::write(
            home.path().join(".codex/auth.json"),
            r#"{"OPENAI_API_KEY":"must-not-cross-ipc","tokens":{"access_token":"oauth"}}"#,
        )
        .unwrap();

        let rows = inventory(home.path(), None, &HashMap::new());
        let codex = rows.iter().find(|row| row.id == "codex").unwrap();
        assert_eq!(codex.config_roots[0].status, RootStatus::Found);
        assert_eq!(codex.config_roots[0].markers, vec!["~/.codex/auth.json"]);
        let serialized = serde_json::to_string(&rows).unwrap();
        assert!(!serialized.contains("must-not-cross-ipc"));
        assert!(!serialized.contains("access_token"));
        assert!(!serialized.contains(home.path().to_string_lossy().as_ref()));
    }

    #[test]
    fn uses_only_reviewed_absolute_environment_root_overrides() {
        let home = workspace_tempdir();
        let override_root = home.path().join("custom-codex");
        std::fs::create_dir(&override_root).unwrap();
        std::fs::write(override_root.join("config.toml"), "model = 'test'").unwrap();
        let mut environment = HashMap::new();
        environment.insert("CODEX_HOME", override_root.as_os_str().to_owned());

        let row = probe_root(home.path(), &CODEX_ROOTS[0], &environment);
        assert_eq!(row.label, "$CODEX_HOME");
        assert_eq!(row.status, RootStatus::Found);
        assert_eq!(row.markers, vec!["$CODEX_HOME/config.toml"]);

        environment.insert("CODEX_HOME", OsString::from("relative/path"));
        let rejected = probe_root(home.path(), &CODEX_ROOTS[0], &environment);
        assert_eq!(rejected.label, "$CODEX_HOME");
        assert_eq!(rejected.status, RootStatus::ProbeFailed);
        assert!(rejected.markers.is_empty());
    }

    #[test]
    fn uses_direct_opencode_override_before_xdg_and_detects_legacy_codex_root() {
        let home = workspace_tempdir();
        let direct = home.path().join("opencode-direct");
        let xdg = home.path().join("xdg");
        std::fs::create_dir(&direct).unwrap();
        std::fs::create_dir_all(xdg.join("opencode")).unwrap();
        std::fs::write(direct.join("opencode.json"), "{}").unwrap();
        std::fs::write(xdg.join("opencode/opencode.json"), "{}").unwrap();
        std::fs::create_dir_all(home.path().join(".config/codex")).unwrap();
        std::fs::write(home.path().join(".config/codex/auth.json"), "{}").unwrap();
        let mut environment = HashMap::new();
        environment.insert("OPENCODE_CONFIG_DIR", direct.as_os_str().to_owned());
        environment.insert("XDG_CONFIG_HOME", xdg.as_os_str().to_owned());

        let opencode = probe_root(home.path(), &OPENCODE_ROOTS[0], &environment);
        assert_eq!(opencode.label, "$OPENCODE_CONFIG_DIR");
        assert_eq!(opencode.markers, vec!["$OPENCODE_CONFIG_DIR/opencode.json"]);

        let legacy_codex = probe_root(home.path(), &CODEX_ROOTS[1], &environment);
        assert_eq!(legacy_codex.status, RootStatus::Found);
        assert_eq!(legacy_codex.markers, vec!["~/.config/codex/auth.json"]);
    }

    #[test]
    fn detects_the_reviewed_omp_agent_directory_override() {
        let home = workspace_tempdir();
        let agent_dir = home.path().join("omp-agent");
        std::fs::create_dir(&agent_dir).unwrap();
        std::fs::write(agent_dir.join("agent.db"), []).unwrap();
        let mut environment = HashMap::new();
        environment.insert("PI_CODING_AGENT_DIR", agent_dir.as_os_str().to_owned());

        let root = probe_root(home.path(), &OMP_ROOTS[1], &environment);
        assert_eq!(root.label, "$PI_CODING_AGENT_DIR");
        assert_eq!(root.status, RootStatus::Found);
        assert_eq!(root.markers, vec!["$PI_CODING_AGENT_DIR/agent.db"]);
    }
}
