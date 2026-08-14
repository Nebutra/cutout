# Design Profile Platform

> Declarative Profile packaging, trusted binding resolution, proposal composition,
> lifecycle preview, conformance, and evidence projection outside the Kernel.

## Scenario: Admit And Use An Exact Profile Closure

### 1. Scope / Trigger

Apply when adding a design scenario through `src/design-profile-platform/`:
decoding a Profile manifest, resolving an installed closure, invoking a trusted
binding, compiling a Universal Brief, previewing lifecycle changes, loading a
Project Bundle, or proposing a finding for shared Platform/Kernel ownership.

This is an internal extension contract. It does not add a public Agent operation,
authorize Provider work, mutate a Project, or implement live remote capabilities.

### 2. Signatures

```ts
createDesignProfileManifest(input): Promise<DesignProfileManifest>
decodeDesignProfileManifest(input): Promise<DesignProfileManifest>
resolveProfileClosure(input): Promise<ProfileClosure>
decodeProfileClosure(input): Promise<ProfileClosure>

collectProfileProposals({ brief, profiles, compilers, closure }): Promise<ProfileProposalCollection>
composeProfileProposals({ graph, proposals }): ComposedProfileProposals

previewProfileLifecycle(input): Promise<ProfileLifecyclePreview>
assertProfileLifecycleChangeSet(input): Promise<ProfileLifecyclePreview>
createProfileProjectRecord(input): Promise<ProfileProjectRecord>
createProfileProjectBundle(input): Promise<ProfileProjectBundle>
decodeProfileProjectBundle(input): Promise<ProfileProjectBundle>

auditProfileExtension(input): ProfileExtensionAudit
assertProfileCrossHostParity(left, right): void
createProfilePromotionPacket(input): Promise<ProfilePromotionPacket>
verifyProfilePromotionPacket({ packet, proofs, registry }): Promise<ProfilePromotionEnvelope>
decodeProfilePromotionEnvelope(input): Promise<ProfilePromotionEnvelope>
assertProfilePromotionChangeSetHandoff(input): Promise<ProfilePromotionEnvelope>
evidenceBenchmarkAdapters.verifyAndProject(reference, retainedEvidence): Promise<EvidenceBenchmarkProjection>
```

### 3. Contracts

- A strict `design-profile.manifest.v1` contains declarative references only.
  Nested ids and free text cannot carry code, commands, origins, filesystem
  paths, credentials, approvals, or authority claims. Trusted `ownerId` values
  exist only in application/Host registration records. Test fixtures remain in
  test modules and never appear as manifest evidence references.
- Manifest and closure hashes cover canonical normalized content. Closure
  resolution follows exact root id/version/hash references, includes only
  reachable dependencies, rejects cycles and conflicting Profile versions, and
  binds exact Kernel compatibility, implementation hashes, and Library locks.
- Compiler, evaluator, renderer, inspector, semantic-action, delivery,
  evidence-benchmark, and Outcome-scorecard registries own executable code.
  Registry entrypoints strictly decode and freeze cloned inputs, strictly decode
  outputs, and reject owner/hash, schema, artifact, Profile, or ruler drift.
- A trusted implementation digest binds executable function source, runtime
  schemas and behavior-defining constants. Hashing an id/version label, copying a
  manifest digest, or registering an empty compiler is not implementation proof.
- A compiler selection must exist in the supplied installed closure. Each
  compiler receives the same deeply frozen Universal Brief and is invoked twice;
  mutation or canonically different replay results fail closed. Ranking and
  composition never install, authorize, execute, or mutate Project authority.
- Equal-precedence semantic conflicts remain explicit blockers. Missing optional
  bindings degrade visibly to read-only; missing required bindings block exact
  content. Unknown artifacts retain identity, provenance, and raw metadata.
- Lifecycle operations are content-addressed previews with
  `mutatesProject=false` and `requiresChangeSet=true`. Install, upgrade, and
  remove bind an exact successor closure and preserve all unrelated roots.
  Disable does not require production capabilities. The handoff recomputes the
  preview hash and checks the exact Project revision and successor closure hash.
- Project records bind active closure roots to installed-history references.
  Project Bundles retain exact closure bytes for every installed Profile,
  including disabled or removed historical content, and decode every closure
  before any caller can use the Project.
- Protected Kernel, authority, approval/history, and global-navigation paths
  cannot be exempted by caller-declared ownership. Cross-Host parity erases only
  declared authorization, route, and target bindings.
- A promotion packet records content-addressed evidence references from at least
  two distinct Profile identities for a shared surface. Until an owning verifier
  replays retained evidence and regression closure, every reference is explicitly
  `unverified-reference`; packet creation/decoding cannot authorize promotion. A
  held-out contract Profile can prove extension conformance, never Host capability
  or production maturity.
- `PromotionProofVerifierRegistry` accepts only trusted native-async verifiers
  bound to one exact Profile, implementation hash and admissible evidence kinds.
  Verification strictly decodes retained evidence, freezes cloned packet/proof
  context, replays every referenced proof, and rejects verifier/Profile/kind,
  evidence hash, conformance hash, regression before/after, or independent
  acceptance drift.
- A verified promotion envelope binds the original packet hash, target before/
  after hashes, exact verifier identities, passed regression closures, unique
  acceptance receipts and retained evidence ids. Shared Platform/Kernel envelopes
  reject contract-conformance-only proofs and still declare
  `handoffStatus=verified-evidence-only`, `requiresChangeSet=true`, and
  `mutatesProject=false`. Envelope verification never grants approval or applies
  the protected-surface change.
- Evidence maturity and domain Outcome quality use separate frozen rulers and
  strict owning evidence. Maturity uses asynchronous `verifyAndProject` over a
  complete Profile-owned retained-evidence bundle; the owning verifier must
  authenticate receipts, decode bytes and recompute the report before Platform
  projection. A synchronous report decoder cannot register as a maturity adapter.
  Outcome scoring recomputes domain evaluation locally. Neither projection can
  mint the other's readiness.
- A verifier cannot reinterpret an existing ruler's source semantics. The current
  Design OS ruler binds Contract to deterministic test runs and Conformance to
  mocked-Host receipts, so the Commerce maturity adapter keeps those stages
  blocked even after a real bundle verifies. The bundle also cannot prove that its
  input was unseen or independently accepted, so Production Rehearsal remains
  blocked. Real-Host evidence remains visible, but production readiness requires a
  new reviewed ruler and independently verifiable rehearsal evidence.
- Deterministic test data proves contract decoding, replay, conformance and
  failure behavior only. It cannot satisfy capability, verified-Host,
  production-rehearsal or acceptance claims. A maturity adapter may be declared
  only when its invocation re-verifies authoritative receipts and retained bytes;
  otherwise the manifest leaves that adapter absent and maturity stays blocked.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Manifest contains nested path, origin, credential, command, or authority-shaped data | Reject before hashing or registration lookup |
| Root/dependency/hash/Kernel range/Library lock differs | Reject the entire closure before Project mutation |
| Required binding is missing or implementation hash drifts | Block exact closure/content; never use an ambient callback |
| Optional presentation binding is missing | Return visible degraded read-only projection |
| Compiler is absent from closure, mutates input, or is nondeterministic | Reject proposal collection |
| Equal-precedence fragments disagree on one Outcome | Preserve explicit conflict and block the affected Outcome |
| Lifecycle preview content, Project revision, or successor hash differs | Reject ChangeSet handoff |
| Install/upgrade/remove changes an unrelated Profile root | Reject the transition |
| Bundle omits active or installed historical closure bytes | Reject before Project use |
| Profile audit path traverses or touches a protected surface | Reject admission regardless of claimed ownership |
| Cross-Host graph/evaluation/repair meaning differs | Reject semantic parity |
| Shared promotion has only one Profile identity | Reject promotion |
| Promotion evidence claims verification without an owning retained-evidence verifier | Reject; packet references remain explicitly unverified |
| Promotion verifier is synchronous, wrong-Profile, wrong-kind, drifted, or lacks one packet proof | Reject before creating an envelope |
| Shared promotion contains contract-conformance-only proof, reused acceptance receipt, or stale regression before/after hash | Reject the verified envelope |
| Verified envelope packet/target/hash differs at ChangeSet handoff | Reject as stale or unreviewed; never apply |
| Adapter output changes Profile or ruler identity | Reject the projection |
| Implementation hash covers only labels/version text | Reject admission review; bind functions, schemas and constants |
| Maturity source is fixture, stubbed verifier, id-only report or precomputed pass | Reject the invocation or omit the adapter; keep the stage blocked |
| Maturity adapter implements synchronous `project(report)` instead of asynchronous retained-evidence verification | Reject registration |
| A real bundle lacks independently verifiable unseen-input/acceptance evidence | Pass only reverified Real-Host metrics; keep Production Rehearsal and readiness blocked |

### 5. Good / Base / Bad Cases

- Good: Commerce and Game Asset resolve from exact manifests and trusted
  registrations; Commerce maturity can only invoke its full retained rehearsal
  verifier; one Universal Brief produces deterministic provenance-bound proposals;
  an exact lifecycle preview is handed to Project ChangeSet authority.
- Base: an optional renderer is unavailable. The artifact stays intact and
  inspectable through a read-only diagnostic projection while unrelated Profiles
  remain editable.
- Bad: a manifest embeds an output URL, a compiler is selected without its
  installed closure, or a remove preview silently drops Commerce while removing
  Game Asset. Each attempt fails before mutation or execution.

### 6. Tests Required

- Manifest/closure: strict nested payload rejection, canonical order/hash,
  duplicate/conflict/cycle detection, semver compatibility, exact registration
  and Library lock closure, empty closure, and unreachable-content rejection.
- Brief/registries: installed-closure identity, mutation and replay detection,
  deterministic ranking/provenance, equal-precedence conflict, strict evaluator
  schema/artifact ownership, inert commands, fallback projections, and frozen
  benchmark/scorecard identity, asynchronous maturity verification and rejection
  of synchronous/precomputed maturity adapters.
- Lifecycle/Bundle: install, upgrade, disable, remove, tampered preview, stale
  revision, unrelated-root drift, exact empty successor, installed-history
  mismatch, historical closure retention, canonical order, and hash tampering.
- Conformance: protected ownership forgery, traversal paths, catalog drift,
  cross-Host normalization, semantic drift, distinct-Profile promotion proof,
  synchronous/wrong-owner/forged/incomplete proof rejection, acceptance receipt
  uniqueness, canonical envelope decode and stale ChangeSet handoff.
- Regression: held-out contract Profile, exact Commerce graph/Contract/Plan/
  evaluation parity, fake maturity-input rejection, Kernel conformance,
  TypeScript, lint, build, and diff check.

### 7. Wrong vs Correct

```ts
// Wrong: a manifest chooses executable ownership and a copied hash blesses edits.
manifest.ownerId = 'profile:self-approved'
assertProfileLifecycleChangeSet({ preview: editedPreview, previewHash: oldHash })
registry.register({ implementationHash: hash('compiler.v1'), implementation: { compile: () => [] } })

// Correct: trusted application code owns implementations; the exact preview is
// recomputed and handed to the existing Project ChangeSet authority boundary.
registry.register(trustedRegistration)
await fingerprintTrustedImplementation({
  id: 'implementation:profile-compiler',
  functions: [compileProfileBrief],
  schemas: [profileEvidenceSchema],
  constants: [PROFILE_RECIPE],
})
await assertProfileLifecycleChangeSet({
  preview,
  previewHash: preview.previewHash,
  projectRevision: currentProjectRevision,
  nextClosureHash: preview.nextClosureHash,
})

// Wrong: decode a caller-authored report and call it verified maturity.
evidenceBenchmarkAdapters.register({ project: decodeStoredReport })

// Correct: the Profile re-authenticates receipts and retained bytes before projection.
await evidenceBenchmarkAdapters.verifyAndProject(reference, completeRehearsalBundle)

// Wrong: packet references or a verified envelope are treated as approval.
applyProtectedSurface(await createProfilePromotionPacket(proposal))

// Correct: owning verifiers replay every retained proof; the result is still
// evidence-only input to the existing reviewed ChangeSet authority.
const envelope = await verifyProfilePromotionPacket({ packet, proofs, registry })
await assertProfilePromotionChangeSetHandoff({
  envelope,
  envelopeHash: envelope.envelopeHash,
  packetHash: packet.packetHash,
  currentSurfaceHash,
  proposedSurfaceHash,
})
```
