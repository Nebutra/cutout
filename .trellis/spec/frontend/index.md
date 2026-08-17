# Frontend Development Guidelines

> Executable conventions observed in the Cutout frontend.

---

## Overview

These guides document current repository boundaries and review rules. Feature-
specific contracts extend the general guides and take precedence when they are
more restrictive.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Filled |
| [Component Guidelines](./component-guidelines.md) | Component patterns, props, composition | Filled |
| [Hook Guidelines](./hook-guidelines.md) | Custom hooks, data fetching patterns | Filled |
| [State Management](./state-management.md) | Local state, global state, server state | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, dependency vendoring, and review checks | Filled |
| [Type Safety](./type-safety.md) | Type patterns, validation | Filled |
| [Cutout Pipeline](./cutout-pipeline.md) | `src/algorithm/` edge-matting contract & invariants | Filled |
| [BYOK User Copy](./byok-user-copy.md) | No billing-estimate copy; approval-notification & transport-error contracts | Filled |
| [BYOK Provider Protocols](./byok-provider-protocols.md) | Provider kind/protocol matrix, strict persistence, Rust auth, and read-only connection checks | Filled |
| [AI Rich-Text Artifacts](./ai-rich-text-artifacts.md) | Structured execution data with safe AI-authored Markdown review artifacts | Filled |
| [Provider-Tool Prompt Contract](./provider-tool-prompt-contract.md) | Separate bounded audit intent from complete Provider execution prompts | Filled |
| [Codex Plugin Infrastructure](./codex-plugin.md) | Self-contained plugin runtime, project binding, packaging and drift validation | Filled |
| [Prototype Route-Suite Generation](./prototype-generation.md) | Agent-authored route graphs, complete page generation, and cross-page visual consistency | Filled |
| [Desktop Release Pipeline](./release-pipeline.md) | Atomic cross-platform native builds, updater evidence, and GitHub Release publication | Filled |
| [Agent Control Safety](./agent-control-safety.md) | Durable claims, host-issued approval leases, controlled paths, governance evidence, and composite receipts | Filled |
| [Design OS Kernel](./design-os-kernel.md) | Canonical OutcomeGraph contracts, frozen authority, bounded scheduling, conformance, and replay | Filled |
| [Design OS Evidence Benchmark](./design-os-benchmark.md) | Versioned maturity stages, Profile projections, evidence-derived progress and release regressions | Filled |
| [Design Profile Platform](./design-profile-platform.md) | Declarative manifests, trusted registries, Universal Brief composition, lifecycle closure, and promotion gates | Filled |
| [Canvas + Agent Design OS](./design-os-workbench.md) | Agent-owned outcomes, Canvas production/review, secondary Project tools, and optional Workbench compatibility | Filled |
| [Commerce Production Profile](./commerce-production-profile.md) | Fact lineage, offline policy, cross-media evaluation, targeted repair, and evidence-tier benchmarks | Filled |
| [Game Asset Profile](./game-asset-profile.md) | Typed sprite-family roles, identity/scale/anchor locks, targeted repair, layered maps, and delivery | Filled |
| [Integration Brand Icons](./integration-brand-icons.md) | Local brand asset provenance, theme contrast, accessibility, and visual verification | Filled |

---

## Maintenance Rule

Update a guide only from an implemented, reviewed pattern. New cross-layer
contracts belong in a dedicated scenario guide with signatures, error behavior
and required tests; do not weaken an existing safety contract to describe WIP.

---

**Language**: All documentation should be written in **English**.
