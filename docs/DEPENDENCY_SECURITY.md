# Dependency security status

Last reviewed: 2026-08-06.

## JavaScript

`pnpm audit --prod` reports no production vulnerabilities. The workspace pins
the compatible patched transitive releases `postcss@8.5.23` and
`undici@7.29.0` in `pnpm-workspace.yaml`; both are build/test-only paths through
Vite and jsdom. A full `pnpm audit` is expected to report zero advisories.

Do not remove these overrides until every parent resolves an equal or newer
patched version. Dependency review must check both `pnpm why` and the lockfile,
not only direct entries in `package.json`.

## Rust desktop stack

The all-target dependency graph currently resolves `glib@0.18.5` through the
Linux GTK/WebKit stack:

```text
tauri 2.11.4
  -> tauri-runtime-wry / wry
  -> webkit2gtk 2.0.2 / gtk 0.18.2
  -> glib 0.18.5
```

This is an upstream ABI family, not a direct Cutout dependency. Overriding only
`glib` to `0.20` would introduce incompatible duplicate GTK bindings rather than
remediate the runtime. Upgrade it only as part of a Tauri/Wry/WebKitGTK release
that moves the complete Linux binding family, then run locked macOS, Linux and
Windows test/check matrices before describing the alert as resolved.

The 2026-08-06 lockfile review also upgraded `crossbeam-epoch` to `0.9.20`,
`event-listener` to `5.4.2`, `plist`/`quick-xml` to `1.10.0`/`0.41.0`, and
`tauri-plugin-log` to `2.9.0`. Those compatible updates removed the actionable
`RUSTSEC-2026-0204`, `RUSTSEC-2026-0194`, `RUSTSEC-2026-0195`,
`RUSTSEC-2026-0221`, and `RUSTSEC-2026-0235` findings instead of adding them to
an exception list.

CI installs `cargo-audit@0.22.2` with `--locked` and runs `pnpm audit:rust`
against `src-tauri/Cargo.lock`. The gate fails every vulnerability and every
unsoundness advisory except the reviewed upstream
`RUSTSEC-2024-0429` / `GHSA-wrw7-89jp-8q8g` for the exact
`glib@0.18.5` tuple above, prints that exception, and fails for every other
unsound package/version tuple. Cargo's non-blocking maintenance warnings remain
visible in the raw report but are not security-vulnerability exceptions. Do not broaden or suppress this
exception; remove it when the complete upstream ABI family is upgraded.
