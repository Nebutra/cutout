# Launch Cutout official website

## Goal

Design, verify and deploy the official Cutout product website at
`cutout.nebutra.com`. The site must make the real desktop product and its
outcome-oriented asset-production workflow understandable in the first viewport,
then send visitors only to verified public release artifacts.

## Requirements

### Product truth

- Position Cutout as an Agent-native Design OS for turning natural-language
  intent and source material into coherent Design Systems, complete route suites,
  reusable non-UI assets/slices and reviewable delivery packs.
- Use real Cutout brand assets and product captures. Do not substitute a generic
  SaaS illustration or claim cloud collaboration, web search, live Figma sync,
  video processing or a headless Provider as shipped.
- Explain the local-first credential boundary plainly: supported local Agent and
  Provider credentials are discovered or configured on-device and remain in the
  native layer; the website never receives them.
- Do not promise fixed Design System, page or asset counts. The Agent derives
  scope from user intent and domain best practice.

### Experience

- The first viewport names Cutout, presents the literal product category and
  shows a legible real application surface while leaving a visible cue for the
  next section.
- Organize the page around the production journey and outputs rather than a grid
  of generic feature cards. Make Design Systems, route topology, visual assets,
  slicing and verified delivery individually inspectable.
- Provide an accessible responsive navigation, semantic landmarks, keyboard
  focus, reduced-motion behavior and stable layout from 360px mobile through
  wide desktop.
- Keep the palette faithful to the black/white Cutout identity while using the
  approved brand green and restrained secondary accent colors to distinguish
  states and avoid a one-note monochrome page.

### Release and operations

- Download actions resolve through the latest immutable GitHub Release for
  `Nebutra/cutout`; do not publish a link to an unverified local candidate.
- Produce a standalone static site under `website/` so website code and assets do
  not enter the Tauri desktop bundle.
- Add deterministic local validation for HTML semantics, internal links, asset
  existence, capability copy and release URLs.
- Add a repository-owned deployment workflow that builds and deploys the exact
  `main` revision to a dedicated Vercel project, binds
  `cutout.nebutra.com`, and upserts the Cloudflare CNAME without logging secret
  values.
- Deployment must fail truthfully when project/domain/DNS authorization is
  missing. It must never claim success based only on an old page returning 200.

## Acceptance Criteria

- [ ] AC1: Desktop and mobile screenshots show a polished, non-overlapping first
      viewport with the Cutout product and real UI as the dominant signal.
- [ ] AC2: The production journey accurately represents intent-driven planning,
      Design System variants, complete route suites, semantic asset production,
      slicing and provenance-backed delivery without hardcoded output counts.
- [ ] AC3: Every product claim is supported by the Agent capability contract or
      current implementation, and local credential custody is described without
      exposing a secret or implying a hosted Provider.
- [ ] AC4: Navigation, disclosures, links, focus states and reduced-motion mode
      work at 360x800, 768x1024, 1440x900 and a wide desktop viewport.
- [ ] AC5: Website validation and visual/browser checks pass; screenshots and a
      nonblank rendered-page pixel check are retained as review evidence.
- [ ] AC6: The production deployment is bound to a dedicated Vercel project and
      `cutout.nebutra.com` resolves through Cloudflare, returns HTTP 200, serves
      the expected revision marker and publishes the correct canonical/OG data.
- [ ] AC7: Download links lead to the latest verified Cutout release and platform
      artifacts; an unpublished desktop candidate is never represented as live.

## Out Of Scope

- Accounts, billing, telemetry, newsletter collection or a hosted Cutout runtime.
- New desktop capabilities, release versioning or bypassing the packaged E2E
  release gate owned by the active convergence task.
