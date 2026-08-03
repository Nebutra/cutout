# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

<!--
Document your project's quality standards here.

Questions to answer:
- What patterns are forbidden?
- What linting rules do you enforce?
- What are your testing requirements?
- What code review standards apply?
-->

(To be filled by the team)

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

<!-- Patterns that should never be used and why -->

(To be filled by the team)

---

## Required Patterns

<!-- Patterns that must always be used -->

(To be filled by the team)

---

## Testing Requirements

<!-- What level of testing is expected -->

(To be filled by the team)

---

## Code Review Checklist

<!-- What reviewers should check -->

(To be filled by the team)

- [ ] Searched JavaScript, TypeScript, scripts, and CSS subpath imports before
      removing a package that appears unused.
- [ ] Vendored third-party source has license, version, checksum, provenance,
      and an upstream comparison.
- [ ] Dependency remediation removes the vulnerable node from the lockfile and
      dependency tree without a semver-incompatible override.
- [ ] Upstream-constrained alerts remain visible and are not described as fixed
      merely because they were dismissed or ignored.
