# Technical design

## Architecture

Keep `provider_discovery.rs` as command/draft lifecycle owner. Add an
`agent_credentials/` native module for shared exact reads, closed provider
bindings, per-Agent parsers, sanitized candidate creation, and native secret
resolution. Do not add nine parsers to the existing command module.

Secret-bearing parser results and selectors are internal and non-serializable.
The existing `ProviderCandidate` remains the frontend compatibility DTO. A
candidate handle is derived from stable Agent/source/binding metadata and never
from a secret, file path, or frontend-provided locator.

The compile-time inventory definition owns the credential adapter kind so root
and capability metadata do not drift into a second independent registry.

## Native read boundary

Factor a crate-private exact-reader contract:

- only registry-owned absolute roots and exact relative files;
- every path component rejects symlinks, traversal, and identity drift;
- regular files only, maximum 1 MiB;
- missing is absence; permission and malformed sources become sanitized errors;
- JSON/JSONC/TOML/YAML/dotenv parsing occurs only in Rust;
- no recursive traversal, shell expansion, helper execution, or caller path.

OMP SQLite is inventory/session metadata only. If queried, open read-only and
immutable/query-only, validate schema, use a fixed projection that never selects
credential payload data, and keep it outside API-key resolution.

## Adapter contract

Each adapter owns a stable schema ID, root precedence, exact sources, typed
discriminants, closed provider binding, sanitized warnings, and a native
`resolve_secret` implementation. Provider bindings use `ProviderKind`,
`ProviderWireProtocol`, and an exact approved origin/base path. Unknown provider
IDs or protocols remain non-importable.

OpenCode JSONC must use a real parser. OMP YAML must reject tags, merge keys,
anchors/aliases, duplicate keys, commands, and unknown credential variants.
Vibe dotenv supports only a deliberately small assignment grammar and never
loads values into the process environment.

## Discovery and import flow

1. `discover_provider_candidates` asks every enabled adapter for sanitized rows.
2. `create_provider_draft` stores candidate identity and provider binding only.
3. `check_provider_draft` re-discovers the candidate, resolves the key natively,
   and performs the existing authenticated non-generation `GET /models` check.
4. `import_provider_draft` consumes the checked draft, re-discovers and re-reads
   again, rejects source/binding drift, stores the key, then atomically stores
   provider config with current rollback behavior.

Manual provider entry may retain its existing transient frontend `secret`
field. Discovered Agent sources never use that path.

## Compatibility and rollback

No persisted provider schema changes are required. Keep current candidate IDs
when the source/binding is unchanged. Individual adapters can be disabled by
registry capability without deleting imported providers. Session delegation
remains unsupported and the Agent capability manifest must not claim a bundled
provider executor.
