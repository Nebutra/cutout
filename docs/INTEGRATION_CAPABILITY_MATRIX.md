# Integration Capability Matrix

Status: verified implementation baseline, 2026-07-12. Product rows retain their
official boundaries; implementation status is stated explicitly and links
point to first-party product documentation only.

Production acceptance is receipt-driven. Without an authorized host or opaque
secret handle, the smoke result is `capability-required`; no row below implies
bundled credentials, active quota, or a deployed cloud provider.

## Product boundary

Cutout has two deliberately separate extension directions:

1. **Cutout control plane:** Codex, Claude Code, or another external coding
   agent discovers Cutout's Skills and invokes Cutout's versioned CLI/MCP
   operations. The agent is the client; Cutout does not embed or bundle it.
2. **Product integrations:** Cutout connects to Figma, Notion, GitHub, and
   other products through each vendor's documented API, SDK, plugin, file, or
   MCP surface. Credentials remain connector-host owned. Every import/export
   is previewed, provenance-bearing, revision-guarded, and explicitly approved
   before an external write.

These directions can be composed, but must not be represented as the same
capability. A coding agent operating Cutout may ask an installed connector to
prepare an export; it does not gain the connector's credential or arbitrary
access to the third-party product.

## Summary

| Product | Verified official surfaces | Practical Cutout posture | Phase |
| --- | --- | --- | --- |
| Figma | REST API, Plugin API, OAuth 2, webhooks, Variables and Dev Resources APIs | Snapshot adapter and installable foreground plugin bridge; no REST sync host | Host-gated |
| Notion | Public API, OAuth, webhooks | Host-injected import and approved page publish | Authorization required |
| GitHub | REST, GraphQL, GitHub Apps, OAuth Apps, webhooks, Checks/Actions | Host-injected repository context and review-PR publish | Authorization required |
| Obsidian | Local vault files, Plugin API, URI scheme | Local Markdown knowledge adapter and optional vault plugin | P2 |
| Pencil (`pencil.dev`) | `.pen` JSON format, local MCP, CLI | File/MCP design interchange; no assumed cloud connector | P2 |
| Paper (`paper.design`) | Desktop-local MCP, paste/snapshot workflows | Local MCP read/write bridge; no assumed cloud connector | P2 experimental |
| Framer | Plugin API, Server API, code components/overrides, OAuth, publishing | Site/CMS import and approved staging/publish workflow | P2 |
| Canva | Apps SDK, Connect APIs, OAuth 2, webhooks, Design/Export/Asset APIs | In-editor Cutout app plus external asset/design/export connector | P2-P3 |

## Figma

**Official surface.** The [REST API](https://developers.figma.com/docs/rest-api/)
reads file/node structure, images, components/styles, comments, versions and
team/project resources; specialized endpoints cover Variables and Dev
Resources. The [Plugin API](https://developers.figma.com/docs/plugins/)
executes in the Figma editor and can inspect and mutate the current document,
create nodes, variables, components and UI. Figma supports
[OAuth 2](https://developers.figma.com/docs/rest-api/oauth2/) and personal
access tokens for REST clients, plus
[webhooks](https://developers.figma.com/docs/rest-api/webhooks/) for subscribed
file/team events. Figma publishes a useful
[API comparison](https://developers.figma.com/compare-apis/) because REST and
Plugin capabilities are not interchangeable.

**Read/write boundary.** REST is the right surface for remote snapshots,
rendered images, comments, versions, variables/dev resources and event-driven
refresh. It is not a general remote canvas mutation API. Node-level creation,
layout mutation, component/instance manipulation and editor selection belong
in a user-installed plugin. REST write endpoints are resource-specific rather
than arbitrary file editing.

**Auth, rates and events.** OAuth scopes or a user PAT govern REST access;
plugin permissions are declared in its manifest and run in the signed-in
editor context. REST rate limits vary by endpoint tier, Figma plan and seat and
return `429`; clients must honor the documented limit headers and backoff
([rate limits](https://developers.figma.com/docs/rest-api/rate-limits/)).
Webhooks are at-least-once external events in practice: Cutout must verify the
passcode, deduplicate, and refetch authoritative state rather than treating an
event payload as the document.

**Cutout use.** Import authorized file/node snapshots into Design IR with
stable Figma IDs and provenance; export verified tokens/variables and binding
plans; use a Cutout Figma plugin for previewed node-level apply; consume
webhooks only to mark a source stale and schedule reconciliation. Code Connect
metadata may enrich component evidence but cannot prove visual parity by
itself.

**Do not claim.** No live collaborative cursor/CRDT mirror, arbitrary remote
node writes via REST, background access beyond granted scopes, or lossless
round-trip of unsupported Figma properties. Cutout currently has only
caller-provided snapshot adaptation, not this live connector.

## Notion

**Official surface.** The [Notion API](https://developers.notion.com/reference/intro)
supports pages, blocks, data sources/databases, users, comments, search and
file uploads. Public integrations use
[OAuth](https://developers.notion.com/docs/authorization); internal
integrations use a workspace token and still require pages to be shared with
the integration. [Webhooks](https://developers.notion.com/reference/webhooks)
deliver changes for accessible content.

**Read/write boundary.** Cutout can read shared briefs, requirements,
databases and page trees; it can create/update pages, append/update supported
blocks, update data-source rows/properties, add comments and upload supported
files. Access is capability- and sharing-scoped. Search is not a promise of
complete workspace traversal, and unsupported or read-only block properties
cannot be round-tripped.

**Auth, rates and events.** Use OAuth for a multi-tenant Cutout connector and
store refresh/access tokens only in the connector host. Notion documents an
average limit of three requests per second per integration and supplies
`Retry-After` on `429` responses
([request limits](https://developers.notion.com/reference/request-limits)).
Verify webhook signatures, acknowledge quickly, deduplicate event IDs, then
retrieve current objects; webhook delivery is a change signal, not a full
snapshot.

**Cutout use.** Import selected pages/databases as needs, stories, copy and
decision evidence; preserve block IDs and last-edited versions; preview a
delivery report, brand guideline, design-system documentation or asset index
before publishing it to a chosen parent page. A sync should be field-mapped
and conflict-aware, not generic bidirectional page mirroring.

**Do not claim.** No access to unshared/private workspace content, pixel-perfect
Notion rendering, arbitrary page property writes, real-time co-editing, or
webhook-driven state without reconciliation.

**Cutout implementation status.** The P1 `cutout.notion` Integration SDK adapter
is implemented behind an injected connector host. Discovery reports
`host-required`; an injected host reports `authorization-required` until an
opaque OAuth/internal-integration `SecretHandle` is present. It supports
selected page/database retrieval, paginated block normalization to a reviewed
`SourcePatch`, Design/Brand guideline export plans, approved child-page
publication, `Retry-After` propagation, and host-verified webhook delivery-ID
deduplication as a stale signal. It does not bundle credentials or an HTTP
client and does not implement workspace-wide search or generic two-way sync.

## GitHub

**Official surface.** GitHub exposes the
[REST API](https://docs.github.com/en/rest),
[GraphQL API](https://docs.github.com/en/graphql),
[GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps),
[OAuth Apps](https://docs.github.com/en/apps/oauth-apps), and
[webhooks](https://docs.github.com/en/webhooks). Git itself remains the best
surface for a checked-out repository; Actions and Checks provide CI/status
surfaces.

**Read/write boundary.** A GitHub App can be installed on selected repositories
with granular read/write permissions. Cutout can read repository trees,
commits, issues, pull requests, releases and checks; create branches/commits,
PRs, comments, checks and release assets when the installation grants those
specific permissions. Large or stateful repository work should use Git/data
APIs carefully instead of treating Contents API calls as a transaction.

**Auth, rates and events.** Prefer a GitHub App: short-lived installation
tokens, explicit repository selection and granular permissions are a better
fit than broad user OAuth. OAuth is appropriate only for genuinely user-level
actions. Primary and secondary limits vary by auth/resource; observe rate
headers, `Retry-After` and abuse/secondary-limit responses
([rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)).
Verify webhook signatures, use delivery IDs for idempotency, queue processing,
and refetch before applying changes.

**Cutout use.** Import a selected repository as technical constraints and
component evidence; link Design IR revisions to commits; publish generated
starter/component changes to a Cutout-owned branch and open a preview PR;
attach visual QA and provenance as checks/artifacts; ingest issue/PR feedback
as new needs. Every write should show repository, branch, file set and diff.

**Do not claim.** No arbitrary organization/repository access, automatic merge,
secret access, unreviewed default-branch writes, or exactly-once webhook
delivery. External coding-agent control of Cutout remains separate from this
GitHub connector.

**Implemented P1 adapter.** `cutout.github` provides selected-repository
inventory, issue/PR feedback import, and previewed branch/commit/PR/check
publish plans through an opaque GitHub App installation `SecretHandle`.
Apply requires explicit approval and repository-head CAS. Default-branch
writes and merge remain forbidden. Webhook signatures are host-verified,
delivery IDs are deduplicated, and primary/secondary limits are structured.

## Obsidian

**Official surface.** Obsidian vaults are ordinary local folders whose notes
are Markdown and attachments. Obsidian documents a local
[Plugin API](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin),
[Vault API](https://docs.obsidian.md/Reference/TypeScript+API/Vault), and
[Obsidian URI](https://help.obsidian.md/Extending+Obsidian/Obsidian+URI).
The file format relies on Markdown plus Obsidian conventions such as internal
links, embeds, properties and canvas files.

**Read/write boundary.** A desktop-local adapter can read/write files only
inside a user-selected vault root. A plugin can use Obsidian's vault and
metadata APIs and react to workspace/vault events. URI actions are useful for
opening or creating a note but are not a complete structured integration API.

**Auth, rates and events.** There is no general official cloud REST/OAuth API
for arbitrary vault content. Local filesystem permission or plugin installation
is the authorization boundary; there is no vendor rate-limit contract. Use
filesystem/plugin events as hints, debounce bursts, hash content, and guard
against symlinks/path traversal and self-triggered write loops.

**Cutout use.** Import selected notes, canvases and attachments as research,
needs and provenance; export Design/Brand Kit Markdown and an artifact index
into an approved Cutout subfolder; optionally ship an Obsidian plugin for
selection-aware import and backlink/status views.

**Do not claim.** No Obsidian cloud account API, remote vault sync, guaranteed
Markdown semantic parity, or write access without explicit local vault choice.

## Pencil (`pencil.dev`)

The name is ambiguous. This row refers specifically to the current design
product at [pencil.dev](https://www.pencil.dev/) and its first-party
[documentation](https://docs.pencil.dev/), not Pencil Project, Apple Pencil,
or other similarly named products.

**Official surface.** Pencil documents a JSON-based, portable, Git-friendly
[` .pen` file](https://docs.pencil.dev/core-concepts/pen-files), a local
[MCP integration](https://docs.pencil.dev/getting-started/ai-integration), a
[documented file format](https://docs.pencil.dev/for-developers/the-pen-format),
and [Pencil CLI](https://docs.pencil.dev/for-developers/pencil-cli). Its MCP
server runs locally while Pencil is running and allows supported agents to read
and modify open design files. The official docs describe Claude Code, Codex,
Cursor and other MCP clients.

**Read/write boundary.** `.pen` interchange and supported MCP/CLI operations can
read, analyze, create and modify structured design content. The published docs
state that `.pen` is JSON-based, but Cutout must still validate format/version
and preserve unknown fields. MCP tool availability is runtime-discovered, not
hard-coded from marketing examples.

**Auth, rates and events.** Pencil activation and local MCP availability are
separate from AI-provider authentication; current docs describe Claude Code
authentication for Pencil AI features. Local MCP is the access boundary. No
official public cloud OAuth, webhook, or rate-limit contract was confirmed, so
none should be invented.

**Cutout use.** Import/export `.pen` through staged files with schema/version
checks, or let an external agent coordinate Cutout MCP and Pencil MCP as two
independent local servers. Use Pencil as a structured design target, not as a
hidden rendering backend.

**Do not claim.** No cloud synchronization API, remote unattended access,
stable undocumented MCP tools, or lossless support for future `.pen` versions.

## Paper (`paper.design`)

The name is ambiguous. This row refers only to the design application at
[paper.design](https://paper.design/), not Dropbox Paper, Meta Paper, FiftyThree
Paper, academic-paper services, or generic document formats.

**Official surface.** Paper documents a desktop-local
[MCP server](https://paper.design/docs/mcp) that starts when a file is opened
and supports reading and writing design files from Cursor, Claude Code, Codex
and other MCP clients. The official documentation also describes
[paste/import workflows](https://paper.design/docs/paste),
[tokens](https://paper.design/docs/tokens), and its
[Snapshot extension](https://paper.design/snapshot-extension).

**Read/write boundary.** The confirmed programmable boundary is the tools
advertised by the running local MCP server for the open Paper file. Paper says
the MCP supports both reads and writes and can synchronize tokens or real
content. Cutout should negotiate tools at runtime and preview a Design IR patch
before asking Paper to mutate the file.

**Auth, rates and events.** The documented manual endpoint is local streamable
HTTP (`127.0.0.1`) and requires the Paper desktop application/open file. No
general cloud REST API, OAuth flow, webhook contract, public SDK, file-format
stability promise, or rate-limit schedule was confirmed in the official docs.

**Cutout use.** Coordinate Cutout and Paper as independent local MCP servers;
transfer approved tokens/content/asset references and read selected structured
design evidence back into Design IR. Snapshot/paste is suitable for explicit
one-shot ingestion, not an implicit live sync.

**Do not claim.** No background cloud connector, unattended file access,
arbitrary MCP methods, stable public file parser, or collaborative live mirror.

## Framer

**Official surface.** Framer provides an in-editor
[Plugin API](https://www.framer.com/developers/plugins-introduction), including
site, canvas/node, CMS, style, asset, font and code-file operations; a
[Server API](https://www.framer.com/developers/server-api-introduction) for
server-side project/CMS workflows; React
[Code Components](https://www.framer.com/developers/components-introduction)
and overrides; plugin [OAuth](https://www.framer.com/developers/oauth); and
documented [publishing](https://www.framer.com/developers/publishing).

**Read/write boundary.** An installed plugin operates in the user's editor
context and declared permissions. It can create and update supported canvas,
CMS, style, asset and code resources. Server API access is token/project scoped
and should be used only for operations explicitly exposed by that API. A Framer
component is executable React code, not a lossless representation of arbitrary
Design IR.

**Auth, rates and events.** Plugin permissions and user context govern editor
access; OAuth is for a plugin's connection to external services. Server-side
credentials must stay in the connector host. Treat `429`/service errors with
backoff and use Framer's published API/changelog rather than assuming a fixed
undocumented quota. No general webhook contract should be claimed unless the
specific Server API resource documents it.

**Cutout use.** Import selected CMS/site structure and reusable design evidence;
export verified tokens, assets, code components and CMS content through a
Cutout Framer plugin; preview staging changes and require a distinct approval
for publish. Retain Framer node/resource IDs and publish receipts.

**Do not claim.** No invisible editor automation, arbitrary project access,
lossless Figma/Design IR conversion, or automatic production publish.

## Canva

**Official surface.** Canva exposes an in-editor
[Apps SDK](https://www.canva.dev/docs/apps/), external
[Connect APIs](https://www.canva.dev/docs/connect/),
[OAuth 2](https://www.canva.dev/docs/connect/authentication/), and
[webhooks](https://www.canva.dev/docs/connect/webhooks/). Connect APIs include
design, asset, export, folder and brand-template-oriented workflows; Apps SDK
capabilities operate inside a Canva design and are declared by the app.

**Read/write boundary.** A Canva app can add/import supported content and use
the design/editor capabilities granted to it. A Connect integration can manage
supported assets/design workflows, request exports, and use authorized brand
template/autofill operations where the account and scopes permit them. Many
exports and asset jobs are asynchronous; job completion must be polled or
event-driven according to the endpoint contract.

**Auth, rates and events.** External Connect clients use OAuth authorization
code flow with PKCE and scoped tokens. Apps run in Canva's app context and use
SDK capability/permission declarations. Respect endpoint-specific limits,
`429`, retry headers and asynchronous job status
([rate limits](https://www.canva.dev/docs/connect/api-reference/rate-limit/)).
Verify webhook signatures, deduplicate notifications, and fetch authoritative
resource/job state.

**Cutout use.** Build two explicit adapters: an Apps SDK experience that sends
approved Cutout assets/templates into the current Canva design, and a Connect
connector for asset upload, design creation/autofill, export jobs and delivery
receipts. Brand-template use must preserve template/design IDs and licensing
provenance.

**Do not claim.** No arbitrary Canva document-tree access, unsupported
pixel-level edits, access to brand templates without entitlement/scope,
synchronous export completion, or silent publishing.

## Recommended delivery order

### P1: evidence and delivery connectors

- Figma authorized snapshot import plus variables/dev-resource reconciliation;
  retain plugin-mediated node write as a separate capability.
- Notion selected-page import and previewed delivery-page publish.
- GitHub App repository import, Cutout branch/PR publish and visual-QA checks.
- Shared connector foundation: OAuth/token custody, capability negotiation,
  preview/apply receipts, revision guards, provenance, webhook inbox,
  idempotency and conflict UI.

### P2: editor-local bridges

- Figma and Framer plugins for editor-context writes.
- Obsidian local vault adapter/plugin.
- Pencil `.pen` adapter plus runtime-discovered local MCP bridge.
- Paper local MCP bridge, explicitly experimental until its public contract is
  versioned sufficiently for compatibility tests.

### P3: distribution surfaces

- Canva Apps SDK experience and scoped Connect API connector.
- Framer staging/publishing flow and Canva asynchronous exports.
- Cross-product delivery recipes built from atomic connector Skills; never a
  universal `sync everything` operation.

## Required Cutout invariants

Every future integration should expose the same product-level lifecycle:

```text
connect / select source
  -> capability and scope discovery
  -> read-only preview into a provenance-bearing patch
  -> user-visible result and conflict summary
  -> explicit approval for write or external side effect
  -> revision-guarded apply
  -> immutable receipt plus external resource/version IDs
  -> webhook/poll reconciliation
```

- Credentials are host-owned, redacted, least-privilege and never stored in
  Design IR, Skill inputs, MCP payloads, generated repos or receipts.
- Import/export/sync/publish are separate atomic Skills. A connector Skill must
  disclose supported object types, scopes, side effects, limits and gaps before
  an external agent invokes it.
- Vendor events only mark data stale; they never bypass preview, policy,
  revision guards or approval for an external write.
- Unsupported properties remain explicit opaque evidence or produce a gap;
  adapters must not invent equivalence.
- Local MCP servers (Pencil/Paper) and Cutout MCP remain independent principals.
  An external agent may orchestrate both, while Cutout preserves its own policy
  and approval boundary.
