# General Design OS desktop workbench

## Goal

Replace the prototype-shaped workspace with one quiet, efficient Design OS
workbench where designers and Builders can understand, create, compare, review
and deliver mixed spatial, interactive and temporal Outcomes through the same
underlying Project records.

## Requirements

- Keep one stable information architecture: Brief, Sources, Board, Review and
  Deliver. Workflow Profiles contribute graph fragments, semantic labels,
  renderer metadata and actions; they do not add global modes or navigation.
- Resolve a universal brief outcome-first and preview proposed deliverables,
  evidence, unknowns, constraints, costs and risks before spend. Profiles remain
  optional composable shortcuts rather than required user taxonomy.
- Generalize Output Canvas into an unframed semantic Board with heterogeneous
  artifact renderers for text, image, structured data, document, interactive
  state and media. Preserve dense scanning, comparison and precise direct edits.
- Add a semantic Timeline Lens for accepted shots/takes/ranges, audio, captions,
  overlays, locks, review markers and variants. It is not a full NLE.
- Project the same ChangeSet, ReviewThread, ActionQueue, approval, Milestone and
  Delivery records into Designer-friendly visual language and Builder-friendly
  structured/target detail. Lens switching never changes commands or authority.
- Route all direct manipulation and Agent edits through the semantic dispatcher.
  Optimistic preview may not commit stale or unauthorized changes.
- Support a mixed Project containing UI prototype, product-demo timeline,
  commerce/channel materials and delivery packages that share evidence/brand
  locks while retaining independent revision and review state.
- Add commerce only after benchmark/Profile proof and retain existing prototype
  workflows through adapters. Do not claim cloud collaboration, live Figma sync,
  web fetching or unavailable Provider/video capabilities.
- Virtualize and incrementally project large Boards, Timelines, histories and
  ActionQueues. Binary artifacts decode on demand; loading, unavailable, stale
  and invalid states never resize controls or masquerade as empty success.

## Acceptance Criteria

- [ ] W1: UI prototype and commerce Projects use identical shell/navigation;
      installing/removing a Profile changes graph projection only.
- [ ] W2: A mixed Project renders and navigates all required Outcome/artifact
      types without adding a workflow-specific app mode or reducer branch.
- [ ] W3: Equivalent Designer/Builder actions resolve to the same commands,
      ImpactSet, gates, approvals, conflicts, restore and merge result.
- [ ] W4: Board/Timeline direct edits and Agent proposals preview diff, cost and
      impact; stale, unauthorized or contract-expanding actions cannot commit.
- [ ] W5: Review annotations, ChangeRequests, ActionQueue, Milestones and
      Delivery status stay traceable to exact revisions across both lenses.
- [ ] W6: Shared evidence/lock changes surface only affected stale nodes and
      repair proposals; valid siblings do not regenerate or visually disappear.
- [ ] W7: Desktop commerce production uses normal secret custody, managed paths
      and explicit paid-action approval, and local delivery blocks invalid media.
- [ ] W8: Desktop/mobile visual checks prove no overlap, clipped controls or
      illegible artifact labels across long localized content and mixed media.
- [ ] W9: Generated scale fixtures stay within checked load/interaction/memory
      baselines using virtualization and incremental projection, with stable
      selection and controls while artifacts load or fail.

## Out Of Scope

- Marketing landing page, full Figma/Premiere/DAW replacement, remote presence,
  realtime co-editing or new Provider routes without Host proof.
