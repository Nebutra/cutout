---
name: notion-delivery
description: Import a user-selected shared Notion page/database as brief evidence, or preview and publish approved Design/Brand guideline pages through an authorized Notion connector host.
---

# Notion Delivery

Use this skill only when a Notion connector host is installed and the user selected a page, database, or parent page.

1. Discover connector status; credentials remain an opaque `SecretHandle` owned by the host.
2. Preview the selected page tree before import. Review title, last-edited revision, block count, unsupported blocks, provenance, and license.
3. Apply the reviewed `SourcePatch` only against the same Design IR revision.
4. For delivery, generate Design System or Brand guideline Markdown, preview the block plan, then require explicit approval before publishing to the selected parent page.
5. Treat verified webhooks only as deduplicated stale signals and refetch authoritative content.

Never claim complete workspace search, access to unshared content, exact Notion rendering, generic bidirectional sync, or webhook payloads as snapshots.

Read [the contract](references/contract.md) only when executing this skill.

## Trigger

Use this skill when the user asks to:

- import a specific Notion brief or requirements page;
- import one explicitly selected database or data source;
- publish Design System documentation to Notion;
- publish Brand VI guidelines to Notion;
- inspect whether a previously imported page became stale.

Do not use this skill for general web browsing or workspace discovery.

## Discovery

First inspect the Integration SDK registry.

The built-in catalog may report `host-required`.

That means Cutout implements the adapter contract but does not bundle an HTTP
client, OAuth flow, token store, or user credentials.

After a connector host is injected, the adapter reports
`authorization-required` until the host supplies an opaque `SecretHandle`.

Never request, print, persist, or return the underlying token.

## Import workflow

Require a user-selected page or database locator.

Run preview against the current Design IR revision.

Review the normalized resource title, external reference, last-edited version,
block count, unsupported block warnings, license, and provenance.

Pagination cursors are opaque. Do not parse or construct them.

The connector host must honor Notion `Retry-After` responses.

Apply only the exact preview `reviewId` against the same revision and locator.

The result is an additive `SourcePatch`; it does not overwrite existing needs,
tokens, components, brands, or generated deliverables.

## Publish workflow

Prepare Design System or Brand VI guideline Markdown from verified Cutout
deliverables.

Create an export preview before attempting publication.

Require an explicitly selected parent page, title, preview approval, and the
same Design IR revision.

The host creates one child page containing supported normalized blocks.

Do not silently update an existing page or arbitrary page properties.

Return the published page reference as a receipt target, never as proof of
pixel-perfect parity with Cutout.

## Webhooks

Webhook signature verification belongs to the connector host.

Require `signatureVerifiedByHost: true` and a delivery ID.

Deduplicate delivery IDs because delivery is at least once.

Treat the event only as a stale-object signal.

Refetch the authoritative selected object before proposing any new patch.

## Safety

Do not claim access to private or unshared pages.

Do not claim complete workspace search.

Do not claim generic bidirectional sync or real-time co-editing.

Do not infer unsupported block properties or promise lossless rendering.

Do not publish without explicit approval.

Do not expose OAuth refresh tokens or internal integration tokens.

Use manual conflict handling when the remote last-edited version diverges.
