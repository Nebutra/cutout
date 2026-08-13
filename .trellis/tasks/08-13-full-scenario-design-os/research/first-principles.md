# First-principles derivation

## Problem restatement

Users need one trustworthy place to turn incomplete intent and heterogeneous
evidence into coherent designed outcomes, even when production crosses several
media and specialized tools.

The problem is not "support every file format". File formats are outputs. The
problem is preserving intent, decisions, identity, dependencies, evidence,
quality and delivery authority across the entire design lifecycle.

## Fundamental truths

1. **Design is constrained choice.** Generating bytes is insufficient; users must
   compare alternatives and decide which revision satisfies whose need under
   which constraints.
2. **Outcomes are heterogeneous.** Copy, interfaces, sprites, maps, packaging,
   video and 3D scenes do not share one useful editing model.
3. **The lifecycle is homogeneous.** Every domain has sources, intent, plans,
   candidates, revisions, evaluation, decisions, repair and delivery.
4. **Generation is probabilistic and often costly.** Scope, authorization,
   budgets, retry and acceptance cannot live in prompts.
5. **Dependencies create change cost.** A shared identity or fact change should
   invalidate exactly its dependents, not trigger a project-wide rebuild.
6. **Delivery is an external effect.** An accepted artifact is not the same as
   an approved Outcome or an applied target delivery.
7. **No team can rebuild every specialist editor.** An OS succeeds by governing
   and connecting capabilities, not by duplicating all of them poorly.
8. **The scenario universe is open.** A finite switch statement cannot represent
   future design practices; extension must be versioned, constrained and tested.

## Derived architecture

The truths require:

- a universal graph/lifecycle Kernel;
- plural typed domain IRs;
- declarative Profile closures that compose those IRs into Outcomes;
- a semantic workbench over shared state;
- bounded Host capabilities and target adapters;
- content-addressed evidence/artifacts and revision-bound decisions;
- a cross-profile conformance and maturity benchmark.

No additional layer is justified unless it satisfies one of the truths above.

## Assumptions rejected

- **"All scenarios require one mega-canvas."** False. A canvas is one projection;
  time, structure, rules and target state need different representations.
- **"All artifacts need one universal schema."** False. Shared envelopes and
  relations can be universal while payload schemas remain domain-specific.
- **"A Profile is an app mode."** False. One Project may compose several Profiles;
  modes would fragment state and history.
- **"More tools make the OS more capable."** False. Unverified tools broaden
  attack surface and ambiguity; semantic capabilities with exact contracts make
  it capable.
- **"Generated means complete."** False. Completion is derived from accepted
  revisions, passing evaluation and delivery closure.
- **"Full-scenario means native low-level editing everywhere."** False. That goal
  is economically unbounded and structurally prevents focus on cross-tool truth.

## Coverage axes

A Profile should be classified by the stress it adds, not its industry label:

- semantic: facts, language, policy, structured documents;
- spatial: raster/vector composition, layout, layers, physical dimensions;
- interactive: states, components, routes, behavior;
- temporal: shots, tracks, ranges, continuity and audio;
- computational: code/runtime/engine contracts and validation;
- physical/target: print, packaging, fabrication, channel or engine delivery.

The reference Profiles should collectively cover these axes. Adding a second
Profile that stresses the same axis does not prove generality as strongly as an
orthogonal workload.

## Design OS litmus test

Cutout is acting as an OS when it can answer, from durable evidence:

- What are we trying to make, for whom, and why?
- What facts, constraints, rights and unknowns govern it?
- Which Outcomes and dependencies define done?
- Which capabilities can execute the plan here, under what authority and budget?
- Which candidates were considered and why was this revision accepted?
- What failed, what must be repaired, and what remains valid?
- What exactly was delivered to which target, and from which accepted closure?
- What becomes stale when evidence, identity, policy or target requirements change?

If a scenario cannot answer these questions through the common records, it is an
integration demo, not a Design OS Profile.
