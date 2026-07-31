# Implementation plan

## Phase A: release and environment

- [x] Wait for the protected `v0.1.12` release workflow to complete.
- [x] Validate the public release, expected assets, hashes, updater manifest,
      provenance, SBOM, arm64 DMG signing, Gatekeeper, and notarization ticket.
- [x] Quit Cutout, move the old app bundle recoverably to Trash, install the
      public arm64 DMG, verify `0.1.12`, and launch it.
- [ ] Establish a clean Cursor window/workspace and a task-specific benchmark
      output directory.
- [x] Install Tart, clone the pinned public Tahoe base image, and verify SSH,
      no-graphics execution, resource limits, and host/guest shared evidence.
- [x] Create a guest-local reviewed Agent premise with owner-only permissions;
      verify configuration presence without printing secret values.
- [x] Snapshot the guest before Cutout's first launch and use disposable clones
      for every diagnostic run.

## Phase B: AI readiness through GUI

- [x] Open Cutout settings through GUI and run automatic local AI discovery.
- [x] Authorize/import only through reviewed local Agent flows; do not enter a
      provider key manually.
- [x] Verify task coverage for text/reasoning, vision, image generation, and image
      editing where required. Record exact gaps and misleading states.
- [x] Restore production secret persistence to the OS credential vault and add
      one-way deletion of successfully migrated plaintext entries.
- [x] Add a native auto-configure transaction for reviewed importable Agent
      credentials, authenticated model discovery, provider persistence, and
      sanitized result projection.

## Phase B2: shared native execution plane

- [x] Add a host-bound Provider executor for `tool.invoke` which reuses Rust
      transport, approval/budget policy, receipts, and artifact storage.
- [x] Keep Coding outside this release's visible journey and terminal result;
      do not let unavailable Coding infrastructure block resource delivery.
- [x] Synchronize the control manifest, schemas, CLI, MCP, plugin runtime,
      product Skill, docs, and validation assertions with the new truthful
      capability state.

## Phase B3: silent packaged macOS harness

- [x] Add a dedicated packaged-E2E build mode whose normal WebView starts
      hidden and never activates/focuses the app.
- [x] Add a fixed, versioned in-WebView journey driver and sanitized result
      protocol; do not expose arbitrary script, path, provider, prompt, or
      approval inputs.
- [x] Extend the macOS packaged smoke runner to launch the background journey,
      await its result, assert no foreground activation, and retain evidence.
- [x] Build and sign the dedicated E2E application, transfer it into the guest,
      and run the fixed packaged journey entirely inside a disposable VM clone.
- [x] Retrieve only sanitized receipts, artifact manifests, rendered preview
      evidence, and failure classification from the guest evidence mount.
- [x] After severe fixes, repeat the complete journey from a fresh clone of the
      pristine pre-Cutout snapshot; do not resume from warmed app state.

## Phase C: conversational creative journey

- [x] Start with a casual idea in the chat composer and follow visible Agent
      clarification, preview, approval, retry, and continuation controls.
- [x] Request exactly three Design System directions for the benchmark, inspect
      their images/`DESIGN.md`/tokens, and record comparison UX.
- [x] Generate three corresponding route-suite alternatives with distinct IA;
      if the capability is absent, root-cause and implement it before resuming.
- [x] Complete all pages for each suite and verify consistent design context and
      route coverage.
- [x] Remove mandatory generate/refine pairs from page production and use one
      reference-conditioned paid invocation per page attempt.
- [x] Make visual QA observational by default with zero automatic paid re-rolls.
- [x] Preserve every ordered edit reference in the desktop executor and fail
      closed when a required reference is unavailable.

## Phase D: assets and packs

- [x] Enter material/slicing workflow for each suite.
- [x] Let each Agent-authored business topology and material plan determine page
      and useful asset counts; inspect actual counts,
      names, bounds, transparency, provenance, and failure recovery.
- [x] Export three separately attributable resource packs and inspect manifests
      and files without modifying them outside approved apply flows.
- [x] Remove the paid text-free page prepass, bound board context to Design
      System plus stable anchor, and schedule independent board groups with
      bounded concurrency.
- [x] Add heterogeneous material-scope regressions that compile the exact
      graph budget and reject hidden page/prepass/reroll amplification without
      introducing a per-page quota.

## Phase E: resource-pack delivery

- [x] Use the GUI to compare and select one completed suite while preserving
      all three independently attributable resource packs.
- [x] Preview the selected suite's exact Design System, route graph, page set,
      useful materials, hashes, and source-page bindings.
- [x] Require terminal E2E success only after the selected visible consumable
      count equals the selected completed production run.

## Phase F: repair and verification

- [x] Maintain `research/journey-log.md` with screenshots, timing, failures,
      classification, code ownership, fixes, and rerun results.
- [x] Add focused regressions and implement in-scope fixes discovered by the
      packaged E2E; rebuild/reinstall local candidates only when required.
- [x] Run `pnpm agent:validate`, lint, TypeScript, focused/full tests appropriate
      to the blast radius, production build, Rust checks, and release-critical
      Playwright gate.
- [x] Rerun the complete critical GUI journey after severe fixes.
- [x] From a fresh VM, record actual image-call count, compiled dynamic budget,
      maximum page/board
      concurrency, time to 3/3 Design Systems, time to each complete suite, and
      total journey duration; actual calls must equal the resolved graph budget.
- [ ] Commit and merge directly into protected `main` after checks, then publish
      `v0.1.13` and update task evidence without claiming unverified outcomes.

## Stop Conditions

- Stop before transmitting a credential or secret to an unexpected destination.
- Stop rather than bypassing macOS/browser security warnings.
- Preserve partial artifacts and report a capability-required boundary when an
  external provider is genuinely unavailable; do not fabricate success.
