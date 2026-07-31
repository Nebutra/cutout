# Packaged GUI journey log

## Run 037: complete material graph exposed selected-suite identity drift

- Fresh VM: `cutout-e2e-run-037-fresh`.
- Sanitized evidence: `/private/tmp/cutout-vm-evidence/run-037-fresh/progress.json`.
- Finder remained frontmost when the run was stopped.
- Real completion reached three ready Design Systems and three ready prototype
  suites. Suite 1 produced 6 pages / 6 resources, Suite 2 produced 6 / 7, and
  Suite 3 produced 6 / 6.
- The GUI selection completed, but the fixed driver then waited indefinitely
  before `resource-pack-ready`. Product persistence contained all three packs
  and the selected pack projection.
- Root cause: the button and product selection acknowledgement use the runtime
  candidate identity, while the sanitized result protocol deliberately emits
  `suite-1` through `suite-3`. The driver retained the runtime id and compared
  it against the sanitized suite list, so no selected suite could match.
- Fix: use the runtime id only for product-owned selection acknowledgement,
  then read and validate the selected `suite-N` projection for resource-count
  and terminal evidence matching.

## Capability closure reset

The deterministic WebView regression pass proved orchestration and persistence
repairs but did not execute a real Provider, packaged hidden WebView, automatic
credential import, or Coding Backend. Treating those as a truthful boundary was
rejected by the user because all four are required product capabilities.

Repository inspection found reusable production pieces: exact-path native
credential adapters and candidate fingerprints, authenticated draft catalog
checks, Rust-bound Provider transport, paid-tool approval/receipt/artifact
execution, `CodingTask`/`CodingPatch` schemas, staged controlled workspace
promotion, and a durable desktop Agent Host. The gaps are composition and host
binding rather than absence of primitives.

The release also still stores Cutout provider secrets in owner-only plaintext
`secrets.json`, a temporary unsigned-build workaround. Now that the app is
Developer-ID signed and notarized, production must return to the OS credential
vault and migrate/delete that legacy file before claiming secure automatic
setup.

## Evidence policy

- Earlier release installation evidence used the authorized packaged-app path.
- After the user requested silent execution, all resumed product interaction is
  headless Playwright or background CLI; no foreground app control is used.
- No Cutout business API or provider generation endpoint is called directly.
- Credentials are never written into this log or screenshots.
- Each failure records the earliest broken boundary and whether the cause is
  deterministic product logic, provider/model behavior, environment, or UX.

## Timeline

- `2026-07-28` - Verified the public `v0.1.12` release and installed the signed,
  notarized arm64 application at `/Applications/Cutout.app`. The public release
  is `https://github.com/Nebutra/cutout/releases/tag/v0.1.12`; its workflow is
  `https://github.com/Nebutra/cutout/actions/runs/30332714192`. All 17 expected
  assets, hashes, updater metadata, provenance, SBOM, Developer ID signature,
  hardened runtime, Gatekeeper assessment, and stapled notarization evidence
  passed. The prior `0.1.11` bundle remains recoverable at
  `/Users/tseka_luk/.Trash/Cutout-0.1.11-before-v0.1.12.app`.
- `2026-07-28` - Inspected the supported native AI configuration without
  printing or copying secrets. Verified providers are `mox/gpt-5.5` and
  `tds-router/gpt-5.5`; text and vision bind to `mox/gpt-5.5`, while image
  generation and image editing bind to `tds-router/gpt-image-2`. The installed
  configuration does not expose a model named `Imagen 2`, so the test does not
  fabricate that identifier.
- `2026-07-28` - The user requested silent execution while using the foreground.
  Cutout and Cursor GUI automation was paused to avoid focus theft. All work
  below used source inspection, deterministic component tests, headless browser
  runs, and background native checks. No provider generation endpoint or Cutout
  business API was called to manufacture journey output.
- `2026-07-28` - Initial background browser run: 16 passed, 6 failed. The
  earliest deterministic failure was `Duplicate id: "material:design-system"`
  during legacy workspace to Design IR projection. Additional failures were a
  candidate comparison covered by the Agent drawer, a continuation callout
  intercepting material actions, provider-directory tests targeting the removed
  primary `Connect provider` action, and a stale billing-oriented approval
  fixture.
- `2026-07-28T15:07:51+08:00` - Repaired and reran the deterministic path.
  Historical recovered Design System candidates now migrate canonical material
  aliases to distinct candidate material IDs at the persistence boundary. The
  comparison boundary closes competing workspace drawers, and selecting a
  material suppresses the generic continuation callout so contextual actions
  remain clickable. Provider visual tests enter the directory through Advanced
  AI management, and approval coverage follows the BYOK no-billing contract.
- `2026-07-28T15:22:34+08:00` - Silent full-scope review found that the legacy
  alias migration matched candidates with additional output roles and would
  discard those outputs. The migration now accepts only the exact historical
  two-output shape. A negative regression preserves canonical-looking records
  with additional outputs so unrelated state is not guessed into the legacy
  contract. Focused persistence/projection tests passed 16/16; lint,
  TypeScript, Agent contract/plugin validation, and diff checks passed after
  regenerating the bundled runtime metadata.
- `2026-07-28T15:34:08+08:00` - The desktop/mobile visual sweep exposed one
  stale mobile Canvas baseline from July 15. The current responsive contract
  has hidden the floating Help control below `sm` since July 16 and gives that
  space back to the Canvas; all geometry assertions confirmed controls stayed
  inside the viewport with no overlap. After inspecting the actual light/dark
  images, only the two stale mobile snapshots were regenerated. A serialized
  rerun completed cleanly with 42/42 Playwright tests passing.
- `2026-07-28T16:55:28+08:00` - A focused Deliver run exposed two coupled
  lifecycle defects. Native View Transition callbacks were treated as
  synchronous, so a delayed `resetProject()` erased the Home brief and pending
  Agent handoff after the new project had appeared. The project reset/restore
  and keyed shell transition now share an awaitable application boundary.
  Entering Deliver also used `display: none` on the still-mounted ReactFlow
  workspace, reducing its measured size to zero and producing React warnings
  for `NaN` SVG `cx`, `cy`, `r`, `x`, and `y` values. Deliver now keeps the
  inert workspace mounted with stable geometry. Desktop and mobile focused
  regressions passed with zero invalid-SVG warnings.
- `2026-07-28T17:07:18+08:00` - The serialized visual sweep found nondeterministic
  horizontal positioning in the mobile Settings category rail. The selected
  category now aligns deterministically to the navigation start. Dynamic
  diagnostic timestamps are masked only in the visual snapshot; separate DOM
  assertions continue to validate the diagnostic schema and secret redaction.
  Six repeated desktop/mobile recovery runs passed.
- `2026-07-28T17:14:58+08:00` - Final silent browser gate completed with 127
  passed and 9 explicitly skipped tests across desktop and mobile. The skips
  remain truthful environment or retired-surface boundaries; no skipped test is
  counted as evidence of provider execution or packaged GUI success.

## Background verification

- Journey-focused Vitest: 13 passed files, 1 skipped; 66 passed tests, 1 skipped.
  Coverage includes automatic AI setup projection, provider discovery, local
  Agent inventory, Design System candidates, complete prototype generation,
  material routing, Asset Production, Coding runtime, and Agent Host state.
- Focused persistence/UI Vitest: 5 passed files; 66 passed tests.
- Full Vitest: 350 passed files, 6 skipped; 1,759 passed tests, 15 skipped.
- Full headless Playwright: 127 passed, 9 skipped, 0 failed across desktop and
  mobile. The suite includes Home bootstrap, Design System comparison, complete
  route generation fixtures, slicing, Delivery state preservation, settings,
  responsive geometry, and real-browser CV regressions.
- Provider icon/browser coverage: 3 passed.
- Protected release-critical browser gate: 2 passed.
- Lint, TypeScript, production build and frontend bundle gate passed.
- `pnpm agent:validate` passed after regenerating the Codex plugin runtime
  manifest: 20 operations, 36 MCP tools, 20 product skills, 9 workflow tools,
  and 160 bundled source modules.
- Rust: 155 passed across library and updater-signature tests, 1 expected Apple
  Vision runtime test ignored; locked `cargo check` and `cargo fmt --check`
  passed.
- i18n catalogs: 575 messages in every locale with zero missing translations.

## Remaining foreground boundary

The real clean Cursor -> Cutout conversational journey, live candidate/image
generation, three distinct route suites, three 48-asset benchmark packs, and
visual Coding fidelity comparison still require foreground GUI control and live
provider execution. They remain explicitly unverified while silent mode is in
effect. Mocked/headless evidence above is not represented as completion of that
foreground journey.

The bundled headless Coding host also remains truthfully `capability-required`
without an injected controlled backend/workspace. There is no separately named
resource-pack export operation in the verified headless contract, and no claim
is made that automatic local credentials were imported or that a real image
provider produced the benchmark assets.

Temporary Computer Use setup was cleaned after background work: the helper
processes were terminated, the two temporary plugin-cache symlinks were removed,
and the temporary application copy was moved recoverably to
`/Users/tseka_luk/.Trash/Codex Computer Use-temporary-20260728.app`.

## Clean macOS VM result gate

- `2026-07-29T11:47:00+08:00` - Installed the signed Tart `2.34.0` CLI from its
  official release archive after the configured Homebrew mirror remained
  queued. The release checksum and Developer ID signature were verified before
  installation. Pinned the Tahoe base to OCI digest
  `sha256:a8e1c8305758643f513fdccdd829c2243687c60791083dea42f73f0b7aeb435c`
  and pulled its 27.1 GB compressed disk.
- `2026-07-29T12:00:00+08:00` - A signed hidden-WebView host diagnostic proved
  automatic CC Switch candidate resolution, authenticated catalog discovery,
  Keychain storage, Provider persistence, task routing, casual chat, and
  creative brief submission. It failed at `design-candidates-ready` with the
  closed diagnostic `planner-structured-contract`. The monolithic plan had
  already been split into outline/pages/closure, but the pages stage still
  requested all six full pages in one schema. Page expansion is now one
  schema-validated Provider request per exact outline page, followed by a
  bounded closure request; page identity, viewport, explicit eight-asset
  coverage, and final graph validity remain fail-closed.
- `2026-07-29T13:00:00+08:00` - Created the snapshot chain
  `cutout-tahoe-base -> cutout-tahoe-premise -> cutout-e2e-pristine ->
  cutout-e2e-run-*`. The reviewed CC Switch database was transferred only over
  SSH, repaired through `REINDEX` on a temporary copy after its request-log
  indexes failed integrity checking, verified `ok`, and stored guest-local with
  mode `0600`. Application input is a read-only virtiofs share; sanitized
  evidence is a separate writable share. The app had never launched in the
  pristine snapshot.
- `2026-07-29T13:04:00+08:00` - Disposable `run-001` exposed a VM-only
  environment boundary: an SSH-launched macOS app could authenticate the remote
  catalog, but the guest login Keychain was locked and `securityd` rejected the
  write because user interaction was unavailable. Its credential-free progress
  was preserved, the clone was discarded, and no partial state was reused.
- `2026-07-29T13:08:44+08:00` - Disposable `run-002` started from the pristine
  snapshot after unlocking the guest login Keychain before Cutout's first
  launch. It passed automatic native setup, real Provider chat, and creative
  brief submission under `--no-graphics --no-audio --no-clipboard`. The
  pre-optimization build then failed closed at `design-candidates-ready` with
  `planner-structured-contract`, independently reproducing the oversized
  monolithic structured-plan failure in the clean VM. Sanitized progress and
  result evidence was copied to the separate evidence share before the
  disposable VM was stopped; no Provider id, URL, path, response body, or
  credential was included.
- `2026-07-29T13:19:02+08:00` - Disposable `run-003` started from the same
  never-launched pristine snapshot with the newly signed direct-progressive
  planner build. Automatic native credential resolution/import, authenticated
  catalog, Keychain persistence, Provider configuration, casual Provider chat,
  and creative brief submission passed again without warmed Cutout state. The
  hidden WebView is now running the real progressive plan and downstream
  material pipeline; result acceptance remains gated on the closed artifact
  graph rather than phase checkpoints alone.
- `2026-07-29T13:32:28+08:00` - `run-003` completed several real progressive
  Provider requests but still failed closed at `design-candidates-ready` with
  the coarse `planner-structured-contract` diagnostic. This moved the causal
  boundary beyond the monolithic plan but exposed insufficient orchestration
  observability: the evidence could not distinguish outline, page expansion,
  identity, closure, merge, graph, or explicit-coverage failure. The planner
  now publishes a bounded stage plus completed/total page count, the UI exposes
  meaningful route-planning progress, and the packaged result accepts only
  that credential-free closed progress shape. Focused TypeScript and Rust
  regressions, formatting, and `pnpm agent:validate` passed before `run-004`.
- `2026-07-29` - `run-010` proved that the conversational tool gate kept the
  AI SDK run open after the terminal orchestration tool had already supplied
  the planning input. The tool gate now treats that terminal call as the end of
  the model turn. `run-011` then reached the planner outline but showed that a
  WebView abort did not bound the real buffered structured request.
- `2026-07-29` - The planner was reduced to one compact Agent-authored seed and
  deterministic graph closure. Fresh `run-012` passed native credential
  resolution, authenticated catalog discovery, Keychain persistence, Provider
  setup, casual Provider chat, the creative brief, the terminal tool gate, and
  `planner-stage-complete` against the real Responses Provider.
- `2026-07-29T16:23:13+08:00` - `run-012` remained at the first Design System
  image stage for more than nineteen minutes without publishing a candidate or
  a terminal failure. The desktop loop declared a 300-second deadline, while
  the Rust buffered request retained a separate 600-second lifetime and the
  direct image invocation did not bind the owning Agent run signal. Catalog
  presence of `gpt-image-2` had therefore been mistaken for proven image
  usability. Sanitized progress and the exact guest process lifetime were
  preserved under `research/evidence/run-012/`; the Cutout test process was
  terminated to stop unbounded paid work while the persistent SSH/Keychain
  session remained open. No image or downstream artifact is claimed.
- `2026-07-29T16:55:00+08:00` - Fresh disposable `run-013-fresh` proved the
  repaired native execution boundary against the real assigned image route.
  Automatic CC Switch/Codex credential resolution, authenticated catalog
  discovery, Keychain persistence, Provider save, casual Provider chat, the
  creative brief, compact six-page planning, and one genuine `gpt-image-2`
  Design System image completed. Candidate 2 failed while candidate 1 was still
  running; the route-wide breaker then prevented candidate 3 from starting,
  even though candidate 1 subsequently proved the route usable. The run failed
  closed at `design-candidates-ready`: only candidate 1 was ready, no selection
  or downstream suite/resource/Coding work ran, and Imagen/Google availability
  is not claimed. Sanitized result, final progress, and guest process evidence
  are preserved under `research/evidence/run-013-fresh/`; the app and VM were
  stopped after capture.
- `2026-07-29T17:37:00+08:00` - Fresh disposable `run-014-fresh` exercised the
  candidate-wave repair. It captured cumulative tool-gate, route, research,
  planner, real tool-start, and real image-success stages; candidate 2 became
  ready while candidate 1 remained in flight, without a false route-wide stop.
  The run then exposed an independent post-image stall: image-grounded
  `DESIGN.md` synthesis could spend one native deadline on streaming, another
  on buffered fallback, and then cause the candidate retry to regenerate an
  already successful paid image. Progress and process evidence are preserved
  under `research/evidence/run-014-fresh/`. The synthesis now shares one
  90-second deadline across stream/fallback, returns the existing deterministic
  candidate document fallback on timeout, and gives concurrent candidates
  distinct step identities so one candidate cannot overwrite another's Agent
  event state. The stopped run is not claimed as a completed candidate set.
- `2026-07-29` - Fresh disposable `run-015-fresh` completed all three real
  Design System candidates, selected one through the comparison UI, and proved
  the third candidate starts only after the first bounded wave settles. It then
  failed immediately on entry to prototype-suite generation because the Tart
  guest wall clock corrected by roughly eight hours during the run;
  `waitForJourney` used `Date.now()` and interpreted that wall-clock jump as a
  45-minute timeout. The result and process evidence are preserved under
  `research/evidence/run-015-fresh/`. E2E wait windows and setup grace periods
  now use monotonic `performance.now()`; wall time remains only result metadata.
  The 3/3 Design System result is verified, while route suites and downstream
  artifacts remain unverified in this stopped run.
- `2026-07-30T02:08:19Z` - Fresh disposable `run-016-fresh` verified the
  monotonic deadline repair: all three real Design System candidates completed,
  the comparison selection passed, and the guest wall-clock correction did not
  trigger a false prototype timeout. The first prototype page then emitted a
  real `Generate visual variant` approval request at `01:55:10Z`, but the fixed
  packaged driver scanned only decision-bubble and execution-timeline approval
  surfaces. The actionable approval rendered in the Agent run feed was never
  clicked, no Provider socket opened after that request, and the workflow
  remained `working` without page progress. Credential-free progress plus the
  exact process/notification evidence is preserved under
  `research/evidence/run-016-fresh/`; the app and VM were stopped before more
  paid work could be claimed. The driver now includes the reviewed Agent run
  feed while retaining visible-control and scoped-action checks. Prototype
  suite progress now publishes bounded candidate status with real completed
  page/resource counts so a future approval, generation, or production stall is
  observable before the outer 45-minute result deadline.
- `2026-07-30T02:30:00Z` - Fresh disposable `run-017-fresh` proved the first
  approval-selector repair was necessary but insufficient. It again completed
  all three real Design Systems and selection, then emitted the new closed
  `prototype-suite-2-generating-pages-0-of-6-resources-0-of-48` checkpoint.
  The page approval still remained pending with no Provider socket. DOM/state
  tracing showed that the selection experience intentionally closed the Agent
  Dock and left its mounted approval controls under a `hidden` ancestor; the
  packaged driver correctly refused to click an invisible control. The product
  continuation did not reopen the Dock, so neither a user nor the fixed GUI
  driver could approve the first page. Evidence is preserved under
  `research/evidence/run-017-fresh/`; the run was stopped without claiming a
  page. Selecting a complete Design System now restores the Agent Dock and
  closes competing drawers before starting the continuation. A rendered
  regression asserts the real panel is hidden during comparison and visible
  immediately after selection; approval policy remains explicit and unchanged.
- `2026-07-30T02:40:00Z` - Fresh disposable `run-018-fresh` reached the
  progressive Planner outline before exercising the Dock repair. The outline
  stream exceeded its 120-second renderer deadline; the native Provider socket
  closed, but the async iterator's pending `next()` ignored abort and kept the
  workspace in `working` indefinitely. The exact phase/process evidence is
  preserved under `research/evidence/run-018-fresh/`; no Design System or page
  is claimed. The Planner now races every iterator read against its own timeout
  and parent-cancellation promise, returns a closed sanitized error even when
  the Provider iterator never settles, aborts the inner request, and prevents
  late iterator rejection from escaping. A fake-timer regression supplies an
  iterator that never resolves and proves the Planner still settles at the
  120-second boundary without starting a schema fallback.
- `2026-07-30T02:55:57Z` - Fresh disposable `run-019-fresh` exercised the
  iterator-race repair but again remained at `planner-stage-outline`. Its
  sanitized progress file had not changed since `02:47:14Z`; after more than
  eight minutes the Cutout process remained alive with no established Provider
  TCP connection and no terminal result. This proved the renderer-level race
  was insufficient: Rust had already released the response socket, but the JS
  `ReadableStream` still depended exclusively on the final Tauri Channel frame
  to close. Evidence is preserved under `research/evidence/run-019-fresh/` and
  the stopped run claims no generated material. The Tauri fetch bridge now
  treats completion or rejection of the native `ai_proxy_stream` invoke as an
  idempotent terminal authority in addition to `end`, `error`, and owner abort.
  Focused regressions cover a missing final frame and native completion before
  response headers, so the AI SDK iterator cannot remain pending after the
  native transport has settled.
- `2026-07-30T03:06:42Z` - Fresh disposable `run-020-fresh` included the native
  invoke terminal repair but still stopped advancing at
  `planner-stage-outline`. The progress file was unchanged for more than three
  minutes, the App remained alive, and it again owned no established TCP
  connection. Because neither the invoke completion nor the independent
  renderer timer ran, this closed the next boundary: macOS WebKit can suspend a
  fully hidden WebView during a long native await. Evidence is preserved under
  `research/evidence/run-020-fresh/`; no output is claimed. The dedicated E2E
  build now uses an Accessory activation policy, marks the main window
  non-focusable, shows it so WebKit keeps rendering, verifies it is visible and
  not focused, and records `webview-renderable`. Production builds keep the
  existing hidden-until-bootstrap behavior.
- `2026-07-30T04:09:48Z` - Fresh disposable `run-021-fresh` proved the
  renderable/non-focusable window repair end to end through the next major
  boundaries. Guest focus remained on Terminal; automatic native credential
  import, real chat, compact planning, three real Design Systems, comparison,
  selection, visible page approvals, and six real prototype pages all passed.
  Asset Production then published the first attributable resource of 48. The
  run failed at `prototype-suite-ready` only because the packaged runner gave
  the entire three-suite workload the same 45-minute budget intended for one
  suite. Evidence is preserved under `research/evidence/run-021-fresh/`; the
  incomplete suite and resources are not claimed. The total suite deadline is
  now the explicit product of three required suites and the unchanged
  45-minute per-suite budget. Per-request native deadlines and every other
  local failure boundary remain unchanged.
- `2026-07-30T05:14:52Z` - Fresh disposable `run-022-fresh` exercised the
  135-minute suite deadline and again passed native credential import, real
  chat, compact planning, three real Design Systems, comparison, selection,
  and six real pages for suite 2. Asset Production published one attributable
  resource while two real Provider connections remained active. Source
  inspection then closed a more fundamental throughput defect: the compact
  planning-seed closure hard-coded every one of the eight assets on every page
  as `direct-generate`, expanding the requested journey to 144 independent
  paid image generations instead of a slicing workflow. Evidence is preserved
  under `research/evidence/run-022-fresh/`; the run was stopped after 53:45 and
  claims no complete pack or suite. The closure now keeps the page layout
  regions but groups each page's eight reusable assets into one exact-layout
  `board-cutout` region. The existing CV and slot-assignment path still emits
  48 independently attributable tasks per suite from six generated boards.
  Planner instructions also make per-item direct generation exceptional rather
  than the default. A focused regression locks 18 pages at eight assets each,
  exactly one board group per page, and zero direct tasks in compact closure.
- `2026-07-30T13:27:42+08:00` - Fresh disposable `run-023-fresh` included the
  bounded board-cutout closure and again passed automatic native credential
  import, Provider setup, real casual chat, and entry to
  `planner-stage-outline`. The native Provider TCP connection then closed, but
  neither the stream continuation nor the independent 120-second renderer
  deadline ran. Tauri still reported one normal-sized, non-minimized window;
  macOS System Events independently reported Cutout `visible=false` and
  `frontmost=false`, while `ps` marked the process low-priority. This proves
  `WebviewWindow::is_visible()` was an insufficient liveness assertion and the
  run-020 show/non-focus repair did not keep the macOS application unhidden.
  Evidence is preserved under `research/evidence/run-023-fresh/`; no Design
  System or downstream artifact is claimed. The E2E-only lifecycle now calls
  `unhideWithoutActivation()`, retains a user-initiated `NSProcessInfo`
  activity until exit, and keeps the Accessory/non-focusable safety boundary.
  Production startup remains unchanged. Fresh VM proof is required before the
  repair or complete journey is claimed.
- `2026-07-30T14:16:00+08:00` - Fresh `run-024b-fresh` used the corrected Aqua
  launchd security session and passed automatic credential import, Keychain
  persistence, Provider setup, casual chat, Planner completion, three real
  Design Systems, comparison, selection, and the first committed prototype
  page. It also proved the retained process activity fixes renderer liveness:
  Planner advanced after the native socket boundary while Cutout remained
  non-frontmost and Finder retained focus. The run was intentionally stopped
  at 34:23 with suite 2 at one of six pages and two Provider connections still
  active. Source tracing exposed the throughput root cause: every page expanded
  to mandatory generate + refine under another QA re-roll, and every resource
  board added a text-free generation plus serial board production. The logical
  18-page/18-board journey therefore expanded to 72-126 image calls. Sanitized
  evidence is preserved under `research/evidence/run-024b-fresh/`; the partial
  suite is not claimed. Page attempts now use one reference-conditioned paid
  invocation, automatic QA re-rolls default to zero, edit execution retains all
  bounded references, and board pages run concurrently without a paid text-free
  prepass.
- `2026-07-30T16:26:50+08:00` - Requirement correction removed the last
  uniform per-page material assumption from the primary regression contract.
  Production planning already accepted `materials: []` and instructed the
  Agent to choose zero or more reusable non-UI visuals from each route's real
  needs, but the component benchmark still modeled every page with eight
  materials and asserted 48 resources per suite / 39 image calls. The fixture
  now uses heterogeneous page scopes `[0, 1, 2, 3, 5, 7]`: zero-material pages
  create no board, the remaining five pages create only their authored board
  work, and the expected request count is compiled from actual Design System,
  page, board, and direct-asset nodes. Focused Planner, budget, workspace,
  packaged-runner, and Coding tests pass (66 tests), as do TypeScript, lint,
  Agent contract validation, and `git diff --check`. Historical run-022 facts
  remain unchanged as diagnosis of the old build; they are not current policy.
  Follow-up cross-layer review also removed the implicit one-board-per-page
  authority: new planning-seed materials carry Agent-authored route-local
  `boardGroupId` values, one page may produce multiple coherent boards, and
  legacy missing-group seeds retain their former single-group projection. The
  new multi-board component fixture exposed nested page(3) x group(3)
  concurrency amplification; prototype production now runs group work serially
  inside the outer three-page pool, preserving a combined Provider ceiling of
  three. The expanded focused set passes 58/58.
- `2026-07-30T19:26:00+08:00` - Fresh disposable `run-030-fresh` proved the
  strict generated planning schema and dynamic material scope through a real
  Provider: the Agent completed its authoritative seed directly, selected
  eight pages for suite 2, and planned only seven reusable non-UI materials
  across the entire suite. No per-page material quota or second Planner pass
  appeared. Prototype generation reached six of eight real pages before one
  transient Provider transport failure. The background driver clicked the
  visible Retry control, but then read the stale failed React projection before
  the retry acknowledged start and wrote a premature terminal result. Evidence
  is preserved under `research/evidence/run-030-fresh/`; no complete suite or
  pack is claimed. The repair now clears stale failure state at retry start,
  bypasses the already-settled tool gate, snapshots the incomplete candidate
  graph, ignores incidental slice selection, retains ready sibling suites, and
  resumes only missing pages of the failed suite. The packaged driver waits up
  to two minutes for retry acknowledgement before evaluating terminal state. A
  rendered regression injects one HTTP 503 and proves all three candidates
  recover with 19 page calls: the 18-page resolved baseline plus exactly the
  failed request, with only three Design System calls.
- `2026-07-30T19:52:44+08:00` - Fresh disposable `run-031-fresh` again passed
  automatic local Agent credential discovery/import, authenticated catalog
  validation, Keychain persistence, real casual chat, authoritative planning,
  and three real Design Systems while Finder remained frontmost. The Agent
  selected a genuinely dynamic topology for suite 2: seven pages and only nine
  reusable non-UI materials across the whole suite, directly disproving any
  per-page material quota. The anchor page completed and the next wave opened
  exactly three concurrent Provider connections. One real transient Provider
  failure then left suite 2 at one of seven pages; the driver clicked Retry and
  recorded `run-retried`, but the product did not publish a new working run
  before the two-minute acknowledgement window closed. The terminal result is
  therefore correctly `suite-failed`, and no suite or resource pack is claimed.
  Sanitized evidence is preserved under `research/evidence/run-031-fresh/`.
  The repair moves retry ownership to the visible action boundary: it clears
  stale failure, enters busy state, and increments a packaged product-owned
  acknowledgement synchronously before asynchronous preflight. The driver now
  distinguishes that acknowledgement from the DOM click, and the rendered
  regression asserts immediate working state plus missing-page-only recovery.
- `2026-07-30T20:44:20+08:00` - Fresh disposable `run-032-fresh` proved the
  corrected retry acknowledgement and advanced farther through the real
  dynamic graph while Finder remained frontmost. Automatic local Agent
  credential discovery/import, authenticated catalog validation, Keychain
  persistence, casual chat, authoritative planning, and all three Design
  Systems passed. The Agent selected seven pages and only five reusable non-UI
  materials for suite 2; all seven pages completed with exactly three follower
  Provider requests active at once, and Asset Production reached three of five
  resources. A board transport failure then became the generic terminal
  message "Reusable material production failed for regions". That reduction
  dropped the retryable classification, so the visible Retry action never
  appeared and sibling suites were cancelled. Evidence is preserved under
  `research/evidence/run-032-fresh/`; no complete suite or pack is claimed.
  Recovery now retains the causal retryability, infers failed regions from the
  prior production run, carries ready pages and material tasks into a new run,
  and regenerates only failed regions. The resolved request budget counts the
  actual repeated logical node instead of replaying successful page or board
  work.
- `2026-07-31T11:38:35+08:00` - Fresh disposable `run-036-fresh` passed native
  local-Agent credential resolution, binding normalization, secret resolution,
  authenticated catalog validation, Keychain persistence, Provider setup,
  casual GUI chat, Agent planning, and three real Design Systems while Finder
  remained frontmost. Suite 2 initially failed at four of six pages; the
  visible Retry was acknowledged synchronously, preserved those four pages,
  completed six of six, and produced all eight Agent-authored reusable
  resources. Suite 3 then started independently and reached three of six pages
  before a second transient `provider-transport` failure. The product retained
  resumable state, but the packaged driver refused a second Retry because one
  module-global `runRetryCount >= 1` allowance had already been consumed.
  Sanitized progress/result evidence is preserved under
  `/private/tmp/cutout-vm-evidence/run-036-fresh/`; no terminal outcome, Suite 3,
  Suite 1, Coding output, or release is claimed. The driver now budgets visible
  acknowledged retries by failed candidate page/resource frontier, with two
  attempts per frontier and six across the fixed three-suite benchmark. A
  regression recovers Suite 2 and then Suite 3 while separately proving the
  acknowledgement, per-frontier, and total ceilings.
- `2026-07-31T14:37:04+08:00` - Fresh disposable `run-038-fresh` used the
  signed, notarized and stapled build containing the sanitized suite-id repair.
  It passed automatic CC Switch credential resolution/import, authenticated
  catalog verification, Keychain persistence, real casual chat, authoritative
  Agent planning, and three real Design Systems while Finder remained
  frontmost. The three suites all reached ready with independently produced
  graphs: 6 pages/8 resources, 6 pages/6 resources, and 6 pages/6 resources.
  One real Provider failure on the second suite was recovered through the
  visible Retry action without replaying the completed first suite. GUI suite
  comparison and selection then passed, but the driver did not advance beyond
  `prototype-suite-selected`, so this run is not terminal success and no Coding
  result is claimed. Background accessibility evidence showed the comparison
  dialog was already non-interactive while its exit-transition DOM remained,
  and the selected pages/slices were restored against the last generated
  sibling's Asset Production authority. The repair now treats a non-visible
  dialog as closed, resolves `resource-pack:<run-id>` to one exact completed
  run, and makes auto-selection and later suite switching restore the same
  page/material/slice/Coding authority. Evidence is preserved under
  `/private/tmp/cutout-vm-evidence/run-038-fresh/`; focused runner, authority,
  and rendered suite-switch regressions pass (38 tests), as do TypeScript,
  lint, and `git diff --check`. A fresh packaged VM rerun remains required.
- `2026-07-31T16:02:26+08:00` - Fresh disposable `run-039-fresh` used the
  signed, notarized, stapled repair build and passed the complete real asset
  journey while Finder remained frontmost: automatic reviewed CC Switch
  credential import, authenticated catalog validation, Keychain persistence,
  casual GUI chat, Agent planning, three real Design Systems, three complete
  distinct route suites, GUI comparison/selection, exact selected-production
  restoration, and the selected resource-pack gate. The suites completed with
  8 pages/9 resources, 8/8, and 8/7; the variation in material counts was
  Agent-authored rather than quota-driven. The old scope then invoked Coding,
  whose oversized structured Provider request timed out and correctly wrote a
  terminal failure at `coding-preview-ready`; no Coding result is claimed.
  Sanitized progress, failure, hashes, and final foreground evidence are
  preserved under `/private/tmp/cutout-vm-evidence/run-039-fresh/`.
- `2026-07-31T16:08:00+08:00` - Product scope was explicitly narrowed to make
  UI/UX Design Systems, route prototypes, useful non-UI materials, slicing,
  preview, provenance, and resource packs the complete user outcome. Coding is
  no longer a visible or terminal requirement and cannot qualify or block
  asset delivery. Review also found that sibling-suite prompting copied the
  shared seed's exact page count, explaining why run 038 produced 6/6/6 pages
  and run 039 produced 8/8/8 despite distinct routes. The corrected contract
  lets every Design System direction derive its own complete route count from
  its business content model and journeys. A newly packaged fresh-VM run must
  still produce terminal `passed`; run 039's pre-Coding success is evidence for
  the diagnosis, not a substituted terminal result.
- `2026-07-31T17:33:50+08:00` - Fresh disposable `run-040-fresh` produced the
  required terminal `passed` result from the signed, notarized and stapled
  `0.1.13` E2E package while Finder remained frontmost. The first launch was a
  harmless harness-control error: the package started without
  `CUTOUT_PACKAGED_E2E=1`, wrote no journey state and was archived before the
  same pristine guest was relaunched with the explicit fixed E2E mode. The real
  run then completed automatic reviewed CC Switch credential resolution,
  authenticated catalog validation, Keychain persistence, casual GUI chat,
  Agent planning, three ready Design Systems, three distinct complete route
  suites, real non-UI material generation, slicing, GUI comparison/selection,
  exact production-authority restoration, and `resource-pack-ready`. Suite
  results were 7 pages/6 resources, 6/7, and 7/7 with distinct route arrays;
  the selected suite exposed 7 visible slices for its 7 completed resources.
  One Provider/page failure at suite 2 page 5/6 cancelled the pending siblings;
  the visible Retry action resumed the failed frontier, completed 6/6, and then
  completed both siblings without replaying settled material work. The compiled
  image budget was 44 calls and the native executor recorded exactly 44 calls.
  The bounded production ceiling remained three concurrent page or page-owned
  board tasks, with board groups serial inside each active page. From the
  `08:22:07` harness launch, all three Design Systems were ready in about 11
  minutes, suite 2 was ready in about 34 minutes including recovery, suite 3 in
  about 53 minutes, suite 1 in about 72 minutes, and the complete journey ended
  in about 71 minutes 43 seconds. The result contains no Coding outcome or
  Coding phase. Guest `codesign`, Gatekeeper (`Notarized Developer ID`), app
  version `0.1.13`, and final foreground checks passed. Sanitized progress and
  result evidence is preserved under
  `/private/tmp/cutout-vm-evidence/run-040-fresh/`; no credential, prompt body,
  Provider response, or local secret path is present.
