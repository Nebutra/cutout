# Research: Qwen Image 3 native DashScope contract

- Query: Determine the exact official Aliyun Bailian/DashScope model IDs and
  native API contracts for the faster and higher-quality Qwen Image 3 routes,
  and decide whether Cutout's current native DashScope transport can execute
  them without code changes.
- Scope: mixed
- Date: 2026-08-06

## Findings

### Decision

The official model IDs are:

| Product role | Exact model ID | Official capability |
| --- | --- | --- |
| Faster / balanced | `qwen-image-3.0` | T2I generation and I2I/image editing |
| Higher quality / precise | `qwen-image-3.0-pro` | T2I generation and I2I/image editing |

The user's shorthand `image-3` and `image-3-pro` must not be sent as model IDs.
`Qwen-Image-3.0` is also not the exact API spelling; persisted assignments and
requests should preserve the lowercase IDs above.

Cutout cannot yet truthfully claim either route as executable without code
changes. The core JSON request shape and synchronous response parser are
compatible, but the normal capability-evidence path does not recognize either
exact ID, the Rust command unconditionally opts into asynchronous execution
that the Qwen Image 3 reference does not document, and its validation and
regional endpoint binding do not match the official contract.

### Official evidence

The current Chinese Qwen Image 3 API reference was created 2026-07-20 and last
modified 2026-08-05. It explicitly lists both `qwen-image-3.0-pro` and
`qwen-image-3.0`, and says both support T2I and I2I/image editing. I2I accepts
1-3 reference images combined with one text instruction. The current Model
Studio image guide, also modified 2026-08-05, describes `qwen-image-3.0` as the
same scenario class with faster generation and `qwen-image-3.0-pro` as the
higher-quality model for complex layouts, small text, and multilingual fonts.

Region availability is not identical in the official documentation:

- The China/Beijing reference lists both exact IDs.
- The English/international reference, last updated 2026-07-20, lists only
  `qwen-image-3.0-pro`, says it is in limited preview, and requires Model Gallery
  access. It does not document `qwen-image-3.0` as currently available.
- Therefore `qwen-image-3.0` must not be claimed for Singapore based only on the
  Beijing page. `qwen-image-3.0-pro` in Singapore also requires entitlement;
  catalog presence alone cannot substitute for that access requirement.

The documented native HTTP contract is:

- Method/path: `POST /api/v1/services/aigc/multimodal-generation/generation`.
- Recommended Beijing origin:
  `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com`.
- Recommended Singapore origin:
  `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`.
- Authentication: `Authorization: Bearer <regional API key>` and
  `Content-Type: application/json`. Beijing and Singapore API keys/endpoints
  cannot be mixed.
- The same reference says the legacy Beijing `https://dashscope.aliyuncs.com`
  and Singapore `https://dashscope-intl.aliyuncs.com` domains remain functional,
  although workspace-specific domains are recommended.
- T2I body: exact `model`; `input.messages` with exactly one user message whose
  `content` contains exactly one `{ "text": "..." }` part.
- I2I/edit body: the same endpoint and model; the single user message contains
  1-3 ordered `{ "image": "..." }` parts and one `{ "text": "..." }` part.
  Images may be public HTTP(S) URLs or `data:{MIME};base64,...` values.
- Accepted reference formats: JPG/JPEG, PNG, BMP, TIFF, WebP, GIF. Each input is
  at most 10 MB; recommended width and height are each 384-2048 pixels.
- `parameters.n`: 1-6, default 1.
- `parameters.size`: `width*height`; T2I and I2I pixel area must be between
  `512*512` and `2048*2048`, with aspect ratio 1:8 through 8:1 in the current
  Chinese reference. When omitted, the model selects a resolution.
- Optional parameters include `prompt_extend` (default `true`),
  `prompt_extend_mode` (default `direct`), `negative_prompt`, `seed`
  (`0..2147483647`), and `watermark` (default `false`).
- Success is synchronous JSON:
  `output.choices[].message.content[].image`, with PNG URL results. Usage reports
  dimensions and input/output counts. Result URLs are valid for 24 hours.

On execution mode, official evidence establishes synchronous support. The
dedicated Qwen Image 3 reference contains no `X-DashScope-Async`, `task_id`,
`task_status`, polling, or cancellation contract. The general text-to-image
guide says Qwen Image 3.0 and 2.0 series support synchronous calls, while it
specifically names `qwen-image-plus` and `qwen-image` for asynchronous calls.
The conservative inference is to treat Image 3 as sync-only until Aliyun
documents async behavior; an unconditional async header is outside the reviewed
contract.

### Current Cutout behavior

The compatible pieces are:

- The native request endpoint path and legacy Beijing origin match an official
  still-functional endpoint (`src-tauri/src/commands/ai/dashscope_image.rs:25-28`).
- The body builder emits the required single user message, ordered image parts,
  one text part, `n: 1`, `prompt_extend: true`, and `watermark: false`
  (`src-tauri/src/commands/ai/dashscope_image.rs:210-238`).
- The synchronous parser already extracts
  `output.choices[].message.content[].image`
  (`src-tauri/src/commands/ai/dashscope_image.rs:372-434`).
- Frontend generation and edit dispatch already preserve the exact selected
  model ID and route to `ai_dashscope_image`
  (`src/services/ai/generation-service.local.ts:916-951` and
  `src/services/ai/generation-service.local.ts:1066-1078`).
- Immediate result download is compatible with the official 24-hour URL and
  validates HTTPS, DNS, content type, image magic, and byte bounds
  (`src-tauri/src/commands/ai/dashscope_image.rs:437-501`).

The blocking or incomplete pieces are:

1. The reviewed exact-model capability map ends at Qwen Image 2.x/Max/Plus and
   contains neither Image 3 ID (`src/services/ai/image-route-assessment.ts:79-154`).
   Consequently authenticated catalog projection returns no generation or edit
   evidence for either new model (`src/services/ai/image-route-assessment.ts:297-325`).
2. The test at `src/services/ai/image-route-assessment.test.ts:139-156`
   explicitly expects `Qwen-Image-3.0` to be ignored by reviewed catalog
   projection. A later test injects a fabricated verified descriptor for that
   marketing-style spelling and therefore proves only adapter selection, not a
   real executable route (`src/services/ai/image-route-assessment.test.ts:241-260`).
3. Every native submission uses `auth_headers(&secret, true)`, which sends
   `X-DashScope-Async: enable`
   (`src-tauri/src/commands/ai/dashscope_image.rs:241-250` and
   `src-tauri/src/commands/ai/dashscope_image.rs:517-542`). This is not part of
   the reviewed Image 3 contract.
4. Edit validation allows up to 32 references and 20 MB per image, rather than
   the documented 1-3 and 10 MB (`src-tauri/src/commands/ai/dashscope_image.rs:29-35`
   and `src-tauri/src/commands/ai/dashscope_image.rs:148-190`). It can therefore
   approve and submit requests the exact models reject.
5. Size validation accepts any positive width/height up to 4096 independently.
   It does not enforce documented pixel-area or 1:8-8:1 aspect constraints
   (`src-tauri/src/commands/ai/dashscope_image.rs:194-208`).
6. Input media detection accepts PNG, JPEG, and WebP only, not the documented
   BMP, TIFF, and GIF formats (`src-tauri/src/commands/ai/dashscope_image.rs:505-515`).
   A deliberately narrower product subset is safe only if documented and tested.
7. Native transport and route assessment accept only the legacy Beijing
   compatible-mode provider binding and hardcode the legacy Beijing image/task
   origins (`src/services/ai/image-route-assessment.ts:422-431` and
   `src-tauri/src/commands/ai/dashscope_image.rs:25-28,123-145`). They cannot
   execute a Singapore key or a recommended workspace-specific endpoint.
8. The static DashScope adapter advertises only text/vision/reasoning/tools,
   leaving its image-generation/edit metadata out of sync with the now-native
   strategies (`src/services/ai/provider-registry.ts:14-18`).

### Approved live benchmark

An approved Beijing DashScope credential already present in the local Bailian
credential store was used on 2026-08-06 after upgrading `bl` and its skills from
1.14.0 to 1.14.1. The credential remained masked and no secret, authorization
header, or temporary signed result URL was retained here.

All three calls used the documented synchronous contract and produced real PNG
bytes at exactly 1536x1024:

| Operation | Model | Wall time | Bytes | SHA-256 |
| --- | --- | ---: | ---: | --- |
| Generate | `qwen-image-3.0` | 112.62 s | 973 KiB | `21f2ac33f432345ebd622fa9b18fafabd9dbc17de30746a57c5abe965c7d7102` |
| Generate | `qwen-image-3.0-pro` | 90.26 s | 1.0 MiB | `66c9cf530bf659de78c163478756e370d196ae0a893a7f20eac9ac7e63b65f0f` |
| Edit, one reference | `qwen-image-3.0` | 59.44 s | 1.0 MiB | `bccd195a14719fad1ab098935c8b17958f9839281dd2cc56ee3f5bf9f29ee3b4` |

The same dense Chinese Cutout dashboard brief was used for both generation
models. The Pro output had materially stronger information hierarchy, smaller
text, embedded page previews, and route topology fidelity. This single sample
did not support a latency promise: Pro was 22.36 seconds faster than the standard
model despite its quality positioning.

The edit preserved the dashboard layout, changed the requested title, selected
Design System B, replaced the orange accent, and added the requested game-art
row. It rendered the requested `45%` value as `10%`. Therefore the route is
execution-proven for reference-conditioned editing, but provider success alone
is not high-fidelity acceptance. Cutout still needs OCR/semantic checks for
critical text, numeric values, and required edit constraints before publishing
an artifact as ready.

### Exact code, spec, and test gaps

- Add `qwen-image-3.0` and `qwen-image-3.0-pro` to reviewed exact capabilities
  with both `image-generation` and `image-edit`, citing the 2026-08-05 official
  API reference. Do not add shorthand or case-normalized aliases as persisted
  model IDs.
- Select request mode by reviewed exact native contract. Image 3 submissions
  must use the synchronous headers and response shape; retain async polling only
  for exact models whose official API supports it.
- Enforce model-specific edit count, per-image bytes, output size area, and
  aspect ratio before approval/paid execution. Either support all official input
  formats or make the narrower accepted subset explicit and fail before spend.
- Decide the closed regional binding design: at minimum retain the documented
  legacy Beijing origin; for Singapore/workspace domains, add typed regional and
  workspace identity rather than allowing renderer-supplied arbitrary URLs.
  Bind the selected regional key to the matching native endpoint.
- Synchronize DashScope provider adapter capability metadata with the closed
  native image strategies; this is metadata only and must not bypass exact-model
  evidence.
- Replace the marketing-name fixture with exact-ID projection tests for both
  generation and edit. Add negative tests for shorthand/case variants,
  unavailable Singapore standard, and missing limited-preview entitlement.
- Add Rust body/header fixtures for both exact IDs and both operations; assert no
  async header for Image 3, ordered 1-3 references, 10 MB limit, exact size
  area/aspect boundaries, synchronous success parsing, malformed response, and
  sanitized provider errors.
- Add regional binding/result-origin tests before claiming Singapore or
  workspace-specific endpoint support. No official Singapore result-URL example
  was found on the accessed page, so its download allowlist must be verified
  from official or observed evidence rather than guessed.
- Update `.trellis/spec/frontend/byok-provider-protocols.md:553-565`, whose
  current generic sync/async wording and Beijing-only endpoint/result-origin
  contract are too broad for model-specific Image 3 behavior.
- Because Provider/Agent surfaces must remain synchronized, any resulting
  provider capability or public contract change must also inspect
  `cutout.agent-capabilities.json` and run `pnpm agent:validate` under the
  repository contract.

### Files found

- `src/services/ai/image-route-assessment.ts` - Exact capability evidence,
  recommendation metadata, and native DashScope strategy selection.
- `src/services/ai/image-route-assessment.test.ts` - Existing contradictory
  Qwen Image 3 catalog/adapter fixtures.
- `src/services/ai/generation-service.local.ts` - Frontend native generation and
  reference-conditioned edit dispatch.
- `src/services/ai/generation-service.local.test.ts` - Native generation IPC and
  fail-closed reference tests, currently using Image 2.
- `src/services/ai/edit-image.test.ts` - Native edit IPC reference-preservation
  test, currently using the older edit-only model.
- `src-tauri/src/commands/ai/dashscope_image.rs` - Endpoint, request construction,
  sync/async response handling, polling, validation, download, and Rust tests.
- `src/services/ai/provider-registry.ts` - DashScope default compatible-mode
  endpoint and adapter capability metadata.
- `.trellis/spec/frontend/byok-provider-protocols.md` - Exact-model evidence and
  closed native image transport contract.
- `.trellis/spec/frontend/paid-tool-prompt-contract.md` - Pre-spend prompt and
  approval boundary.
- `.trellis/spec/frontend/agent-control-safety.md` - Fail-closed capability rule.
- `.trellis/tasks/archive/2026-08/08-03-converge-prototype-quality-throughput/research/model-eligibility.md`
  - Prior 2026-08-03 research that correctly found Image 3 undocumented on the
  older Qwen Image page; superseded by the new dedicated 3.0 reference.

### External references

- Alibaba Cloud Model Studio, "Qwen Image Generation and Editing 3.0 API
  reference" (China), created 2026-07-20, modified 2026-08-05, accessed
  2026-08-06:
  https://help.aliyun.com/zh/model-studio/qwen-image-generation-and-editing-api-reference
- Alibaba Cloud Model Studio, "Qwen Image Generation and Editing 3.0 API
  reference" (international), last updated 2026-07-20, accessed 2026-08-06:
  https://www.alibabacloud.com/help/en/model-studio/qwen-image-generation-and-editing-api-reference
- Alibaba Cloud Model Studio, "Image generation and editing," modified
  2026-08-05, accessed 2026-08-06:
  https://help.aliyun.com/zh/model-studio/image-model/
- Alibaba Cloud Model Studio, "Text to image," accessed 2026-08-06:
  https://help.aliyun.com/zh/model-studio/text-to-image
- Alibaba Cloud Model Studio, model catalog, accessed 2026-08-06:
  https://help.aliyun.com/zh/model-studio/models

### Related specs

- `.trellis/spec/frontend/byok-provider-protocols.md:142-152` - Catalog access is
  not proof of image generation usability.
- `.trellis/spec/frontend/byok-provider-protocols.md:505-569` - Exact observed or
  verified model evidence must intersect a closed executable image strategy.
- `.trellis/spec/frontend/paid-tool-prompt-contract.md:29-51` - Provider execution
  remains behind complete prompt and explicit approval contracts.
- `.trellis/spec/frontend/agent-control-safety.md:81-88` - Missing effect/provider
  capability fails explicitly rather than falling through.

## Caveats / Not Found

- The local credential was used only through the provider-owned credential
  boundary. Its plaintext value, account quota, and billing details were not
  inspected or retained. Three paid generation/edit requests were made as
  recorded above.
- The China page is newer than the international page. Official evidence supports
  both exact IDs in Beijing, but only the Pro ID is confirmed internationally,
  where it is documented as limited preview.
- Official evidence confirms synchronous support and documents async only for
  older `qwen-image-plus`/`qwen-image` models. The statement that Image 3 should
  be treated as sync-only is a conservative contract inference from the absence
  of any Image 3 async header/task schema, not an explicit vendor sentence saying
  "async is unsupported."
- Both exact Image 3 IDs and reference-conditioned editing are now live-proven
  against the legacy Beijing DashScope endpoint through `bl`. The next required
  proof is Cutout's own native Keychain transport inside the signed packaged
  journey; direct provider CLI evidence does not substitute for that product
  boundary.
- No official Singapore Image 3 output URL hostname example was found. Do not
  extrapolate the current China-only OSS result allowlist to Singapore.
