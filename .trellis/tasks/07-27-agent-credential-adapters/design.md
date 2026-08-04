# Technical design

## Architecture

Keep `provider_discovery.rs` as the command and draft lifecycle owner, but move
Agent-specific parsing and secret resolution behind a registry-backed native
adapter module. The adapter module has two separate output domains:

1. Internal secret-bearing resolution values that are never serializable.
2. Existing sanitized `ProviderCandidate` rows consumed by the frontend.

The common 39-Agent inventory remains the authority for stable Agent IDs,
reviewed roots, capability flags, and sanitized locations. This child upgrades
the nine Tier A `credential_adapter` capabilities only after their fixtures and
import paths pass.

## Adapter contract

Each adapter owns:

- stable Agent/source ID and evidence reference;
- reviewed root resolution using host-owned allowlisted environment variables;
- exact relative files and maximum size;
- parser/schema discriminator;
- closed provider kind, endpoint, wire protocol, and model hint projection;
- sanitized credential type/reference/warnings;
- native re-read function returning an API key only for an importable shape.

Candidate IDs are SHA-256-derived opaque identities over stable adapter/source
metadata. They never hash or include secret bytes. The existing draft stores the
candidate ID, provider contract, and connection-check result. Both check and
import re-run discovery by candidate ID, then resolve the secret natively.

## File boundary

Generalize the inventory path guard into a crate-private exact-file reader used
by credential adapters:

- absolute reviewed root only;
- reject `.`/`..`, root/component symlinks, directories, sockets, and devices;
- regular files only, at most 1 MiB;
- missing files are absence, permission errors are sanitized failures;
- no recursive traversal and no caller-provided path.

JSON, TOML, YAML, and dotenv parsing happens in Rust. OMP SQLite support in this
child is metadata-only if required to classify a source; fixed queries must not
select secret payload columns. API-key import comes from reviewed JSON/YAML/env
shapes, not opaque database blobs.

## Schema adapters

- Claude and Codex retain current candidate IDs where practical. Restore Codex
  `auth.json.OPENAI_API_KEY` fallback while ignoring `tokens.*`.
- OpenCode and Pi/OMP parse only entries with explicit `api` / `api_key`
  discriminants. OAuth entries may create sanitized non-importable warnings but
  never enter secret resolution.
- Gemini exposes only allowlisted process environment API keys; OAuth files are
  presence metadata only.
- Qwen reads only the reviewed literal API-key field or a known environment
  reference. Its OAuth file is never resolved as a secret.
- Kimi accepts only reviewed provider tables/objects whose provider mapping is
  known to Cutout.
- Vibe reads the config-declared API-key environment variable and an exact
  dotenv assignment for an allowlisted name. It does not expand variables,
  commands, quotes with interpolation, or arbitrary dotenv keys.

Unknown provider IDs, schema versions, field types, command/helper strings, and
credential variants fail closed. One malformed optional Agent source must not
prevent the remaining Agents and existing environment/Cutout candidates from
being discovered; errors are projected as sanitized warnings where possible.

## Provider and import flow

Reuse `CreateDraftInput`, `check_provider_draft`, and
`import_provider_draft`. The frontend never receives or submits source secret
bytes for discovered candidates. Manual custom-provider entry may continue to
use the existing transient `secret` field.

Import remains transactional:

1. consume the checked single-use draft;
2. re-discover and re-read the selected candidate;
3. verify provider kind/protocol/endpoint still match the draft;
4. write the key to Cutout's owner-only local secret store;
5. atomically persist provider config;
6. delete the new key if provider persistence fails.

## Compatibility and rollback

No persisted provider schema changes are required. Existing provider candidates
and manual entry stay valid. An individual adapter can be disabled by reverting
its registry capability and discovery registration without deleting already
imported providers. Session delegation remains unsupported and the Agent
capability manifest must not claim a provider executor.
