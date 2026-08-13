# Launch Cutout official website - technical design

## Surface boundary

The official site is a dependency-free static surface under `website/`. It owns
only public product copy, presentation, public product evidence and links to the
GitHub release authority. It does not import the desktop React tree, contact a
Provider, read local credentials or mutate `.cutout` state.

The desktop repository remains the correct home because the product contract,
brand assets, UI captures and release lifecycle are versioned here. A separate
top-level directory and build output prevent website files from entering Vite's
desktop entry or Tauri resources.

## Content and interaction

The page has four outcome bands:

1. a product-first hero with a real Cutout workbench;
2. an inspectable intent-to-delivery production flow;
3. real output views for systems, routes, assets and delivery evidence;
4. local-first trust and platform download actions.

Small progressive enhancements own the mobile menu, active journey stage,
capture switching and platform-aware primary download label. The document is
fully readable with JavaScript disabled. Animations use transforms/opacity only
and stop under `prefers-reduced-motion`.

Public image inputs are reviewed captures copied and compressed from the
repository's visual evidence. Website images carry explicit intrinsic dimensions,
responsive sizes and meaningful alt text. Product screenshots are not placed in
nested decorative cards.

## Release authority

The public releases page is the durable fallback and latest-release authority.
Static platform download URLs use GitHub's `/releases/latest/download/<stable
artifact name>` form only when the filename is stable; otherwise the primary CTA
opens `/releases/latest`. The site never derives or advertises a working-tree
version.

## Deployment boundary

GitHub Actions is the deployment authority. The workflow uses organization-scoped
Vercel and Cloudflare credentials, resolves or creates one project named
`cutout`, deploys the `website/` directory, binds `cutout.nebutra.com`, and then
upserts a proxied Cloudflare CNAME to Vercel. Secret bodies are never printed.

The deployment embeds `GITHUB_SHA` as a public revision marker before build and
smokes that exact marker after DNS propagation. An old 200 response therefore
cannot certify the new deployment.

## Validation and rollback

Local validation checks files, HTML structure, safe links and prohibited claims.
Playwright renders desktop/mobile pages, checks horizontal overflow, keyboard
navigation, controls and nonblank screenshots. Production smoke checks DNS,
TLS, canonical metadata, the revision marker and release links.

Rollback is a Vercel promotion to the preceding immutable deployment. DNS remains
on the same dedicated project, so content rollback does not require a second DNS
mutation. If first-time DNS binding fails, the existing NXDOMAIN state remains
truthful and no desktop release is affected.
