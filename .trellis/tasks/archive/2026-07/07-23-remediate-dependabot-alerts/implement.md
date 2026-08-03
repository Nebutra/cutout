# Dependabot remediation implementation

## Implementation checklist

- [x] Vendor `shadcn` 4.12.0's complete Tailwind support stylesheet and MIT
      license under `src/styles/`, with version and source provenance.
- [x] Point `src/index.css` at the local stylesheet.
- [x] Remove `shadcn` from `package.json` and regenerate `pnpm-lock.yaml`.
- [x] Vendor the library-only VTracer 0.6.5 source under
      `src-tauri/vendor/vtracer`, preserving upstream licenses and provenance.
- [x] Change `src-tauri/Cargo.toml` to the local VTracer path and regenerate
      `src-tauri/Cargo.lock` without Clap 2 or `atty`.
- [x] Confirm the `glib` dependency remains unchanged and document it as the
      single upstream-constrained alert.

## Verification result

- Frontend: production build, lint, Agent contract, and all Vitest suites pass
  (`338` files; `1672` passed and `15` skipped tests).
- Rust: full offline tests pass (`112` passed and `1` ignored), updater binary
  tests pass (`3`), and offline Cargo check succeeds.
- Dependency checks confirm no shadcn, MCP SDK, Hono server, Clap 2, or `atty`
  entries remain. `glib` remains exclusively in the Linux Tauri/GTK tree.
- Independent review found and corrected one provenance wording issue; no code
  behavior or license findings remain.

## Validation

```bash
pnpm install --lockfile-only
pnpm why @hono/node-server
pnpm build
pnpm test
pnpm lint
pnpm agent:validate
cargo tree --manifest-path src-tauri/Cargo.toml --target all -i atty@0.2.14
cargo tree --manifest-path src-tauri/Cargo.toml --target all -i glib@0.18.5
cargo test --manifest-path src-tauri/Cargo.toml local_vtracer_converts_png_bytes_to_svg
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
```

`pnpm why` and `cargo tree -i atty` are expected to report no dependency path.
The glib tree is expected to remain and must still point only through the Linux
Tauri/GTK stack.

## Review gates

- Compare the vendored CSS body against the installed 4.12.0 source.
- Compare the vendored Rust library modules against the published 0.6.5 crate.
- Verify no product code imports or invokes the shadcn CLI/MCP runtime.
- Verify no Rust call site changes or vectorization algorithm edits slipped in.
- Confirm GitHub Dependabot closes Hono and atty after the pushed lockfiles and
  leaves glib open.
