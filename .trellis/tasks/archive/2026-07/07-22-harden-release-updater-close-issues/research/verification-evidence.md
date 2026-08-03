# Verification Evidence

Date: 2026-07-22

- Focused integrated Vitest: 17 files, 111 tests passed.
- Full Vitest: 335 files passed, 6 skipped; 1647 tests passed, 15 skipped.
- Rust: 104 library tests and 3 updater-signature binary tests passed.
- Release-critical Playwright: 2 tests passed across `desktop-chrome` and
  `mobile-chrome`.
- Integration smoke: 2 files, 14 tests passed.
- `pnpm agent:validate`, TypeScript, lint, production build, Cargo check/fmt,
  release authority/version validation, workflow YAML parsing, and
  `git diff --check` passed.
- Lingui extraction is clean across all five locale catalogs (556 messages,
  zero missing translations).
- PR #14 merged as `1fad5677251644d49f9668fde29447467d7d6ff6` after
  all 14 checks passed on Linux, macOS, and Windows with Node 22 and 24.
- The first post-merge Windows Node 24 contract run exposed concurrent
  browser/process/compiler test starvation. Vitest is now capped at two file
  workers on Windows only, with a cross-platform configuration contract test.
- pnpm resolves `fast-uri 3.1.4`; `pnpm audit --prod` no longer reports that
  high-severity advisory. The remaining production audit item is the upstream
  `@hono/node-server` 1.x advisory described in the hardening evidence.

No release was published by this hardening task. Security fixes are merged to
source before issue closure and ship in a subsequent signed release.
