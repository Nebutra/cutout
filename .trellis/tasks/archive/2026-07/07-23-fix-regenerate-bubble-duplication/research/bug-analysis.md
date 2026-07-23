# Bug Analysis: regenerate activity bubbles accumulate and stick

## 1. Root Cause Category

- **Category**: B - Cross-Layer Contract, with D - Test Coverage Gap.
- **Specific cause**: append-only preparation lifecycle events were correctly
  persisted for Git/audit, but the view-model treated the latest event for every
  unique preparation step as a durable conversation row. Regeneration creates
  a new `step:prepare:<run-id>`, so each attempt accumulated another bubble.
  The existing E2E asserted two completed Agent bubbles and therefore preserved
  the incorrect UI contract.

## 2. Why The Earlier Fix Failed

1. The earlier persistence work interpreted "Git manages Agent bubbles" as
   "every durable lifecycle event is a permanent chat item" instead of deriving
   display lifetime from the event state.
2. Projection tests covered replacement of a runtime bubble by a terminal row,
   but did not cover repeated runs, live-stream precedence, terminal removal,
   or response branch navigation.
3. The first repair draft treated the presence of `liveAgentMessage` as enough
   to replace preparation. In production the label exists before the first text
   delta, which would have created a blank pending bubble. Independent review
   found and closed that timing gap.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Separate durable conversation selection from transient active preparation projection | DONE |
| P0 | Test coverage | Assert exact activity/message counts during preparation, after completion, and in both branch directions | DONE |
| P0 | Contract | Specify empty-stream precedence and terminal lifecycle suppression in Agent safety spec | DONE |
| P1 | Review | Trace append-only event lifetime through store -> projection -> DOM whenever adding a chat-visible event | DONE |

## 4. Systematic Expansion

- **Similar issues**: any operational step, tool, approval, or receipt projected
  into chat can accumulate if event durability is confused with surface
  lifetime. Conversation selectors should admit only actual user/Agent turns;
  operational state needs an active projection or timeline.
- **Design improvement**: keep one owner for lifecycle reconciliation and make
  active/terminal selection explicit instead of merging operational events into
  conversation IDs.
- **Process improvement**: regressions for event-backed UI must cover initial,
  active, terminal, repeated-run, restart/branch, and empty transitional states.

## 5. Knowledge Capture

- [x] Updated `.trellis/spec/frontend/agent-control-safety.md`.
- [x] Added view-model lifecycle and branch regressions.
- [x] Added workspace DOM assertions for both regeneration result paths.
- [x] Preserved persisted preparation terminal evidence and timeline coverage.
