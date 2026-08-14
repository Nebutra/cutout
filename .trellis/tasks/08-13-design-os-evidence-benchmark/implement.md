# Design OS evidence benchmark - implementation plan

## Order

- [x] Upgrade Commerce and Design OS benchmark identities to v2 and remove all
      simulated Host metric/evidence definitions from the scoring surface.
- [x] Remove the retired intermediate stage and remap the exact fourteen-metric ruler.
- [x] Regenerate both durable snapshots and update assertions/documentation to
      the real-only `5/14`, maturity `contract` baseline.
- [x] Define strict v2 stages, metric definitions, report derivation, decoding
      and same-ruler comparison under `src/design-os-benchmark/`.
- [x] Add the strict Commerce adapter and explicit production-rehearsal blocker.
- [x] Remove the unsound caller-authored trusted Commerce pass path; retain
      fail-closed behavior until the complete verification bundle exists.
- [x] Add focused derivation, drift, regression and hard-gate tests.
- [x] Generate and commit the current Design OS snapshot from the decoded
      Commerce baseline.
- [x] Add `pnpm benchmark:design-os` as an offline validator/renderer.
- [x] Update the executable benchmark spec and run the quality gate.
- [x] Add internal native pre-run commitment and fixed-trust-root Minisign
      verification commands without expanding CLI/MCP capabilities.
- [x] Add strict Commerce held-out manifest, chronology and admission binding;
      keep bundle-only fixtures at zero benchmark evidence.
- [x] Add the dedicated Design OS held-out create/decode path while the normal
      decoder remains fail-closed for a passing rehearsal audit.
- [x] Replace caller-named challenges with evaluator-signed pre-run challenge
      selection verified against the build-pinned key before commitment issue.
- [x] Carry the exact commitment hash through native source-ingest, Provider,
      semantic-QA and playback receipts without changing ordinary receipt
      requirements.
- [x] Require complete receipt commitment closure and re-verify both evaluator
      signatures during final held-out admission.
- [x] Add a durable native single-use challenge and receipt-slot replay ledger;
      reject alternate commitments, successful attempt cherry-picking and
      admission against any non-exact ledger closure.
- [x] Add rollback/retro-sign, expiry, missing receipt binding and identity-drift
      rejection tests, then rerun the complete quality gate.
- [x] Persist the exact signed native response before Keychain slot settlement,
      recover exact retries after IPC loss, and serialize cross-process ledger
      updates with an owner-only SQLite transaction.
- [x] Add the real `qwen3-vl-plus` vision-JSON route and retain capability-probe
      evidence separately from benchmark evidence.
- [x] Implement the held-out Commerce production runner with commitment-before
      execution, exact DAG references, semantic QA, playback promotion,
      strategy closure and pending evaluator completion.
- [x] Add pure no-mock runner contract tests for preflight, DAG ordering,
      metadata and receipt closure; keep their score contribution at zero.
- [x] Propagate cancellation through source ingestion using a separate native
      cancellation UUID and deterministic receipt request id.
- [x] Add strict evaluator input/package, pending and admitted-evidence decoders;
      reject manifest, challenge, bundle and completion drift before admission.
- [x] Add the lazy Commerce production operator surface with real runner,
      replay-recovery, pending export, completion import and native admission.
- [x] Add the external Minisign evaluator CLI with key-info, challenge, explicit
      review and completion commands while keeping its private key out of Cutout.
- [x] Add an offline evaluator `prepare` command that converts the three raw
      competition JSON files through real bounded Commerce ingestion, selects
      the immutable identity anchor and contributes no benchmark score.
- [x] Add an evaluator `inspect` command that materializes the exact pending
      source, Provider, delivery, semantic-QA and video bytes into a new private
      review directory, rejects receipt drift and contributes no benchmark score.
- [x] Upgrade the evaluator challenge, commitment, completion and admission to
      explicit v2 protocols; bind one package/Cargo Host build version through
      both signatures and native admission, and reject legacy or drifted values.

## Validation

- [x] `pnpm vitest run src/design-os-benchmark src/commerce-profile/benchmark.test.ts`
- [x] `pnpm exec tsc -b --pretty false`
- [x] `pnpm lint`
- [x] `pnpm benchmark:design-os`
- [x] `pnpm agent:validate`
- [x] `rtk git diff --check`

## Risk And Rollback

The work touches an already modified Commerce benchmark. Preserve all unrelated
changes and edit only the trusted pass additions shown in its focused diff.
Snapshot generation must be deterministic and must not rewrite evidence owned
by Commerce. No manifest capability changes are allowed.
