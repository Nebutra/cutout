---
name: cutout-controller
description: Control a local Cutout design project through its verified MCP contract. Use when the user asks Codex to inspect, validate, ingest into, export from, or read deliverables from a Cutout project.
---

# Cutout Controller

Use Cutout as an external controller. `.cutout` Design IR and provenance are
authoritative; generated exports are projections.

## Start Safely

1. Call `cutout_controller_handshake` to bind this session to the host-selected
   project. If it returns `project-binding-required`, stop and explain that the
   local plugin needs `CUTOUT_PROJECT_ROOT` configured before a new session.
2. Call `cutout_capabilities_status`. Treat its limitations and operation modes
   as authoritative.
3. Call `cutout_skills_list`, select the narrowest available workflow, then call
   `cutout_skill_read` before using domain tools.
4. Use `cutout_project_context`, `cutout_list_materials`, and `cutout_validate`
   to establish the current revision and evidence.

## Mutating Work

- Submit the user's outcome with `cutout_outcome_submit`; material/source refs
  are opaque Cutout ids, never file bytes or arbitrary host paths.
- Always call the matching `cutout_plan_*` or other dry-run tool first.
- Present the exact plan, effects, provenance, hashes, policy, and limitations.
- Apply only when the user explicitly approves that reviewed plan and the host
  supplies a host-issued approval lease bound to the previewed operation. Never
  invent a lease, mint one in the controller, or weaken policy.
- Read the result back with `cutout_deliverables_read` and validate again.

## Boundaries

Do not claim live Figma sync, URL fetching or web search, video processing,
cloud collaboration, arbitrary shell/filesystem access, or a bundled provider
executor. A recorded run is not proof that a design or exported artifact was
produced; only verified deliverable metadata and hashes establish completion.
