# Cutout v0.1.19 — product review brief

2026-08-05 · branch `release/v0.1.19-rc` · base `6f02c5a` (v0.1.18) · **not published**

---

## The one-line answer

The release candidate is **built, signed and green on every automated gate**. Two
things are proven against real models for the first time; two are blocked, and
neither block is in Cutout's code.

## What changed in 0.1.19

Four threads of work were sitting uncommitted. All are now committed as separate
reviewable commits.

1. **Codex runtime and Provider readiness.** Version pin replaced by a negotiated
   floor plus generated-schema feature negotiation; a closed failure taxonomy
   (`upstream-unavailable` / `model-output-invalid` / `runtime-failed`) so a
   generic terminal error no longer erases the cause; CC Switch discovery extended
   to a bounded failover queue; the 39-Agent local inventory removed with a
   negative regression test keeping it removed.
2. **Planning progress disclosure.** One opaque `step:prepare` split into four
   named phases inside a compact `<details>`.
3. **Money removed from the paid-tool authority model.** Authorization now depends
   only on capability, host policy and explicit approval. A cost *estimate* can no
   longer approve or refuse work — which is what
   `docs/HEADLESS_AGENT_CONTROL.md:172-186` required all along.
4. **Governance repair.** The backlog went from 34 "active" tasks to 4 genuinely
   open ones.

## Evidence

| Gate | Result |
|---|---|
| `tsc -b` · `oxlint` · `cargo check --all-targets` | clean |
| `vitest run` | 2038 passed / 0 failed (pre-change baseline; re-verified on branch) |
| `playwright test` — full suite, 32 specs × 2 projects | **129 passed, 5 skipped, 0 failed** (6.0 min) |
| `agent:validate` | 20 ops · 36 MCP tools · 20 skills · 9 workflow tools |
| `validate-release-version` | 0.1.19 synchronized across all five sites |
| `release-notes:validate --require-all-locales` | passes, 5 locales |
| Signed packaged build | Developer ID `2L5YC85FQ7`, valid on disk, satisfies Designated Requirement |

## Proven for the first time — against real models

Full detail in [`real-model-e2e-2026-08-05.md`](./real-model-e2e-2026-08-05.md).

- **Real image bytes.** `generateImages` and `editImage` (垫图) both return real
  PNG data from the gateway. This is the product's most load-bearing capability.
- **Human-in-the-loop.** A real clarifying question renders in the real
  `IntentWorkspace`, keeps the composer enabled, and resolves on answer (9.0s).
- **Region-primed naming.** Correct structured names with intact manifest
  lineage: `hero-submit-button`, `hero-search-icon`, `hero-user-avatar`.
- **Tool-gate classification, 6 of 7 cases** routed correctly.
- **The planner plans.** The main pipeline E2E, run twice, had the real model
  produce a real 2-page prototype plan with `runError=none`, then advanced into
  design-system generation. It did not finish inside the test's own 14-minute
  budget (`prototype-pipeline.e2e.test.tsx:274`), identically both times.
  Whether that stage is genuinely slow or stalled is the single most useful
  thing to measure next — `runError=none` separates "failed" from "still
  working", but not "working" from "hung".

## The finding that matters most

**The gated "proof" suites had rotted.** Five of seven could not reach a model at
all — they failed in seconds on two harness defects (a missing `wireProtocol` on
a `ProviderConfig`, and a mock missing three capability-binding exports). Both
pre-date this branch.

They rotted precisely *because* they were gated. The env-flag gate that protects
the budget also removes every signal that the suite still works. A test that
calls itself "the definitive proof" was non-functional and nothing said so.

**Recommendation:** a scheduled (nightly or weekly, not per-PR) workflow running
these against a protected environment. The per-PR cost argument is sound; the
cost of *never* running them was two silent breaks and an unmeasured product
claim.

## Open items — two need a human decision

1. **Hardcoded operator IP in a public binary.**
   `src-tauri/src/commands/ai/ai_proxy.rs:325-337` pins `81.70.152.201` for
   `aigw.mox.ktvsky.com` to defeat a split-DNS answer from a managed macOS
   profile. Related: fixed provider endpoints at `provider_discovery.rs:1229-1252`
   and `REVIEWED_CC_SWITCH_BASE_URL = "http://127.0.0.1:15721/v1"`. All are
   deliberate and documented (`byok-provider-protocols.md:296-308`), but this is
   one operator's infrastructure inside an Apache-2.0 binary published to
   `Nebutra/cutout`. Keep / feature-gate / strip from public builds?
   *Deliberately not changed here — it alters product network behaviour.*

2. **The burned `v0.1.16` tag.** Tag exists at `02ecac7`; no release was ever
   published (`gh release list` goes .15 → .17). Its successor's PRD says the tag
   will not be reused. `08-03-publish-install-v0-1-16` is left open for a
   deliberate close-out.

3. **Rotate `MOX_API_KEY`.** It was printed in plaintext into a session
   transcript by a malformed check command during this work.

## Blocked, not broken

- **Planner vs. real gateway.** `prototype-planner` fails with three consecutive
  HTTP 502 `upstream_error` from `aigw.mox.ktvsky.com/v1/responses`. Cutout's own
  behaviour is correct: bounded retries, then a structured error rather than a
  hang. Infrastructure, not product code.
- **Packaged turn execution.** The signed packaged app really launched Codex
  v0.146.0 and recorded
  `{"execution":"failed","lastFailure":"runtime-failed"}`. This is the gate
  working as designed: `conversationBinding` and `turnExecution` correctly remain
  `false` behind `packaged-turn-execution-proof-required`. **The manifest is
  truthful.** Cutout is not claiming a capability it has not proven.

## What shipping looks like from here

Everything the release checklist automates is green. What remains is the manual
column: the packaged-app launch drill, the data-recovery drill on a disposable
profile, a clean-machine Gatekeeper check, and the `release` environment's
independent reviewer — which `docs/RELEASE_CHECKLIST.md:58` itself records as not
yet satisfied.

Publishing was deliberately not attempted. No tag, no GitHub release.
