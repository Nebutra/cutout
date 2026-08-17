# Multi-action sprite family - implementation plan

## Gate 1: Contracts and compilation

- [x] Add strict family-plan, action-clip, scale-profile, family-acceptance and
      family-bundle schemas with canonical fingerprints.
- [x] Add action-source strategy and retained coherent-grid derivation contracts
      without changing historical role-isolated receipt semantics.
- [x] Compile natural-language deliverables into bounded atomic action groups and
      explicit body/FX dependencies without changing `game-asset.plan.v1`.
- [ ] Add malformed, duplicate, cycle, incompatible-profile and stale-reference
      contract tests.
- [x] Replace the fixed Courier/humanoid/blade four-group preset with an
      intent-derived bounded action program and topology-neutral prompts.
- [x] Support grounded player/NPC/creature/prop subject policies with explicit
      anchor/envelope evidence while retaining historical plan replay.
- [x] Add distinct creature and prop tests proving that absent weapon/effect cues
      cannot leak from the first real rehearsal.

## Gate 2: Orchestration and evidence

- [ ] Reuse the native atomic preview/apply/repair/acceptance path per action.
- [x] Add native coherent-grid preview/apply, bounded decoded grid splitting and
      exact sheet-to-cell receipt/byte lineage.
- [x] Repair failed cells through isolated generation and sign mixed preserved/
      replacement source lineage without regenerating accepted siblings.
- [ ] Derive a scale profile only from exact accepted master bytes and measurements.
- [ ] Add family closure verification and dependency impact propagation.
- [x] Prove selected repair preserves accepted sibling identities.

## Gate 3: Delivery and projection

- [ ] Compile accepted clips into deterministic multi-animation atlases/manifests.
- [ ] Add actual manifest-driven playback and managed export hash verification.
- [x] Project family progress and blockers in the current intent-routed workbench.

## Gate 4: Real rehearsal

- [ ] Run one retained Qwen family with idle, run, attack body and detached FX.
- [ ] Bound the initial run to one Provider call per coherent action group and
      attribute any extra call to an exact failed-cell repair.
- [ ] Obtain exact native semantic acceptance for all required groups.
- [ ] Reverify source bytes, processed bytes, receipts, profile and final bundle.
- [x] Run a second topologically distinct real Qwen identity through the same
      public authoring/native preview path and retain its source/receipt evidence.

## Validation

- [ ] Focused TypeScript/native contract, orchestration, repair and bundle tests.
- [ ] Existing atomic Game/profile/Kernel regression suites.
- [ ] Type-check, lint, build, Tauri link build and `pnpm agent:validate` when the
      executable Agent surface changes.
- [ ] Desktop visual verification remains a separate explicit gate; fixture UI
      tests cannot satisfy the real family rehearsal.

## Real rehearsal notes

- 2026-08-14: the first retained Qwen Pro Idle request completed with one native
  Provider receipt and passed byte/hash/grid/cutout re-verification. Visual review
  rejected its action semantics because the 2x2 source mixed idle, run and attack.
  This is retained failure evidence, not an accepted clip.
- Root cause: aggregate family intent leaked into each atomic action prompt. The
  compiler now keeps aggregate intent out of Provider action briefs and supplies
  exact per-action phases plus explicit negative constraints.
- The corrected real Idle source passed native re-verification and operator visual
  review: all four frames remain idle, alpha height is 420 px, the normalized feet
  anchor is y=466, width varies by at most 1 px, and no frame contacts an edge.
  It is a master candidate; native semantic family acceptance is still pending.
- The real Run source also passed native re-verification and operator visual review:
  six right-facing phases retain identity, avoid unrelated actions/effects, preserve
  the normalized feet baseline, and do not contact a frame edge.
- Aggregate text is not reintroduced for attacks. Blade intent is now projected as
  group-local structured cues for attack body and detached FX only. The first Attack
  body candidate was already in flight before this compiler correction and will be
  reviewed as such rather than retroactively attributed to the new prompt.
- The pre-correction Attack body was rejected by operator review because it produced
  a punch sequence and returned to idle instead of the requested blade attack. A
  blade-constrained retry was correctly blocked by native cutout because generated
  pixels contacted a cell border; it received no clip or success authorization.
- Paid-source observability now survives downstream cutout rejection: once the
  Provider source receipt, decoded bytes, grid and cells verify, a failed result may
  retain that source while still forbidding a clip/authorization. The Rust rejection
  test proves this state and successful results retain their stricter closure.
- The final plan revision adds a 32 px per-cell safety margin for every body, weapon
  and effect tip. Its exact family-plan hash is `e7ca54fb97d46ec7b8ec60c92808b2edfc1915d79acac1bb3df03ffbb2470443`;
  evidence from earlier prompt revisions cannot close this final family.
- v6 cutout adds an adaptive chroma border median fallback for non-uniform magenta
  boards, plus deterministic bottom-stroke cleanup that preserves pixels with
  nearby subject support. The implementation is recorded as
  `cutout-adaptive-border-chroma-trimap-pymatting-ml-foreground-normalize-anchor-shadow-prune-rust-image-0.23-v6`.
- v7 is the current processor and additionally removes unsupported near-bottom
  board strokes before foreground reconstruction and border validation. v5 remains
  frozen at strict uniform-perimeter matting with no shadow cleanup; v6 remains
  frozen at relaxed median fallback plus post-matte cleanup with no v7 pre-border
  cleanup. Authorization verification dispatches each signed frame by its exact
  implementation instead of rerunning historical bytes through current code.
- Retained final-plan Idle authorization `4639ea205bed5b0d01221b52883998692a3954516f37e3efbe1d19dd46ee58ac`
  and Run authorization `6422d1338e7698f296e4944f8d456a575fb86548e35c2d7bea94c2ead113eaa7`
  replay byte-exact through frozen v5 for all 4/6 frames with zero Provider calls.
- A final-plan real Qwen Run rehearsal completed through the native Host in
  `479fd1795660e0751860885b0154250a7cc733b226a14c741833a04cc7309ee9` in
  263.08s. Its six frames passed receipt, byte, grid, cutout and authorization
  reverification; operator review found coherent right-facing run phases,
  stable `y=466` feet anchors and no horizontal ground stroke.
- The first final-plan Attack rehearsal completed natively in
  `4ea4aed50ce5bc2242d590948178d556bf421056708eb2cd7f890e60daa2cd00` in
  454.29s and produced six coherent bladed poses, but operator review rejected
  the thin generated floor line. Three subsequent real retries were rejected by
  native border validation because weapon pixels crossed a cell edge; their
  retained failure directories are `partial-sha256-a171b78295a5db7d63df11dde86b3f86ea0ae1f42aa54301e07ae5b3b9a5a167`,
  `partial-sha256-12343204a56fe261424ec96542d715930a4ba9a99d0e096ca72fd341af579d90`,
  and `partial-sha256-8fda1a6ba3833c55ad08d04c7dfdf1e76ec9de3646cb2d3b43f25e6ed995c358`.
- The family compiler now adds explicit no-ground-line and no-cross-cell
  constraints to every action-sheet brief. The final family hash is unchanged,
  but the attack group remains blocked pending isolated failed-cell repair or a
  new native semantic acceptance path; these rehearsals do not close Gate 4.
- Native action-sheet repair now has its own preview/apply/verify protocol. Preview
  re-verifies the complete parent authorization, source and clip before accepting
  a strict replacement subset. Each replacement role is one direct Qwen Edit call
  over the retained parent sheet and failed-cell bytes; preserved siblings are not
  regenerated. The signed repair authorization retains parent receipt/source/clip
  identities, replacement receipts and processed bytes, plus exact preserved sibling
  source/output artifact lineage. Native tests cover one-call repair, byte/evidence
  reproduction and rejection after parent-cell tampering. This closes the Gate 2
  repair implementation only; real semantic acceptance and family delivery remain
  open.
- A real repair attempt against the earlier Attack candidate was rejected before any
  Provider call because a processor change had been made under the existing v6 id.
  The rejection correctly prevented stale evidence from becoming authority, and the
  replay defect is now closed by frozen v5/v6 dispatch plus current v7 issuance. A
  fresh final-plan Attack attempt reached native DashScope
  but returned `HTTP 400 (InvalidParameter)` and was retained as
  `partial-sha256-7d178d9c479dbcbd46d42d17f186e0a4f8f308265e205f722e4b1f9c2c3106df`;
  no clip or authorization was issued.
- The intent-routed Game workbench now exposes per-cell Keep/Repair decisions for
  coherent action groups. A selected strict subset flows through native repair
  preview/apply/reverification, then merges only replacement outputs while
  retaining parent siblings. A second rejection after repair stays blocked rather
  than reusing stale parent authority. Family runtime projection also keeps every
  missing group explicit and derives candidate scale geometry from measured clip
  pixels while rejecting anchor drift; native family semantic acceptance and atlas
  compilation remain open.
- DashScope image failures now preserve a bounded safe Provider diagnostic after
  HTTP/code classification. Credential-, token-, URL- or OSS-shaped messages are
  discarded, so a future `InvalidParameter` rehearsal can identify the rejected
  field without retaining the response body or exposing signed URLs.
- 2026-08-16: `game-asset.family-authoring.v3` replaced the fixed human action
  preset with bounded intent-derived player/NPC/creature/prop policies. A real
  Qwen-generated tracked turret compiled through the same public authoring path
  into bottom-anchored Idle, Shoot and Charge body groups plus Shoot FX. Native
  Qwen action-sheet execution and byte replay succeeded for v3 Idle (4 frames),
  Charge (6 frames) and detached Shoot FX (5 frames). Shoot body remains blocked:
  two real sheets leaked muzzle flash/smoke into roles 2/3 and became signed
  partials, one corrected full request and one two-role isolated repair were
  rejected by DashScope as `InvalidParameter`. No family semantic acceptance,
  scale-profile adoption, bundle compile or export is claimed from this proof.
