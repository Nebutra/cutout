# Bug Analysis: preparation renders on two active surfaces

## 1. Root Cause Category

- **Category**: B - Cross-Layer Contract, with D - Test Coverage Gap.
- **Specific cause**: the append-only `step:prepare:<run-id>` lifecycle was
  correctly persisted and projected into both the transient conversation feed
  and the full execution audit model. The active dock then rendered both
  projections without an ownership rule, so one canonical event appeared as a
  compact activity bubble and a second expanded timeline card.

## 2. Why The Earlier Fix Did Not Cover This

1. The prior regenerate repair correctly stopped historical preparation events
   from accumulating as chat rows, but it reviewed conversation lifetime in
   isolation from the dock's execution-timeline consumer.
2. View-model tests proved that one preparation activity was selected, while
   timeline tests proved that durable preparation evidence was retained. No DOM
   regression composed both valid projections and asserted the combined count.
3. Treating the full audit projection as directly renderable in the active dock
   left the distinction between durable evidence and current actionable work
   implicit.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Make `activeExecutionTimeline()` the ownership boundary between the full audit model and the active dock | DONE |
| P0 | Test coverage | Assert one activity bubble and zero timeline cards for pure preparation at the composed dock DOM | DONE |
| P0 | Contract | Specify that preparation stays in full audit state but is suppressed from the active timeline | DONE |
| P0 | Actionability | Promote active non-chat tools and explicit approvals nested under preparation without repeating its label | DONE |
| P1 | Edge coverage | Prove terminal nested tools cannot manufacture a running `Tools` card | DONE |

## 4. Systematic Expansion

- **Similar issues**: errors, chat-surface tools, approvals, receipts, and other
  synthetic lifecycle steps can duplicate when a durable projection is reused
  directly by more than one active UI surface.
- **Design improvement**: durable stores and full audit projections may have
  multiple consumers, but each transient surface needs an explicit selector
  that owns its display lifetime and actionability rules.
- **Process improvement**: event-backed UI regressions must compose store,
  view-model, and final DOM. Unit assertions for each projection alone cannot
  prove that their simultaneous rendering is coherent.

## 5. Knowledge Capture

- [x] Updated `.trellis/spec/frontend/agent-control-safety.md`.
- [x] Added full-audit versus active-dock projection tests.
- [x] Added exact composed DOM counts for pure and substantive preparation.
- [x] Preserved Git-managed events, live-text precedence, terminal suppression,
      and explicit approval controls.
