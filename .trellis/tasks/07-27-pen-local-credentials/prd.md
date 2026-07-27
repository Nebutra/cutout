# Rename Pencil to Pen and restore local credential discovery

## Goal

Make Pen the canonical name and protocol identity for the local `.pen` design
integration, while preserving compatibility with previously persisted Pencil
surface identifiers. Restore automatic reuse of a locally stored Codex OpenAI
API key without exposing the credential to the WebView or logs.

## Requirements

- Product-facing integration catalogs, manifests, capability declarations,
  documentation, tests, and UI labels use `Pen` rather than `Pencil`.
- Canonical integration identifiers use `pen`, `cutout.pen`, `pen-mcp`,
  `pen-cli`, and `pen-mcp-cli` as appropriate.
- Existing `pencil-mcp` and `pencil-cli` surface handshakes/plans remain
  accepted as compatibility aliases, but are not advertised as current
  capabilities.
- Generic edit icons imported from Lucide as `Pencil` remain unchanged.
- `.pen` file and schema terminology remains unchanged.
- Codex discovery honors `CODEX_HOME` and otherwise uses the exact
  `~/.codex` directory.
- A non-empty top-level `OPENAI_API_KEY` in Codex `auth.json` is discoverable
  and importable even when Codex `config.toml` has no explicit OpenAI provider
  table.
- Codex custom-provider `env_key` discovery continues to resolve from the
  native process environment.
- OAuth/session tokens or other auth fields must not be treated as API keys.
- Credential values remain inside Rust: candidate metadata, IPC payloads,
  frontend state, logs, and serialized tests must contain no secret value.
- Config/auth reads retain exact-path, no-symlink, regular-file, and bounded
  size checks.
- Existing Cutout-managed credentials are described as local credentials, not
  macOS Keychain credentials.
- Agent capability, runtime mirror, protocol, SDK, and documentation changes
  remain synchronized and pass `pnpm agent:validate`.

## Acceptance Criteria

- [x] All active product-facing references identify the integration as Pen;
      old Pencil protocol kinds appear only in explicit compatibility code and
      tests or historical records.
- [x] New manifests and capability reports emit only canonical Pen identifiers.
- [x] Legacy `pencil-mcp` and `pencil-cli` inputs still validate and execute
      through the same `.pen` migration/approval safeguards.
- [x] A Codex installation containing only a valid `auth.json`
      `OPENAI_API_KEY` yields an available/importable OpenAI candidate.
- [x] Selecting that candidate resolves the API key natively for connection
      check/import without serializing it to the frontend.
- [x] Missing, empty, OAuth-only, symlinked, or oversized Codex auth files do
      not produce an importable candidate.
- [x] Existing Codex custom-provider environment-key behavior still works.
- [x] Settings copy says Cutout local credentials rather than Cutout Keychain.
- [x] Focused TypeScript/Rust tests, lint, type-check, full tests, build,
      formatting, `pnpm agent:validate`, and `git diff --check` pass.

## Constraints

- Do not add live Pen/Pencil sync, web fetching, or other unimplemented host
  behavior.
- Do not weaken explicit preview, approval, migration, path, or provider
  protocol policies.
- Do not reintroduce macOS Keychain access; Cutout's current owner-only local
  secret store remains authoritative for imported provider credentials.
- Preserve unrelated changes in the user's original dirty workspace by doing
  the work in the clean task worktree.
