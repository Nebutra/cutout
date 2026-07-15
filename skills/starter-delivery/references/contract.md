# Starter Delivery Contract

## Status

- Capability status: `available`
- Agent operations: `export.starter`
- MCP tools: `cutout_plan_starter_export`, `cutout_export_starter`

## Requirements

- Verified component evidence
- Approved routes and assets
- Approval id for export

## Produced Evidence

- Starter plan
- Routes and components
- Managed export receipt
- Framework registry metadata

## Limitations

- Next App Router, Vite React, Nuxt, and TanStack Start
- No screenshot-to-code inference
- Managed destinations only

## Framework Contracts

- Nuxt uses native Vue SFC components, file-based pages, `nuxt.config.ts`,
  Design Kit CSS, public assets, and build/typecheck scripts.
- TanStack Start uses React components, an explicit TanStack Router route tree,
  Vite entry, Design Kit CSS, public assets, and build/typecheck scripts.
- All frameworks consume the same verified Design IR, component manifest,
  tokens, assets, and prototype routes.

## Invariants

- Pin the current Design IR revision.
- Preview before approved apply.
- Keep credentials host-owned.
- Claim only authoritative evidence.
