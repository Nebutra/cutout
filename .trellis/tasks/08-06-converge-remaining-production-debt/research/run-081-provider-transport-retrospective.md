# Run 081 Provider transport retrospective

## Bug Analysis: Planner wrapping replaced Provider transport ownership

### 1. Root Cause Category

- **Category**: B - Cross-Layer Contract, with D - Test Coverage Gap.
- **Specific Cause**: structured generation reduced each attempt to a safe
  category, but treated reviewed HTTP 502/503/504 as generic Provider rejection.
  After a malformed streamed outline, Planner then preferred the earlier parse
  error or wrapped the later fallback as a Planner structured-contract error.
  Packaged diagnostics therefore reported the wrapper instead of the terminal
  Provider transport owner.

### 2. Why Earlier Checks Missed It

1. Error-classification tests covered direct HTTP text, not the closed
   structured-attempt grammar produced by `GenerationService`.
2. Planner tests covered malformed streams and transport failures separately,
   but not a malformed stream followed by a transient structured fallback.
3. SDK retry wrappers may retain `statusCode` below `lastError` or `errors[]`;
   top-level-only inspection does not represent the real error shape.
4. Sanitizing output text alone was insufficient because Provider response
   prose could still influence internal retry/classification decisions.

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | One closed attempt/category grammar owns structured failure propagation | DONE |
| P0 | Status authority | Read bounded reviewed SDK status metadata before prose; 408/429/5xx remain transient | DONE |
| P0 | Secret/body boundary | Never retain or classify from Provider response body prose | DONE |
| P0 | Planner ownership | Preserve terminal transport/auth/policy/cancellation categories instead of wrapping them | DONE |
| P0 | Tests | Cover malformed stream followed by 502/503/504 fallback through packaged diagnostics | DONE |
| P0 | E2E | Repeat a fresh packaged run after the complete candidate build is available | PENDING |

### 4. Systematic Expansion

- **Similar issues**: image generation, Vision QA, Coding and any workflow where
  an orchestration layer prefixes or summarizes a service-owned failure.
- **Design improvement**: wrapper layers may add stage context only to local
  contract failures. Terminal execution ownership travels as a closed category
  until UI and evidence projection.
- **Process improvement**: every recovery test must compose the upstream
  failure with at least one wrapper/fallback layer and the final user/evidence
  classifier; isolated unit tests cannot prove ownership preservation.

### 5. Knowledge Capture

- [x] Updated the BYOK Provider protocol contract.
- [x] Updated the cross-layer error-ownership checklist.
- [x] Added service, Planner and packaged diagnostic regressions.
- [ ] Retain fresh Run 081 packaged evidence before release publication.
