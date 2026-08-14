# Hook Guidelines

> How hooks are used in this project.

---

## Overview

Hooks coordinate React lifecycle with typed services or store actions. Pure
planning, validation and projection remain ordinary functions so they can run
without React and have deterministic tests.

---

## Custom Hook Patterns

- Accept effectful dependencies as parameters when the hook has non-trivial
  orchestration; resolve the shared registry through `useServices()` only at a
  clear UI boundary.
- Keep callbacks stable with `useCallback` when passed to effects or children.
- List every reactive input. Use refs only for mutable lifecycle ownership such
  as an AbortController or current run identity, not to hide stale dependencies.
- Clean up timers, workers, object URLs, subscriptions and abort controllers.
- Return typed commands/state; do not expose an unvalidated transport payload.

---

## Data Fetching

TanStack Query owns cacheable service reads and mutations under
`src/hooks/queries/`. Query keys are centralized in `keys.ts`. Long-running
production state and append-only run evidence are not modeled as a polling
query; they flow through their domain runtime and workspace store.

---

## Naming Conventions

- Hooks start with `use`; option factories do not.
- Mutation hooks describe the command (`useGenerateMockup`), while pure helpers
  describe the transformation without a `use` prefix.
- Keep one orchestration owner per workflow. Components may format a projection
  but must not reproduce the state machine.

---

## Common Mistakes

- Returning a fresh object/array from a Zustand external-store selector can
  cause a React snapshot loop; select primitives or use a stable projection.
- A fixed sleep is not readiness. Await an observable state/event and enforce a
  finite deadline.
- Replacing an AbortController without aborting the prior run permits stale
  completion to publish into the new project.
- A hook stub with no UI consumer is dead surface, not future-proofing.
