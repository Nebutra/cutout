# Technical Design

## Boundaries

This change has two independent implementation areas joined by one release:
integration identity/contracts and native provider credential discovery. The
frontend receives sanitized discovery metadata only; Rust remains the sole
owner of credential reads and imports.

## Pen Identity And Compatibility

Canonical catalog and capability output changes from Pencil to Pen:

| Surface | Canonical value |
| --- | --- |
| Product key/name | `pen` / `Pen` |
| Integration id | `cutout.pen` |
| Host kinds | `pen-mcp`, `pen-cli` |
| Capability id | `pen-mcp-cli` |

The external surface schemas accept the canonical kinds plus legacy
`pencil-mcp` and `pencil-cli`. A small normalization/predicate boundary treats
all four as the same `.pen` host family for foreground and migration checks.
Receipts continue to bind to the exact plan/session kind so protocol integrity
is not weakened. Catalogs, manifests, process-surface declarations, and docs
emit only the canonical values.

The existing bundled bitmap can keep its internal filename if renaming the
binary adds no value, but the registry key, display name, provenance copy, and
tests become Pen. Lucide `Pencil` symbols used for edit actions are unrelated
and stay untouched.

## Codex Credential Discovery

Introduce one Codex-root helper that resolves `CODEX_HOME` when present and
otherwise `<home>/.codex`. Both `config.toml` and `auth.json` use the existing
bounded exact-file reader.

Parse `auth.json` as JSON in Rust and accept exactly a non-empty top-level
string named `OPENAI_API_KEY`. Discovery adds a canonical OpenAI candidate with
sanitized metadata (`config-literal`, reference `OPENAI_API_KEY`) whenever that
value exists. This candidate is produced even without `config.toml` or an
explicit `[model_providers.openai]` table. If OpenAI is already represented by
the config, candidate IDs/deduplication prevent duplicate rows.

Candidate secret resolution branches by credential source:

- Codex `config-literal` + `OPENAI_API_KEY`: re-read `auth.json` natively.
- Codex `environment`: read the named environment variable.
- Other existing sources: preserve their current resolution behavior.

The credential string is never stored in `ProviderCandidate`, never returned
by a command, and never sent to TypeScript. The draft keeps only a candidate
id; check/import resolve the current secret inside Rust and then store it in
Cutout's owner-only local credential store.

## Error And Security Behavior

- Missing/empty/unsupported auth content is treated as no reusable credential.
- Malformed existing auth/config files return the existing sanitized discovery
  error rather than guessing.
- Symlinked parents/files and oversized files fail closed through
  `read_exact_config`.
- OAuth/session token fields are ignored.
- Candidate serialization tests include a sentinel secret and prove it is
  absent.

## Copy And Compatibility

The source label `Cutout Keychain` is stale after the local secret-store
migration. Replace it with `Cutout local credentials` in Rust, UI defaults, and
locale catalogs. Internal function/source ids may remain stable when changing
them would break persisted candidate identifiers; user-facing copy must not
claim Keychain use.

## Rollout And Rollback

The change is backward compatible at protocol input boundaries and forward
canonical in emitted manifests. Rollback is a single commit revert; no data
migration is performed. Existing provider records and stored secrets are not
rewritten.
