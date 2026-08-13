# Run 075 progressive graph retrospective

## Bug analysis: valid pages discarded by an invented closure reference

### 1. Root cause category

- **Category B - Cross-layer contract**: page expansion and closure shared JSON
  prompts but no staged validation/repair ownership. Closure could reference any
  string even though only settled page interaction ids were authoritative.
- **Category D - Test coverage gap**: deterministic tests covered final rejection
  but not a real-model-shaped invalid closure followed by bounded closure-only
  repair and terminal UI settlement.

### 2. Evidence and confidence

Initial hypotheses were page-local reference failure (35%), closure flow failure
(35%), unreachable topology (20%), and merge/schema drift (10%). Read-only
inspection of the isolated VM's IndexedDB recovered the exact error:

```text
Flow "onboarding-to-exploration" step references unknown interaction
"submit-trip-intent" on page "landing".
```

This raises closure ownership above 99% confidence. The same run had already
completed five page expansions and closure, so Provider availability, timeout,
and page schema parsing do not explain the failure.

### 3. Prevention mechanisms

| Priority | Mechanism | Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Validate page-local/cross-page references before closure | Done |
| P0 | Architecture | Repair one faulty page or closure once; preserve siblings | Done |
| P0 | Runtime | Keep final whole-plan validation fail-closed | Done |
| P0 | UI | Clear ephemeral progress and suppress pending feed on terminal error | Done |
| P0 | Tests | Cover targeted repair, bounded failure, and excluded failure classes | Done |
| P1 | Evidence | Retain safe stage/reason category without raw model or graph payloads | Done |

### 4. Systematic expansion

The same failure class applies to every probabilistic multi-stage DAG: candidate
topology, Design System synthesis, page generation, semantic slicing, resource
binding, and review closure. Validate each node at the earliest deterministic
boundary and assign repair to the smallest authority rather than replaying the
entire upstream graph.

### 5. Environment cleanup

The isolated Run 075 VM contained temporary Qwen credentials. After extracting
only the exact non-secret validation message, the VM was stopped and permanently
deleted. The E2E-only host relay on `192.168.64.1:17897` was also stopped.
