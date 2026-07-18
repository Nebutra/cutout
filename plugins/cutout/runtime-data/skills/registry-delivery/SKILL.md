---
name: registry-delivery
description: Discover verified Cutout components, patterns, templates and starters, then preview and apply an open-code install without overwriting user modifications.
---

# Registry Delivery

Use this skill when an external Agent needs reusable Cutout source delivered
into the controlled project repository.

Read the deeper contract only after selecting this skill.

## Supported outcomes

- Browse verified registry item summaries.
- Search by text, item kind, and target framework.
- Inspect one complete item manifest.
- Preview exact file and dependency intent.
- Apply an explicitly approved conflict-free install.
- Read the durable install receipt.
- Plan a safe update of an item installed previously.

## Discovery

Call `cutout_registry_list` before generating replacement UI.

Use `cutout_registry_search` when the desired item is known.

Search results are metadata, not executable code.

Use `cutout_registry_get` to inspect provenance, license, compatibility,
quality receipts, token references, Design IR references and preview assets.

Do not assume the newest version is compatible with the target framework.

## Planning

Call `cutout_registry_plan_install` with an item ID and framework.

The plan reports every controlled project-relative target path.

Review create, update, unchanged and three-way-conflict statuses.

Review item version, file hashes and framework compatibility.

Do not treat a generated plan as an approval.

Do not supply a destination directory or arbitrary registry path.

## Apply

Obtain an opaque approval ID for the reviewed plan.

Call `cutout_registry_apply_install` with the same item and framework.

Cutout resolves and verifies the item again immediately before writing.

If the target changed after preview, stop and create a new plan.

If any three-way conflict exists, preserve the user's file and request a
manual decision. Never overwrite it automatically.

The installer writes only hash-verified registry files.

It cannot write `.cutout` control state as an item target.

## Update

The installed-origin ledger stores item ID, version and base file hashes.

An unchanged installed base can be updated after preview and approval.

A locally modified file must become a three-way conflict.

The v1 installer does not silently merge source code.

Prefer preserving local ownership over forcing registry parity.

## Receipts

Read the receipt with `cutout_registry_install_receipt`.

The receipt binds plan ID, item/version, approval ID, completion time and
resulting file hashes.

A receipt proves installation, not application behavior or visual parity.

Run package, build, interaction, accessibility and visual gates separately
when required by the item's quality contract.

## Source and network boundaries

The core resolver supports bundled, local and HTTP host descriptors.

It never performs an HTTP request itself.

An HTTP source requires an injected host that owns authentication, rate limits
and transport policy.

The default CLI and MCP catalog is fixed below the selected project's
`.cutout/registry/items` directory.

## Truthful availability

Next App Router and Vite React are supported only on items declaring them as
target frameworks.

Nuxt and TanStack remain adapter-required until executable consumer fixtures,
quality gates and receipts exist.

Do not claim a public marketplace, remote registry sync, package publication,
automatic dependency installation or semantic ranking unless the active host
explicitly advertises and proves those capabilities.
