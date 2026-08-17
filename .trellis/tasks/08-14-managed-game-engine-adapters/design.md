# Managed game engine adapters - technical design

## Boundary

Adapters are pure derived compilers plus owning validators. Their source of truth
is an accepted neutral bundle; engine files never become authoritative Game IR.
Implementation waits for at least one accepted family bundle and one accepted map
bundle, while adapter schemas may be designed against their frozen contracts.

## Contracts

- `game-engine.adapter-plan.v1`: source bundle/acceptance identity, engine,
  adapter/version, target version range, output files and validation requirements.
- `game-engine.adapter-receipt.v1`: plan hash, exact output hashes, validator
  identity/version, observed resources and findings.
- `game-engine.integration-brief.v1`: optional bounded request for the Coding
  Profile to import the package into a chosen project.

## Pipeline

```text
accepted neutral bundle
  -> adapter dry-run plan
  -> deterministic files in staging
  -> path/hash/reference validation
  -> owning engine load/import validation
  -> atomic managed export + receipt
```

Godot and Unity implementations share only neutral input readers and portable
path/hash utilities. Their output schemas, version policies and validators remain
separate. Unsupported neutral semantics fail or are explicitly reported; they are
never silently dropped.

The first Godot scope is data/animation resources plus a minimal preview scene.
The first Unity scope is texture/sprite import metadata, animation descriptors and
map data suitable for explicit consumer integration. Project assets/databases are
not mutated by the adapter.

## Rollback

Compilation occurs in staging. A failed validator removes or leaves only
recoverable staging data, never a partial accepted package. Neutral artifacts and
their acceptance remain unchanged.
