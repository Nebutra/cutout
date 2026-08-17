# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

Quality is evidence proportional to the changed boundary. Static checks are the
floor; workflow work must prove state transitions, failure behavior and final
artifacts. Tests may use deterministic Provider fixtures but must not bypass the
production orchestration or claim an unexecuted live integration.

## Dependency And Vendoring

### Convention: Separate generators from shipped dependencies

Before retaining a CLI or generator package in `dependencies`, search every
usage surface, including CSS imports and package subpath imports:

```bash
rg -n 'package-name|package-name/' package.json src scripts
```

Copy-in systems such as shadcn can leave checked-in component source and build
support assets behind without requiring the generator CLI or its server-side
dependency graph in the shipped application. If Cutout consumes a static asset
from such a package, preserve that asset before removing the package.

Wrong:

```css
/* Removing the dependency makes this import fail or silently drops variants. */
@import "generator-package/support.css";
```

Correct:

```css
/* The local file records the exact upstream version, checksum, and license. */
@import "./styles/generator-support.css";
```

The vendored file must include source/version provenance, retain the upstream
license, and be compared against the declared upstream artifact during review.
Run a frozen install and production build after regenerating the lockfile.

### Convention: Library-only patches for CLI-only transitive vulnerabilities

When Cutout uses only a Rust library API but the published crate declares a
vulnerable CLI dependency unconditionally, prefer a small reviewed local
library-only package over an incompatible override or an unmerged fork pin.

The local package must:

- preserve the upstream library modules and public API used by Cutout;
- omit only unused binary, binding, and CLI-only dependency surfaces;
- retain all upstream licenses plus the crates.io version, archive checksum,
  and source commit in a provenance file; and
- remain removable when an official corrected release becomes available.

Required assertions include a source diff for retained modules, focused
behavior tests, offline Cargo check/test, and inverse dependency-tree checks
showing that the vulnerable package no longer resolves.

---

## Forbidden Patterns

- Invented approvals, credentials, capability evidence, progress or delivery.
- Unbounded network/model waits, retrying every error, fixed sleeps for readiness.
- Direct secrets in browser state, logs, manifests, receipts or test snapshots.
- Arbitrary filesystem paths, shell interpolation or unvalidated native payloads.
- Shipping TODO/WIP scaffolds with no current consumer.
- Weakening a schema or policy to make a failing fixture pass.

---

## Required Patterns

- Preview before approved apply and bind execution to exact revision/digest evidence.
- Finite deadlines, cancellation propagation and semantic retry classification for
  every remote operation.
- Strict runtime decoding at persistence, Provider, native and model boundaries.
- Shared source-of-truth projections for readiness, recovery and UI display.
- Sanitized errors and content-addressed/provenance-bound artifact receipts.

### Convention: Decode binary views across renderer realms

Browser, worker, VM and WebView boundaries may create a valid typed-array view
whose constructor belongs to another realm. A realm-local `instanceof
Uint8Array` check can therefore misclassify real bytes as a Blob and fail only
at the native persistence handoff.

Wrong:

```ts
if (content instanceof Uint8Array) return content
return new Uint8Array(await content.arrayBuffer())
```

Correct:

```ts
if (ArrayBuffer.isView(content)) {
  return new Uint8Array(content.buffer, content.byteOffset, content.byteLength)
}
return new Uint8Array(await content.arrayBuffer())
```

Binary repository tests must include one typed array created in another realm and
assert the exact bytes passed to the native bridge.

---

## Testing Requirements

- Pure domain changes: focused unit tests including invalid/empty boundaries.
- Cross-layer workflow changes: integration tests through the real service/store/UI
  path and assertions on complete declared output, cancellation and failure.
- Visual interaction changes: Playwright geometry, keyboard/focus and representative
  desktop/mobile coverage.
- Agent surface changes: `pnpm agent:validate`; locale copy changes: `pnpm i18n:ci`.
- Release/native changes: frontend build/tests, locked Rust test/check and release
  contract checks on applicable target matrices.

---

## Code Review Checklist

- [ ] Behavioral claims have direct test, receipt or explicitly labeled external evidence.
- [ ] Complete output is checked against the Agent-authored plan or manifest.
- [ ] Error, timeout, retry, cancellation and restart paths were reviewed.
- [ ] Secrets, paths, approvals and revisions preserve their trust boundaries.
- [ ] New abstractions have a current consumer and do not preserve retired behavior.
- [ ] Optional Provider fields are not inferred from generic protocol compatibility.
- [ ] Searched JavaScript, TypeScript, scripts, and CSS subpath imports before
      removing a package that appears unused.
- [ ] Vendored third-party source has license, version, checksum, provenance,
      and an upstream comparison.
- [ ] Dependency remediation removes the vulnerable node from the lockfile and
      dependency tree without a semver-incompatible override.
- [ ] Upstream-constrained alerts remain visible and are not described as fixed
      merely because they were dismissed or ignored.
