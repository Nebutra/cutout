# Research: Image Model Eligibility And Edit Adapter Support

- Query: Determine the smallest truthful eligibility contract for generic image generation/editing across providers, while keeping high-fidelity model recommendations separate from authorization.
- Scope: mixed
- Date: 2026-08-03

## Findings

### Superseding correction

This document supersedes the earlier recommendation to hard-gate prototype image
work to `gpt-image-2` and `Qwen-Image-3.0`. Those names may be
`high-fidelity-recommended` routing preferences, but they are not authorization
boundaries. A model that has real image capability and an executable adapter
must not become ineligible merely because it is absent from a quality allowlist.

The two independent decisions are:

- `supported`: the exact enabled provider/model route has `observed` or
  `verified` evidence for every required capability, and Cutout has an
  executable adapter strategy for that capability on the route.
- `high-fidelity-recommended`: quality/preference metadata used to rank or
  explain supported routes. It must never add or remove support, change the
  exact transport model id, or bypass capability evidence.

For image editing, the executable invariant is:

```text
supported(route, image-edit) =
  enabled exact provider/model assignment
  AND exact ModelDescriptor includes image-edit
  AND image-edit evidence is observed or verified
  AND an executable edit adapter strategy matches the route
```

Provider kind, model-name regexes, authenticated catalog presence, and a
recommendation tier are each insufficient on their own.

### Existing capability evidence and routing

- `src/services/ai/model-capabilities.ts:4-8` already owns the exact model
  capability/evidence schema. Evidence distinguishes `declared`, `observed`,
  and `verified`, so no new evidence-strength vocabulary is needed.
- `src/agent-runtime/capability-task-router.ts:5` is the strongest current
  evidence-aware router. It requires `observed` or `verified` evidence for every
  required capability and rejects declaration-only descriptors.
- `src/services/ai/model-catalog-http.ts:15-20` treats provider catalog rows as
  capability-empty and remote catalog claims as `declared`. This is correctly
  conservative: listing a model does not prove an edit call works.
- `src/agent-runtime/capability-router.ts:34-48` has quality/cost/speed scoring,
  but its separate runtime descriptor shape has no evidence strength. Its
  eligibility check trusts capability arrays.
- `src/agent-runtime/composer-execution.ts:138-139` synthesizes those capability
  arrays from provider kind and assigns them to every configured model. This
  overclaims exact-model capability even when a provider has both image and
  non-image models.
- `src/services/ai/provider-registry.ts:14-18` describes capabilities of a
  provider adapter implementation. These static capabilities cannot substitute
  for exact model evidence.
- `src/services/ai/provider-adapter-registry.ts:18-43` constructs generic AI SDK
  language models by provider kind/protocol. It does not represent image-edit
  execution strategy, input-image handling, or provider-specific response
  parsing.

The smallest coherent change is to make one route assessment owner intersect
the existing exact `ModelDescriptor` evidence with an edit adapter registry.
Existing provider adapter metadata may be an input, but must not be treated as
model evidence.

### Current capability projection is still too broad

- `src/control-protocol/paid-tool-contract.ts:138-158` now checks that the image
  assignment's provider is enabled and uses `supportsOpenAIImageEndpoints`
  before advertising `edit-image`. This is narrower than advertising edit for
  every image assignment, but it still advertises generation for every enabled
  assignment and edit for every model under a matching provider kind/protocol.
  It does not consult exact model evidence or an edit strategy assessment.
- `src/services/desktop-tool-executor.ts:128-149` correctly enforces exact
  advertised capability/provider/model matching, provider availability, and a
  credential. However, it trusts the upstream capability projection; it does
  not independently establish model evidence or adapter executability.
- `src/services/desktop-tool-executor.ts:239-259` has only two image branches:
  `generate-image` calls `GenerationService.generateImages`, while `edit-image`
  always calls `GenerationService.editImage`. This prevents a non-OpenAI edit
  strategy from being expressed today.

Desktop paid capability projection therefore must be the intersection of:

1. enabled provider;
2. exact assigned provider/model;
3. required capability with `observed` or `verified` model evidence; and
4. an executable adapter strategy for that exact capability and route.

Failure of any term must omit the capability and surface
`capability-required` before approval or a paid provider call.

### Executable adapter strategies

The adapter layer needs a small closed strategy discriminator rather than a
larger provider-kind allowlist:

- `openai-images-edits`: call `GenerationService.editImage`. The current
  implementation posts multipart references to `/images/edits`.
- `multimodal-generate`: call `GenerationService.generateImages` with the edit
  instruction as `system` plus a text input part and every source/reference as
  an image input part. This represents reference-conditioned output from
  language/image models whose API returns images from a multimodal generation
  call.
- Provider-native strategies, such as a future `dashscope-image-edit`, only
  after their request, authentication, response, cancellation, and tests exist.

The adapter assessment must be exact enough to reject unsupported
provider/protocol/model combinations. Do not infer a strategy from a model-name
regex, and do not broaden `supportsOpenAIImageEndpoints` to unlock another
provider's unrelated API.

When edit was requested, the executor must never silently fall back to
unconditioned generation. A route with generation but no executable editing is
supported for `image-generation` and unsupported for `image-edit`.

### Existing transport evidence

Current non-OpenAI status:

| Route | Reference-conditioned image output in current code | Generic desktop `edit-image` today | Required status |
| --- | --- | --- | --- |
| Google/Gemini image model | Executable at existing direct `generateImages` multimodal call sites when the exact model actually returns image files | Not executable; desktop edit dispatch always calls the OpenAI-only `editImage` service | `adapter-required` for generic edit until `multimodal-generate` is wired and tested with exact observed/verified evidence |
| DashScope/Qwen image or edit model | Not executable through the built-in compatible-mode adapter | Not executable | `adapter-required` until a native DashScope generation/edit strategy exists |
| Other non-OpenAI provider/model | No generic edit execution path was found | Not executable unless a provider-specific strategy is added | `adapter-required` plus exact observed/verified evidence |

Thus, no non-OpenAI route is currently truthful as the generic desktop
`edit-image` capability. Google/Gemini is the only inspected non-OpenAI family
with a proven reusable reference-conditioned execution path already present in
product code; the missing work is shared route assessment and desktop strategy
dispatch, not a new low-level multimodal generation primitive.

#### OpenAI, OpenAI-compatible, and CC Switch

- `src/services/ai/generation-service.local.ts:1002-1047` implements only the
  OpenAI-shaped edit path and rejects other kinds/protocols.
- `src-tauri/src/commands/ai/image_edit.rs:36-39` repeats the reviewed provider
  matrix, and `src-tauri/src/commands/ai/image_edit.rs:127-199` posts multipart
  data to `/images/edits` with native credential and network enforcement.
- `src/services/ai/generation-service.local.test.ts:615-642` proves CC Switch
  reference conditioning reaches the native edit command.

These providers have an executable `openai-images-edits` transport today.
They are not automatically supported for every exact model: model-level
`image-edit` evidence is still required. A compatible relay also requires an
exact verified/observed route rather than an assumption that all catalog models
implement `/images/edits`.

#### Google and Gemini image models

- `src/services/ai/generation-service.local.ts:974-995` already sends prepared
  multimodal input through the AI SDK and converts `result.files` image outputs
  to Cutout assets.
- `src/hooks/queries/pipeline.ts:220-260` already uses `generateImages` for
  non-OpenAI reference-conditioned deconstruction, including the mockup and
  additional reference images.
- `src/prototype/region-deconstruct.ts:325-355` and
  `src/prototype/region-deconstruct.ts:389-410` already pass `system`, a text
  part, the source image, and all reference images for text-free variants and
  region boards.
- Installed `@ai-sdk/google@3.0.88` exposes Google image models and the language
  model path used by Cutout can return image files.

Google/Gemini therefore has a reusable implementation basis for
`multimodal-generate`; it does not have a `GenerationService.editImage` adapter
today. Support still requires exact `image-edit` evidence for the selected
model plus a tested desktop strategy that preserves every input artifact.

#### DashScope and Qwen

- `src/services/ai/provider-registry.ts:11` configures DashScope at
  `compatible-mode/v1`, and `src/services/ai/provider-registry.ts:14-18` does not
  declare image generation/edit for its current adapter.
- `src/services/ai/provider-adapter-registry.ts:94-125` includes DashScope among
  generic OpenAI-compatible language-model constructors. That does not make the
  native Qwen image API executable.
- Alibaba's official Qwen-Image API documentation states that Qwen-Image uses
  the native DashScope API and does not support OpenAI-compatible mode. It uses
  `/api/v1/services/aigc/multimodal-generation/generation`; image editing is a
  separate Qwen-Image Editing API/model family.

No truthful built-in DashScope/Qwen generation or edit adapter exists in this
snapshot. A high-quality Qwen model may be recommended, but it remains
`adapter required` until a native strategy is implemented and its exact model
capability is observed or verified. Do not add DashScope to the OpenAI image
endpoint predicate or claim native support through compatible mode.

#### Other providers

All other routes are unsupported for editing unless both exact evidence and an
executable adapter strategy exist. Provider brand and a generic language-model
adapter are not sufficient.

### Recommendation metadata

`gpt-image-2` and benchmarked high-quality Qwen models may receive a
`high-fidelity-recommended` tier or quality score. The existing scoring shape at
`src/agent-runtime/capability-router.ts:34-50` demonstrates where quality can
order already eligible candidates, but support must be resolved first from the
evidence/adapter intersection.

Recommendation behavior must satisfy these invariants:

- It changes ordering or user guidance only.
- It cannot make an unsupported route supported.
- It cannot make a supported non-recommended route unsupported.
- It cannot replace, lowercase, normalize, or alias the exact verified model id
  sent to the provider.
- Automatic setup should prefer a recommended supported route, then fall back
  to another supported route without labeling it unsupported.

### Required tests

- Route assessment rejects a descriptor with verified/observed `image-edit`
  evidence when no matching adapter strategy exists.
- Route assessment rejects a matching adapter when exact model evidence is
  absent or only `declared`.
- Route assessment rejects disabled providers and provider/model mismatches.
- Route assessment accepts an exact OpenAI-style model with observed/verified
  edit evidence and `openai-images-edits`.
- Route assessment accepts an exact Google image model with observed/verified
  edit evidence and `multimodal-generate`.
- Capability projection advertises only the assessed executable capabilities;
  it does not grant all models the provider's static capability list.
- Extend `src/services/desktop-tool-executor.test.ts:154-166` and
  `src/services/desktop-tool-executor.test.ts:203-213` to assert the OpenAI
  strategy calls `editImage`, while the multimodal strategy calls
  `generateImages` with `system`, one text part, and every image part.
- Assert an edit request never falls back to prompt-only/unconditioned
  generation and never reaches approval or provider execution without a
  strategy.
- Extend `src/agent-runtime/capability-task-router.test.ts:1-3` with
  `image-edit` evidence-strength cases, including rejection of `declared`.
- Keep DashScope/Qwen at `capability-required` until a native adapter is
  implemented; then test the real native request and response contract.
- Recommendation tests prove that raising the high-fidelity score changes
  ordering only and never changes the supported set.
- Automatic setup tests prove a recommended supported route wins, while a
  supported non-recommended route remains a valid fallback.

### Files found

- `.trellis/tasks/08-03-converge-prototype-quality-throughput/prd.md` - Defines evidence-plus-adapter support and independent fidelity recommendation as the task requirement.
- `.trellis/tasks/08-03-converge-prototype-quality-throughput/design.md` - Assigns one shared route assessment owner to capability and adapter intersection.
- `.trellis/spec/frontend/prototype-generation.md` - Governs reference-conditioned page generation, quality evidence, retries, and paid-call accounting.
- `.trellis/spec/frontend/byok-provider-protocols.md` - Governs provider/wire protocol truth, catalog verification, and automatic setup claims.
- `.trellis/spec/frontend/agent-control-safety.md` - Requires provider effects to fail closed with `capability-required` rather than hidden fallback.
- `.trellis/spec/frontend/paid-tool-prompt-contract.md` - Governs image generation/edit approval requests and execution prompts.
- `src/services/ai/model-capabilities.ts` - Exact capability and evidence-strength schema.
- `src/services/ai/model-catalog-http.ts` - Conservative provider and remote-catalog descriptor ingestion.
- `src/agent-runtime/capability-task-router.ts` - Existing observed/verified evidence gate.
- `src/agent-runtime/capability-router.ts` - Existing quality scoring over capability candidates.
- `src/agent-runtime/composer-execution.ts` - Provider-kind-derived runtime descriptors that currently overclaim exact model capability.
- `src/services/ai/provider-registry.ts` - Static provider adapter definitions and current DashScope compatible-mode endpoint.
- `src/services/ai/provider-adapter-registry.ts` - Generic language-model construction registry, not an image-edit strategy registry.
- `src/services/ai/generation-service.local.ts` - OpenAI edit transport and reusable multimodal image-output generation path.
- `src-tauri/src/commands/ai/image_edit.rs` - Native OpenAI multipart edit implementation.
- `src/control-protocol/paid-tool-contract.ts` - Desktop capability projection that still lacks exact model evidence.
- `src/services/desktop-tool-executor.ts` - Exact route enforcement and current two-branch image dispatch.
- `src/hooks/queries/pipeline.ts` - Existing non-OpenAI reference-conditioned multimodal generation caller.
- `src/prototype/region-deconstruct.ts` - Existing system/text/all-image input construction for reference-conditioned output.
- `src/services/desktop-tool-executor.test.ts` - Primary executor extension points for strategy dispatch.
- `src/agent-runtime/capability-task-router.test.ts` - Primary evidence-strength routing test extension point.

### External references

- Alibaba Cloud Model Studio, "Qwen-Image API reference," accessed 2026-08-03: https://www.alibabacloud.com/help/en/model-studio/qwen-image-api
  - Documents native DashScope image endpoints and states Qwen-Image does not support OpenAI-compatible mode.
  - Lists current high-quality API ids including `qwen-image-2.0-pro`; it does not document `Qwen-Image-3.0` on the accessed page.
  - Directs editing to the separate Qwen-Image Editing API/model family.
- `@ai-sdk/google@3.0.88`, installed package API: exposes Google image model construction; Cutout's current language-model generation path consumes returned image files.

### Related specs

- `.trellis/spec/frontend/prototype-generation.md:125-140` - Every page receives shared visual identity references and final Design System context.
- `.trellis/spec/frontend/prototype-generation.md:174-178` - Planned image calls and actual Provider calls must match exactly.
- `.trellis/spec/frontend/byok-provider-protocols.md:315-329` - Provider identity/catalog data is not sufficient execution evidence.
- `.trellis/spec/frontend/byok-provider-protocols.md:467-480` - Catalog nomination, automatic image preference, and real image usability claims are distinct.
- `.trellis/spec/frontend/agent-control-safety.md:75-78` - Missing provider/effect capability must fail explicitly and must not fall through.
- `.trellis/spec/frontend/paid-tool-prompt-contract.md:26-47` - Paid image generation/edit requests retain distinct audit and execution payloads.

## Caveats / Not Found

- No shared edit adapter-strategy registry exists in the inspected snapshot.
  The current generation adapter registry constructs language models and cannot
  truthfully answer whether reference-conditioned image output is executable.
- No current schema field directly names `high-fidelity-recommended` on the
  evidence-backed `ModelDescriptor`. The recommendation representation is a
  design choice, but it must remain independent from capability/evidence.
- The codebase has two different `ModelDescriptor` shapes:
  `src/services/ai/model-capabilities.ts:8` owns evidence, while
  `src/agent-runtime/capability-router.ts:6-18` owns quality/cost/speed. A shared
  assessment must reconcile them or consume both without silently dropping
  evidence.
- Official Alibaba documentation accessed on 2026-08-03 does not list
  `Qwen-Image-3.0`. Do not guess a canonical id or treat a marketing name as an
  executable route. Preserve the exact authenticated model id and attach
  recommendation metadata only after the route exists.
- A successful catalog lookup proves availability, not output quality or edit
  transport. `observed` evidence should come from a real successful execution
  path; `verified` evidence needs an authoritative source appropriate to the
  exact model and capability.
- No product source, spec, task metadata, or git state was changed. Only this
  research file was replaced.
