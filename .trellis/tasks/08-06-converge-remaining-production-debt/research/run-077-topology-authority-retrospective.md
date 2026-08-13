# Run 077 topology-authority retrospective

## Bug Analysis: Closed references did not guarantee a connected route graph

### 1. Root Cause Category

- **Category**: B - Cross-Layer Contract
- **Specific Cause**: the outline owned route nodes while independent page
  expansion implicitly owned cross-page navigation. Closure could select only
  real references after Run 076, but it could not make a disconnected settled
  page graph reachable without inventing new page semantics.

### 2. Why Fixes Failed

1. Prompt inventory did not constrain foreign keys.
2. A runtime-closed closure repair schema constrained foreign keys but arrived
   after connectivity had already been decided independently by page calls.
3. The packaged driver treated a safe retryable UI classification as permission
   to replay deterministic Planner failures, spending about thirteen minutes
   without reaching image production.

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Author route nodes, one or more journey entries, and navigation edges in the outline | DONE |
| P0 | Runtime | Validate outline uniqueness/endpoints and reachability from every authored entry before expansion | DONE |
| P0 | Runtime | Compile exact outline edges after page-local expansion | DONE |
| P0 | Test | Cover disconnected outlines and page-authored navigation drift | DONE |
| P0 | E2E | Do not auto-replay deterministic graph failures | DONE |
| P1 | Evidence | Preserve retry attempt identity in Planner progress checkpoints | DONE |

### 4. Systematic Expansion

- **Similar Issues**: every parallel DAG needs global edges settled before node
  workers run; a final join can validate but cannot safely invent connectivity.
- **Design Improvement**: distinguish Agent-owned topology semantics from
  orchestrator-owned foreign-key compilation. Entry roots are also Agent-owned:
  account-management and primary product journeys may legitimately start at
  different pages, so the orchestrator must not assume the first route is the
  only root.
- **Process Improvement**: retry policy must classify whether a new sample can
  plausibly repair the owner; safe user Retry copy is not automatic retry policy.

### 5. Knowledge Capture

- [x] Updated prototype generation contracts.
- [x] Updated the cross-layer thinking guide.
- [x] Added focused Planner and packaged-driver regressions.
- [ ] Pass a fresh signed packaged Qwen E2E before release.
