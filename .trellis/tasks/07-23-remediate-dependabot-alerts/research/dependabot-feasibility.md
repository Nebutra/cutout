# Dependabot remediation feasibility

Date: 2026-07-23

## Executive conclusion

Two of the three open alerts can be removed without weakening Dependabot or
forcing incompatible dependency versions:

| Alert | Current chain | Feasibility | Recommended action |
| --- | --- | --- | --- |
| `@hono/node-server` 1.19.14 | `shadcn` 4.12.0 -> `@modelcontextprotocol/sdk` 1.29.0 -> `@hono/node-server` | Remediable | Vendor the shadcn Tailwind support CSS that the app actually uses, change the CSS import to the local file, then remove the `shadcn` package and regenerate the pnpm lockfile. |
| `atty` 0.2.14 | `vtracer` 0.6.5 -> `clap` 2.34.0 -> `atty` | Remediable | Vendor a reviewed, library-only patch of `vtracer` 0.6.5 with its CLI target and `clap` dependency removed. Preserve upstream licenses and source provenance. |
| `glib` 0.18.5 | Tauri Linux GTK/WebKit stack -> GTK 0.18 -> `glib` 0.18 | Upstream-constrained | Keep the alert open and track Tauri/GTK migration. Do not override `glib` to 0.20 or remove Linux support merely to clear the alert. |

GitHub currently reports the Hono and glib alerts as medium severity and the
atty alert as low severity. Hono is fixed in 2.0.5, glib is fixed in 0.20.0,
and atty has no patched release.

## Hono chain and the real shadcn usage

### Evidence

- `package.json` declares `shadcn` 4.12.0 as a production dependency.
- `pnpm why` resolves the vulnerable chain exclusively as:
  `cutout -> shadcn -> @modelcontextprotocol/sdk -> @hono/node-server`.
- There are no JavaScript or TypeScript imports of the `shadcn` package, no
  repository script that invokes its CLI, and no Cutout runtime use of its MCP
  implementation.
- The package is nevertheless not entirely unused: `src/index.css` imports
  `shadcn/tailwind.css`. The installed subpath resolves to
  `shadcn/dist/tailwind.css`, a 629-line MIT-licensed Tailwind support sheet.
- Current vendored UI components depend on definitions from that stylesheet,
  including `data-open`, `data-closed`, `data-disabled`, `data-horizontal`,
  `data-vertical`, and `data-active` variants. Removing the package without
  replacing this import can silently change generated CSS and UI state styles.
- Other `shadcn` strings are not package usage. `components.json` is CLI/editor
  metadata, the UI components under `src/components/ui` are copied source, and
  `shadcn.adapter-plan.json` is Cutout's own generated adapter-plan format.
- Cutout's generated `tailwind.css` design-kit artifacts are also unrelated to
  the npm package. They are produced by `src/design-kit/compiler.ts` and remain
  part of the Agent capability/export contract.
- Upgrading alone does not resolve the chain. As checked on 2026-07-23,
  `shadcn` 4.14.0 still depends on MCP SDK `^1.26.0`; MCP SDK 1.29.0 still
  depends on `@hono/node-server ^1.19.9`, while the security fix is on the
  incompatible Hono 2.x line.

### Safe removal sequence

1. Copy the currently consumed `shadcn/dist/tailwind.css` into a clearly named
   local stylesheet under `src`, retaining an MIT attribution and the upstream
   package/version or source commit in a provenance comment.
2. Change only `src/index.css` from the package subpath import to the local
   stylesheet. Keeping the full stylesheet is safer than extracting only the
   currently observed variants because future copied shadcn components may use
   another standard helper from the same file.
3. Remove the `shadcn` package from `package.json` and regenerate
   `pnpm-lock.yaml`. Future component updates can use an explicitly versioned
   one-shot CLI (`pnpm dlx shadcn@<version>`) rather than retaining the CLI and
   MCP server in the shipped dependency graph.
4. Verify the production build, component tests, visual/state styling, and
   `pnpm why @hono/node-server` returning no path. Because this touches the
   package-backed CSS import, a build-only check is insufficient; exercise open,
   closed, disabled, horizontal, vertical, and active component states.

Do not use a pnpm override to force `@hono/node-server` 2.x beneath MCP SDK
1.x. That crosses a declared major-version boundary and tests a dependency
combination its owner did not declare.

## atty chain and the minimum reliable vtracer remedy

### Evidence

- `src-tauri/Cargo.toml` depends on `vtracer` 0.6.5.
- Cutout uses only the Rust library API: `vtracer::ColorImage`,
  `vtracer::Config::default()`, and `vtracer::convert(...)` in
  `src-tauri/src/commands/vectorize.rs`.
- `cargo tree --target all -i atty` resolves exactly:
  `atty -> clap 2.34.0 -> vtracer 0.6.5 -> app`.
- In the published `vtracer` source, `clap` is used only by `src/main.rs`, the
  command-line binary. The library modules (`lib`, `config`, `converter`, and
  `svg`) do not import it. However, upstream declares `clap = 2.33.3` as an
  unconditional package dependency, so Cargo retains `atty` even when Cutout
  only calls the library.
- Upstream PR [visioncortex/vtracer#118](https://github.com/visioncortex/vtracer/pull/118)
  upgrades the CLI from clap 2 to clap 4 and removes atty from that branch. It
  remains open and is sourced from contributor fork commit
  `cea70ee91d2309c8508d3c5de010333b22d7c827`.

### Recommended minimum change

Vendor a library-only copy/patch of `vtracer` 0.6.5 and point Cargo to it with
a local path or `[patch.crates-io]` entry. The vendored crate should:

- retain only the upstream library modules and the dependencies they use
  (`fastrand`, `image`, and `visioncortex`);
- omit/disable the CLI binary and remove `clap`, which removes `atty` without
  altering Cutout's call sites or vectorization algorithm;
- include both upstream `LICENSE-MIT` and `LICENSE-APACHE` files plus a short
  provenance/patch note that records the original crates.io version and
  checksum; and
- be validated by the existing PNG-to-SVG test, Rust tests/checks on all three
  supported OS targets, and `cargo tree --target all -i atty` returning no path.

This is smaller and more behavior-preserving than reimplementing VTracer
directly on `visioncortex`: the VTracer library contains roughly 500 lines of
configuration, transparency keying, clustering, and SVG serialization logic
beyond a simple facade. It is also safer than pinning production to an
unreviewed contributor fork. Once an official upstream release removes clap 2,
the local patch can be deleted and the registry dependency restored.

## glib 0.18 and the Tauri/GTK upstream constraint

### Evidence

- `cargo tree --target all -i glib@0.18.5` shows that glib is required throughout
  the Linux-only Tauri stack: Tauri -> GTK 0.18.2 / WebKitGTK -> glib 0.18.5,
  with additional paths through `muda`, `tao`, `wry`, GDK, Cairo, Pango, and
  related gtk-rs crates.
- The repository actively builds and publishes Linux: CI runs Ubuntu jobs and
  `.github/workflows/release-update.yml` produces x86_64 AppImage and deb
  artifacts. This is not a stale target dependency that can be deleted without
  a product decision.
- The project currently resolves Tauri 2.11.4. The latest stable release checked
  on 2026-07-23 is Tauri 2.11.5, published 2026-07-01, and its normalized and
  source manifests still explicitly require `gtk = "0.18"` on Linux.
- GTK 0.18.2 in turn explicitly requires the 0.18 series of glib, gio, cairo,
  GDK, Pango, and the rest of its gtk-rs family.
- Tauri's current development branch also still declares GTK 0.18. Therefore a
  routine upgrade from Tauri 2.11.4 to 2.11.5 does not clear the alert and there
  is no released compatible Tauri/GTK dependency line to select today.

### Why overrides are unsafe

The patched glib line begins at 0.20.0, outside GTK 0.18's semver requirement.
Forcing glib 0.20 independently is not a lockfile refresh: gtk-rs crate types
must remain version-coherent across GTK, GDK, Gio, Cairo, Pango, WebKitGTK, Wry,
and Tauri. A successful migration would require coordinated upstream releases
or maintaining a large fork of the Linux desktop stack.

The practical action is to leave this alert visible, document that it is a
Linux transitive dependency, and monitor Tauri/gtk-rs for a supported migration.
Closing it today would require one of two disproportionate product choices:
removing Linux distribution or owning a cross-project GTK/Tauri fork. Neither
should be taken solely to make the alert count reach zero.

## Proposed implementation boundary

The next remediation change should close the Hono and atty alerts together,
with dependency-tree assertions and the existing build/test gates. The glib
alert should remain open with an upstream-tracking rationale. No alert should
be dismissed as "fixed", and no incompatible override should be used.
