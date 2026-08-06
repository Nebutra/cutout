# Directory Structure

> How frontend code is organized in this project.

---

## Overview

Cutout uses domain-first modules under `src/`. React presentation lives under
`src/components/`; reusable UI primitives are the narrower
`src/components/ui/` layer. I/O contracts live in `src/services/`, durable
workspace state in `src/store/`, and native calls in `src/platform/`.

---

## Directory Layout

```
src/
├── components/          # React surfaces and domain-specific view components
│   ├── ui/              # shared primitive controls
│   └── workspace/       # interactive production workflow
├── hooks/               # shared React orchestration hooks
│   └── queries/         # service-backed TanStack Query hooks/options
├── services/            # typed I/O contracts and reviewed implementations
│   ├── ai/              # Provider and generation boundary
│   └── local/           # offline/native-backed implementations
├── store/               # Zustand workspace state and slices
├── prototype/           # route/design-system generation domain
├── asset-production/    # asset plans, adapters and executors
├── design-ir/           # authoritative Design IR projection and validation
├── platform/            # Tauri/native bridge
├── prompts/             # versioned prompt catalog
└── locales/             # Lingui catalogs
```

---

## Module Organization

- Put domain contracts, pure transforms and tests in a top-level domain folder.
- Put React rendering in the closest `components/<surface>/` folder; do not
  move domain authority into a component for convenience.
- Put native and remote effects behind `services/` or `platform/`, never direct
  `invoke`/fetch calls scattered through components.
- Keep tests beside their owners. Cross-layer `.e2e.test.tsx` files belong at
  the UI boundary they exercise; Playwright specifications live in
  `tests/visual/`.
- Use `@/` imports across modules and relative imports within a tight module.

---

## Naming Conventions

- Domain modules and non-component files use kebab-case.
- React component files use PascalCase when exporting the named component.
- Tests use `.test.ts`, `.test.tsx`, `.integration.test.ts` or `.e2e.test.tsx`
  according to the boundary exercised.
- Local service implementations use `*.local.ts`; shared contracts do not use
  a future-facing `remote` abstraction until a consumer exists.

---

## Examples

- `src/prototype/` owns candidate, route-suite and Design Markdown contracts.
- `src/asset-production/` separates plans, adapters and execution evidence.
- `src/design-ir/` validates and projects the authoritative repository format.
- `src/components/agent-workspace/` keeps event projection separate from UI.
