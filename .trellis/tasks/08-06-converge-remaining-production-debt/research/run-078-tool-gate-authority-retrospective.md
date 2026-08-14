# Run 078 tool-gate authority retrospective

## Bug Analysis: The routing gate duplicated Planner authority

### 1. Root Cause Category

- **Category**: B - Cross-Layer Contract
- **Specific Cause**: `proceed_with_generation` was treated as both a
  conversational routing decision and a complete multi-suite planning surface.
  The workspace then invoked the formal progressive Planner and alternative
  topology Planner after that gate, so the same route and material decisions
  had two authorities.

### 2. Observed Evidence

- The signed packaged bundle passed native Provider discovery, native Keychain
  credential read, exact Qwen catalog verification, Provider persistence and
  the natural GUI conversation.
- The creative brief was submitted in about 9.4 seconds and foreground
  ownership remained unchanged across 380 samples.
- The run then stayed in `pipeline-stage-tool-gate` for more than six minutes.
  No formal Planner progress event existed because `createAssets()` had not yet
  reached `planPrototypeSuite()`.
- The gate allowed five model steps and 16,000 output tokens for a schema that
  embedded every candidate suite, route, interaction, material and flow.
- `runToolLoop()` forwarded cancellation but owned no monotonic deadline, so a
  Provider that ignored abort could keep the workflow unresolved.

### 3. Why Earlier Fixes Did Not Apply

1. Planner stage deadlines began only after the routing gate settled.
2. Planner graph repair could not affect work that had not entered the Planner.
3. Additional prompt instructions could reduce average output but could not
   establish a single topology authority or guarantee settlement.

### 4. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Restrict the conversational tool gate to proceed/clarify/material classification and brief refinement | DONE |
| P0 | Contract | Remove Planning Seed from the generation decision, Prototype Plan and workspace continuation path | DONE |
| P0 | Runtime | Make the formal Planner the sole owner of Design System directions, routes, flows and reusable materials | DONE |
| P0 | Liveness | Give every Provider-backed tool loop one native monotonic deadline and immediate parent-cancellation settlement | DONE |
| P0 | Test | Prove timeout and cancellation settle even when the Provider ignores abort | DONE |
| P0 | Distribution | Regenerate the bundled plugin runtime and reject generated drift | PENDING VALIDATION |
| P0 | E2E | Pass a fresh signed packaged Qwen run through complete asset delivery | PENDING |

### 5. General Contract

```text
Tool gate: classify intent, clarify, optionally refine the brief
Planner: own Design System directions, routes, edges, pages and materials
Orchestrator: compile references, schedule work and verify completion
```

Every probabilistic Provider turn must have a host-owned monotonic deadline.
Passing an `AbortSignal` is cancellation propagation, not a settlement
guarantee. Parallel DAGs must also have one semantic authority per graph layer;
later validation may reject or compile references but cannot reconcile two
independent topology owners safely.

### 6. Knowledge Capture

- [x] Updated the prototype-generation contract with the small routing-gate
      boundary and sole Planner authority.
- [x] Updated the cross-layer guide with one-authority and monotonic-settlement
      checks.
- [x] Added focused runtime regressions.
- [ ] Pass Run 079 before release or local app replacement.
