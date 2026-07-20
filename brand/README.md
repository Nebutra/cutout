# Cutout Brand Package

This directory is the repository-side consumption package for the approved
Cutout identity: symbol candidate 13 (Offset aperture) with wordmark candidate
15 (Cut/out contrast). It exists so application code and AI agents consume the
same reviewed geometry instead of recreating a logo from context.

## Directory Roles

- `canonical/`: approved masters and normative identity specifications.
- `derivatives/`: deterministic runtime and platform derivatives.
- `evidence/`: rendered review evidence; never a production source.
- `brand-asset-manifest.json`: checksums, provenance, dependency and consumer
  mapping.
- `AGENTS.md`: mandatory AI consumption rules.
- `LICENSES.md`: rights and clearance boundary.

## Runtime Use

React code must render `src/components/brand/CutoutBrandMark.tsx`. Browser copies
under `public/brand/`, the favicon, and Tauri icons are generated consumers, not
editable masters.

```sh
pnpm brand:sync
pnpm brand:check
```

The brand check fails on missing or changed assets, stale consumer copies,
undeclared SVG geometry changes, or any reintroduced `Scissors` component in
product source.

The platform app icon is the reviewed borderless derivative. Do not restore an
exterior black frame or replace the paper surface with transparent black art;
both fail across macOS Dock appearances.
