# Type Safety

> Type safety patterns in this project.

---

## Overview

The frontend uses strict TypeScript for compile-time contracts and Zod for every
untrusted or persisted runtime boundary. A TypeScript assertion never substitutes
for decoding native, Provider, storage, manifest or model output.

---

## Type Organization

- Keep public domain types beside the domain owner, not in a generic catch-all.
- Service I/O contracts live in `src/services/types.ts` or the owning service
  module; Provider contracts live under `src/services/ai/`.
- Component-only props stay in the component file and use `readonly` fields.
- Derive runtime-backed types with `z.infer` so schema and static shape cannot
  drift.

---

## Validation

- Prefer strict Zod objects and bounded strings/arrays at trust boundaries.
- Parse once at the owner boundary and pass typed values downstream.
- Validate complete current persisted shapes; do not silently fill removed
  fields for backward compatibility unless a migration is explicitly required.
- Sanitize Provider/native errors before persistence or display.

---

## Common Patterns

- Use discriminated unions for states, operations and receipts.
- Exhaustively switch on action/status unions; an unhandled value should fail
  TypeScript or a `never` assertion.
- Use explicit `isOk`/`isErr` guards for the shared `Result<T>` envelope.
- Use `satisfies` for fixtures and manifests when preserving literal types.

---

## Forbidden Patterns

- Do not cast raw JSON, invoke results, storage data or model output to the
  desired interface.
- Do not add `any` at cross-layer boundaries or duplicate ad hoc payload casts
  in multiple consumers.
- Do not make removed fields optional to keep stale persisted data compiling.
- Do not use `as unknown as` in production code to bypass an incompatible
  contract. Tests may use a narrow partial fixture only when the omitted surface
  is irrelevant and the assertion remains local.
