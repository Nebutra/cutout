# Converge remaining production debt - technical design

## Architecture boundaries

The desktop orchestrator owns planning and production. `.cutout` Design IR,
durable run events, content-addressed objects and provenance remain authoritative.
Provider secrets remain native-owned and every remote call crosses the existing
Rust origin/auth/cancellation boundary. The release workflow remains the only
authority that can publish artifacts.

The task has four dependent workstreams:

1. make image transport capability exact and executable;
2. prove the packaged asset-production outcome with a real Provider;
3. remove known drift and internal compatibility code;
4. release only the verified result.

## Image route model

Support remains a conjunction:

```text
enabled exact assignment
AND observed/verified exact-model capability
AND executable typed transport strategy
```

Use a closed image strategy registry shared by route assessment, paid capability
projection and desktop execution. A strategy declares generation/edit support,
request owner, reference-input form, response form and cancellation owner. It is
not a provider capability list and it cannot create model evidence.

The initial strategies are:

- `openai-images-generations` and `openai-images-edits`: existing native reviewed
  `/images/*` bridge.
- `google-multimodal-generate`: existing GenerateContent image-output path used
  for both unconditioned generation and reference-conditioned editing when exact
  model evidence permits it.
- `xai-images-generations` and `xai-images-edits`: first-party xAI JSON image
  endpoints with bounded data-URI references and inline base64 output; they are
  intentionally separate from OpenAI multipart editing.
- explicit native DashScope sync/async image generation/edit strategies backed by
  the documented service endpoints. Compatible-mode remains text-only.

No generic “reviewed adapter” discriminator exists. An unknown combination is
`adapter-required` before approval and spend.

Transport capability and prototype-task fitness are separate gates. The generic
image surface continues to accept any exact route that satisfies the transport
conjunction. The full UI/UX prototype surface then admits only reviewed
`gpt-image-2`, `qwen-image-3.0`, and `qwen-image-3.0-pro` routes. Health-based
fallback may move between those task-fit routes, but never to GPT Image 1/1.5
or another generically executable edit model.

Prototype recommendation is also objective-specific after capability and
task-fitness are proven. Normal Design System, page and reusable-material work
uses the `configured` objective: the user's exact verified binding remains first
and the health registry demotes pressured or open routes before spend. A
semantic QA repair uses the `refinement` objective and ranks reviewed fidelity
routes ahead of faster alternatives. The packaged Qwen throughput experiment
binds `qwen-image-3.0` in its isolated Provider fixture; Qwen ordering is not a
global product policy and no recommendation can manufacture capability evidence.

## Native DashScope boundary

The Rust owner resolves the persisted provider id, keychain secret, exact kind,
base origin and native image endpoint. It assembles bearer authentication, sends
bounded JSON, handles async task polling with the shared cancellation signal and
downloads the returned image only from reviewed provider result origins. Response
bodies and image bytes have explicit caps; redirects and private/reserved origins
remain rejected.

The frontend sends model id, prompt, normalized reference bytes/media types and
generation parameters, never a key or arbitrary endpoint. Rust returns normalized
image bytes/media type or a sanitized typed failure. Retry only transient network,
408, 429 and 5xx conditions; terminal provider/schema/capability errors do not
retry.

## Google edit dispatch

Reuse `GenerationService.generateImages` rather than inventing a second Google
transport. The edit executor supplies one system instruction, one text part and
all locked input/reference images. A missing image output is a terminal edit
failure. The executor must not retry through OpenAI edit or prompt-only generation.

## Packaged evidence run

Add a background packaged-run harness that drives the same desktop surface and
native commands as the app. It may use a dedicated signed/release-equivalent E2E
mode for deterministic lifecycle control, but it cannot bypass credential
discovery, planning, paid-tool routing, artifact storage, slicing or delivery.

The scenario supplies intent, not output counts. Completeness compares the final
delivery manifest to the persisted Agent plan. Evidence is written to a controlled
task output directory and redacted before retention. Stage timings distinguish
planning, design variants, route generation, deconstruction/slicing, quality and
packaging so performance failures have an owner.

Intent-driven planning defaults to the existing progressive graph: a bounded
route outline streams first, Design System foundation and exploration follow,
route pages expand with concurrency three, and closure validates the merge.
Only an explicitly bounded one-to-three-page request may use the monolithic
structured plan. The absence of a page count is not a small-scope signal. Every
closed pipeline and Planner stage is persisted through the packaged native
checkpoint command, and all Planner deadline failures retain the shared
`planner-timeout` diagnostic in renderer, native result, and external evidence.

## Contract cleanup

`standards-contracts.ts` is the single governance report authority. Remove the
duplicate report/finding schema from `contracts.ts` and update any public exports.

Updater generation accepts one explicit ordered platform collection. Remove the
single-primary input fallback and redundant top-level primary artifact metadata;
keep `latest.json.platforms`, signatures and all fields actually consumed by the
shipping Tauri updater. Fixture tests include a `0.1.19`-shaped client read to
prove forward OTA remains valid.

Documentation counts Agent operations from the validated manifest or states the
current exact value. Motion documentation describes implemented Motion IR while
separately listing the missing timeline/authoring UX.

## Security and release

JavaScript alerts close by publishing the already-patched lockfile. Rust advisory
validation records all findings; the GTK `glib` advisory remains an explicit
upstream exception until a coherent ABI-family upgrade exists. It is never
silenced by a partial override.

After all gates pass, synchronize the next patch version, release notes and
manifests, push `main`, tag the exact commit, and let `release-update.yml` build
and attest all platforms. Installation consumes a downloaded, verified release
artifact; it does not substitute a local unsigned build.

## Rollback

- Provider strategies land separately from release/version commits and can be
  reverted without changing stored projects.
- Native DashScope support stays capability-gated until contract and live proof
  pass; failure leaves it truthfully `adapter-required`.
- Governance/updater cleanup is protected by consumer fixtures and can be
  reverted independently.
- A release tag is created only after immutable source validation; failed native
  builds remain unpublished drafts and do not replace `0.1.19` locally.
