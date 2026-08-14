# Run 076 closed-reference retrospective

## Bug Analysis: Closure repair repeated an invented interaction reference

### 1. Root Cause Category

- **Category**: B - Cross-Layer Contract
- **Specific Cause**: settled pages were authoritative for interaction ids, but
  closure repair received that authority only as prompt text. Its broad output
  schema still admitted any string, so the repair turn could repeat the same
  integrity violation under a different invented id.

### 2. Why Fixes Failed

1. Run 075 added early page/closure validation and one bounded closure repair.
   This localized failure and prevented page replay, but still delegated a
   deterministic foreign-key constraint to probabilistic generation.
2. Run 076 completed four page expansions and invoked closure repair, then
   returned `edit-timeline` for the `itinerary` page even though that interaction
   did not exist. Prompt inventory improved context but did not close output.

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Compile settled page/interaction pairs into the closure-repair schema | DONE |
| P0 | Runtime | Preserve final whole-plan fail-closed validation | DONE |
| P0 | Test | Reject a Run 076-equivalent invented interaction at schema parse time | DONE |
| P1 | UX | Map repair-terminal graph errors to safe retryable copy | DONE |
| P1 | Documentation | Record the closed-reference rule in prototype and cross-layer specs | DONE |

### 4. Systematic Expansion

- **Similar Issues**: page-local overlay/state/region repairs and alternative
  topology repair should use closed authoritative identities wherever their
  schema can encode the reference relation.
- **Design Improvement**: separate Agent-owned semantics from orchestrator-owned
  referential integrity. Models choose intent; schemas constrain references.
- **Process Improvement**: a repair test must exercise the repair schema itself,
  not only return a hand-authored valid fixture from a mock.

### 5. Knowledge Capture

- [x] Updated `.trellis/spec/frontend/prototype-generation.md`.
- [x] Updated `.trellis/spec/guides/cross-layer-thinking-guide.md`.
- [x] Added focused Planner and terminal-diagnostic regressions.
- [ ] Pass a fresh signed packaged Qwen E2E before release.
