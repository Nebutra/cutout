# Design-Agent project and library management research

Inspected 2026-08-12. Product behavior below is limited to claims in official
documentation; architectural conclusions are Cutout proposals, not competitor
claims.

## Official evidence

### Figma: design-file authority with controlled branches

Sources:

- https://help.figma.com/hc/en-us/articles/360063144053-Guide-to-branching
- https://help.figma.com/hc/en-us/articles/31722591905559-Figma-Make-FAQs
- https://help.figma.com/hc/en-us/articles/23920389749655-Code-Connect

- Figma branches are controlled copies of a main file for design, prototype and
  library exploration. They track changes, support review with side-by-side or
  overlay comparison, resolve conflicts and merge into main; branch and merge
  create version-history checkpoints.
- Figma Make is managed as its own file type and supplies AI chat, point/edit,
  direct property manipulation, a code editor, code export and publishing.
- Figma Design tools are not directly integrated into Make. A Make preview can
  be copied back as Design layers, but subsequent Design edits do not update
  the Make file and those layers are not automatically bound to the design
  system.
- Code Connect bridges repository components into Dev Mode rather than making
  generated design layers and production code one lossless shared state.

Useful pattern: isolated exploration, visual diff, review and merge match
designer expectations. Gap: Design, Make and code remain bridged products, so
round trips can become detached projections.

### Builder.io: repository authority with visual change delivery

Sources:

- https://www.builder.io/c/docs/fusion-projects-overview
- https://www.builder.io/c/docs/visual-editor-ai

- Fusion Projects connect to an existing repository, use additional design
  system repositories for component and convention context, and deliver visual
  changes through normal pull requests.
- The same project flow is presented to designers, PMs and developers through
  a visual editor, preview, code generation, review and merge.
- Visual Editor AI stages generated/edited content for explicit Accept/Reject
  and can use registered tokens, custom components, templates and Symbols.

Useful pattern: repository, branch/PR, preview and checks respect Builder
expectations. Gap for a general Design OS: the repository/app remains the
dominant outcome, while non-code designed outcomes need a broader authority.

### Canva: brand governance and scaled variants

Sources:

- https://www.canva.com/help/brand-kit/
- https://www.canva.com/help/brand-control/
- https://www.canva.com/help/publish-team-template/
- https://www.canva.com/help/bulk-create/

- Brand Kits centralize official logos, colors, fonts and assets. Brand
  Controls can restrict available fonts/colors and require approval before
  publishing.
- Brand Templates promote reviewed designs for team reuse, while Bulk Create
  binds structured data to elements to create many variants.

Useful pattern: constraints, templates, approvals and bulk variants are
first-class design operations rather than prompt guidance. Gap: this is a strong
design-operations model but not a code/repository change model.

### Lovable: released, versioned design-system projects

Source:

- https://docs.lovable.dev/features/design-systems

- A design system is a dedicated project and source of truth combining React
  components, a machine-readable schema/guidelines and installation rules.
- Only released design-system versions can be connected. Consumers record the
  connected version, receive an `Update available` prompt, explicitly accept an
  update and run setup/adherence verification.
- Current attachment copies files into the consumer, one project can connect to
  at most one design system, and accepting an update replaces managed copies.

Useful pattern: release before consume, version pinning, accepted updates and
adherence checks fit both library and package-manager mental models. Gaps:
single-library restriction and file-copy attachment limit composition and make
copy ownership important.

### v0: one deployable app shared by many conversations

Source:

- https://v0.dev/docs/projects

- A Project is one cohesive app to which many chats contribute. It shares a
  filesystem, deployment, hosting, domains, environment variables, integrations
  and repository binding.
- Folders merely organize chats; Projects control the production destination.

Useful pattern: conversation is not the project and multiple Agent threads can
contribute to one durable authority. Gap: Project identity is coupled to one
application/deployment and does not naturally represent several heterogeneous
design Outcomes.

### Replit: project editor across plans, tasks, design and build

Source:

- https://docs.replit.com/learn/projects-and-artifacts/project-editor

- The Project Editor combines Agent threads, an ordered/approved Plan mode,
  task-board states, live preview and a Design Canvas.
- The Design Canvas supports visual mockup refinement before Agent turns it into
  a working app. The Project also owns version control, checkpoints and
  publishing concerns.
- A requested project type is optional; the user may describe the result and
  let Agent choose a setup.

Useful pattern: one project can expose visual and Builder surfaces, while plans,
tasks and previews make Agent work legible. Gap: the documented flow still
describes committing a design into code, rather than both being projections of
one domain-neutral outcome model.

## Cross-product synthesis

The strongest recurring primitives are:

| Designer mental model | Builder mental model | Shared Cutout primitive |
| --- | --- | --- |
| Project/campaign | Repository/product | `Project` with multiple Outcomes |
| Exploration/branch | Branch/worktree | `ChangeSet` from an exact base revision |
| Canvas/preview | Runtime preview | Presentation lens over candidate revisions |
| Visual compare | Diff | Semantic command + artifact diff |
| Brand Kit/library | Package/registry | Published `LibraryRelease` dependency |
| Component/template | Component/module | Typed reusable library entry |
| Review/approval | Checks/review | Evaluation gates + revision-bound approval |
| Publish/export | Merge/deploy | Exact `DeliveryManifest` and target receipt |
| Version history | Commit/history | Immutable revision/command/run ledger |

No inspected product fully unifies these semantics across heterogeneous design
outcomes. Figma/Make exposes a visible one-way seam; Builder/v0/Lovable/Replit
make a code project or deployable app the primary authority; Canva handles brand
governance and scaled creation well but not repository delivery.

## Recommendation for Cutout

### Existing Cutout foundation

Cutout already implements most of the release/lock substrate; the recommendation
must evolve it rather than create a parallel library system:

- `src/global-library/contracts.ts:76` defines immutable versioned items with a
  content hash, typed artifacts, dependencies, compatibility, quality receipts
  and lineage; required dependencies close over exact id/version/hash at
  `src/global-library/contracts.ts:153`.
- `src/global-library/contracts.ts:130` defines project references locked to an
  exact version/hash and update states including `update-available`.
- `src/global-library/store.ts:15` admits only approved, hash-valid content;
  `src/global-library/store.ts:19` attaches a locked project reference;
  `src/global-library/store.ts:20` reports a newer version without changing the
  lock; and `src/global-library/store.ts:31`/`:32` preserve update/fork lineage.
- `src/global-library/blob-store.ts:10` stores content-addressed bytes locally
  and verifies media hashes.
- `src/global-library/store.test.ts:13` already proves a project remains on
  `1.0.0` when `1.1.0` becomes available, while `:14` proves traced fork rather
  than an unowned copy.

Therefore `LibraryRelease` should be the Design OS role/name for an approved
immutable `GlobalLibraryItem` release and its dependency closure, while
`ProjectLibraryReference` remains the lock primitive. The missing layer is a
ChangeSet-driven update resolver and projection, not another catalog protocol.

### Durable hierarchy

```text
Workspace
  +-- Project
  |     +-- ChangeSet
  |     |     +-- Outcome revisions
  |     |     +-- semantic command/visual diff
  |     |     +-- evaluation + approval
  |     +-- accepted OutcomeGraph
  |     +-- Delivery manifests and receipts
  +-- Published Library releases
```

- `Workspace` owns membership, policy and a catalog; it is not design state.
- `Project` owns EvidenceGraph and one multi-outcome OutcomeGraph. Chat threads,
  boards and code views contribute to it but do not define its identity.
- `ChangeSet` is the common collaboration unit. A Designer Lens calls it an
  exploration and shows candidates, visual diffs, comments and impact. A
  Builder Lens shows base revision, semantic commands, affected outputs,
  checks, preview and target diff. Both operate on the same record.
- `Outcome` is independently revisioned/reviewed/delivered inside the Project.
- `DeliveryManifest` is the only authority to project accepted Outcomes to
  files, repositories, preview environments or other exact targets.

### Cross-project reuse

Do not allow a Project to depend on another Project's mutable head. Allow a
Project to publish an immutable Global Library item as a `LibraryRelease`, then
consume one or more releases by exact version and content hash. A library can
contain typed design
materials, tokens, components, patterns, identity locks, templates, policy
fragments, evaluation rules and production recipes.

Consumption behaves like both a design library and a package lockfile:

1. resolver closes the existing item dependencies, verifies/materializes their
   blobs into project CAS/offline cache and records existing project locks;
2. a newer release creates `UpdateAvailable`, not automatic propagation;
3. update preview resolves compatibility, semantic/visual diff and ImpactSet;
4. accepting the update creates a normal ChangeSet and follows approval rules;
5. detach/fork converts the exact locked release into project-owned material
   with retained origin lineage.

Support several composable references with explicit precedence and conflict
diagnostics. Retire automatic-mutation semantics for this Design OS path: even a
compatible update becomes a ChangeSet proposal. This improves on both
snapshot-only imports and unsafe live links, avoids Lovable's one-library/file-
copy limitations, and preserves the current Cutout no-mutation lock behavior.

### Design and code authority

Do not claim lossless live bidirectional design/code sync. `.cutout` Design IR,
OutcomeGraph and provenance remain authoritative for Cutout design state. A
connected repository is authoritative for its code and may enter Cutout as
versioned evidence/source context. Code generation is a reviewed target
projection into an exact branch/commit/PR binding with receipts. Later code
changes return only through explicit ingestion and a new ChangeSet, never by
silently rewriting design state.

### UX rule

Do not introduce global Designer and Developer product modes. Keep the stable
Brief/Sources/Board/Review/Deliver shell and change the presentation lens by
selected object and task:

- Board/Timeline emphasize visual authorship and alternatives;
- Review unifies visual/semantic diff, comments, checks and approval;
- Deliver exposes manifests, preview builds, generated-file diff and target
  receipts when a code or deployment target exists;
- advanced provenance and command details remain inspectable without forcing
  designers to understand Git or hiding exact revisions from Builders.
