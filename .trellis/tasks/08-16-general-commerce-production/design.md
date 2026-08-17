# Technical Design

## Boundaries

The feature has two authority domains sharing one execution kernel:

1. `runCommerceProjectProduction` owns ordinary JSON normalization, local image validation/content hashing, project run identity, project bindings, progress, and project result assembly.
2. `runCommerceHeldOutProduction` continues to own evaluator challenge validation, input manifest, native commitment, competition source ingestion, rehearsal verification, and completion request.
3. `executeCommerceProduction` owns only the common eleven-role Provider DAG. It receives already validated facts, catalogs, source bytes/content ids, compiled graphs/plan, run bindings, optional held-out authority, and a native host.

The shared executor never creates authority. It copies an optional held-out commitment into host context only when the held-out wrapper provides one.

## Contracts

### Project input

`CommerceProjectProductionInput` contains product/category/attribute JSON filenames and contents, one to three `{ fileName, mediaType, bytes }` local references, Provider id, optional abort signal, and optional progress callback.

The project preprocessor parses the ordinary product object, injects `images` descriptors for the exact local references, and passes the result through the existing `normalizeProductRecord`. This preserves the established evidence model while making local files authoritative for image identity.

### Local source material

Each source is decoded and bounded before Provider execution and represented by filename, fact id, media type, dimensions, byte length, SHA-256, artifact id, and bytes. Duplicate hashes fail closed. These records have no competition ingest receipt.

### Project result

`commerceProjectProductionResultSchema` is strict and contains:

- schema and completed run metadata;
- normalized source metadata without raw input paths;
- exactly eleven ordered deliverables;
- per-deliverable publication artifact id/hash, media type, byte length, filename, retained bytes, Provider receipt, optional playback source receipt, and optional QA receipt/result;
- no evaluator or benchmark fields.

Structured deliverables use deterministic Markdown bytes. Media deliverables use the native verified Provider bytes.

### Progress

The executor emits `step-started` and `deliverable-completed` events in semantic-role order. The project wrapper emits `run-completed`; its caller owns failure/cancel presentation and keeps earlier completion events.

## Data Flow

```text
ordinary JSON + local images + Provider
  -> bounded parse / image decode / SHA-256
  -> ProductFacts + source artifacts
  -> EvidenceGraph + OutcomeGraph + Contract + Plan
  -> project run bindings
  -> executeCommerceProduction
       -> localized copy x3
       -> main image -> QA
       -> detail images x5 -> QA
       -> product video -> playback promotion -> QA
       -> strategy
  -> strict Project result
  -> previews + retained-byte downloads + manifest
```

Benchmark builds its original commitment-bound inputs and enters the same executor after native source ingestion, then continues through rehearsal verification and evaluator completion.

## Compatibility

- Existing exported held-out types and functions remain available.
- Existing Commerce profile, role order, prompts, routes, receipt closure, and benchmark verifier remain unchanged.
- `CommerceProductionHost` is split conceptually into a core Provider host plus evaluator-only methods without changing the desktop implementation.
- CLI/MCP do not gain a Provider executor.

## Failure And Rollback

- Input and Provider preflight happen before any paid generation.
- A role failure stops subsequent roles and rejects the run; progress events already emitted remain available to the UI.
- Cancellation uses the existing `AbortSignal` path.
- The UI can fall back to Benchmark-only behavior by reverting the Project panel and project runner while leaving the shared executor used by held-out production.

## Trade-offs

- The MVP exports retained files through browser downloads instead of adding a native arbitrary-destination writer or a ZIP dependency.
- Local references override remote product image descriptors for the run. This avoids network fetches and makes product identity reproducible from user-selected bytes.
- Fixed locales and AliExpress policy remain profile-level constraints; channel/locale customization belongs in a later profile configuration task.
