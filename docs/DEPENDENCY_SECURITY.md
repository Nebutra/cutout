# Dependency security status

Last reviewed: 2026-08-05.

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
