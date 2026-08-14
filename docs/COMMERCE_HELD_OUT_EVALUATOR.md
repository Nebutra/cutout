# Commerce Held-Out Evaluator

This protocol separates Cutout's production Host from the independent authority
that selects an unseen Commerce input and accepts the completed eleven-deliverable
bundle. Evaluator fixtures, local signatures and capability probes are not
benchmark evidence.

## Custody

- The evaluator creates and retains the Minisign secret key outside the Cutout
  repository, app data, logs and project.
- Cutout receives only the evaluator public key at build time through
  `CUTOUT_COMMERCE_EVALUATOR_PUBKEY`.
- `pnpm commerce:evaluator` is run on the evaluator-controlled host. The Node
  process never reads secret-key contents; it passes the protected file to the
  `minisign` executable without a shell and verifies every signature immediately.
- Raw-input preparation uses Cutout's real bounded Commerce ingestion and strict
  schemas offline. It performs no network or Provider call, creates no signature,
  and contributes no benchmark evidence.
- A challenge is valid for at most 24 hours and authorizes one exact Run id and
  one exact input-manifest hash. Challenge protocol v2 also signs the exact
  Cutout Host build version. The evaluator refuses to issue it unless
  `package.json` and `src-tauri/Cargo.toml` agree; the current authority is
  `0.1.20`.

## Prepare The Trust Root

The evaluator exports its public key and creates a key-information record:

```bash
pnpm commerce:evaluator -- key-info \
  --public-key evaluator.pub \
  --output evaluator-key-info.json
```

Build the Cutout desktop binary with the exact public-key file content in
`CUTOUT_COMMERCE_EVALUATOR_PUBKEY`. The secret key must not be present on the
Cutout build or execution host.

## Prepare An Unseen Input

On the evaluator-controlled host, select one unseen product JSON plus the exact
competition category and attribute catalogs. Convert them into the strict
`commerce.held-out-evaluator-input.v1` handoff:

```bash
pnpm commerce:evaluator -- prepare \
  --product unseen-product.json \
  --category-catalog clothing_categories.json \
  --attribute-catalog clothing_attributes.json \
  --identity-id rehearsal:competition:001 \
  --identity-revision source-drop:2026-08-14 \
  --output evaluator-input.json
```

Preparation accepts bounded regular files, requires exactly one normalized
product, preserves both catalog JSON strings, and selects only the normalized
immutable identity-anchor image by default. It creates the output exclusively
and never overwrites an existing handoff. The evaluator keeps the raw files and
the prepared input outside the Cutout execution host until challenge transfer.

## Issue A Challenge

The evaluator signs the prepared input. `challenge` strictly decodes it and
rechecks the identity-anchor-first source selection before invoking Minisign.

```bash
pnpm commerce:evaluator -- challenge \
  --input evaluator-input.json \
  --public-key evaluator.pub \
  --secret-key evaluator.key \
  --ttl-minutes 240 \
  --output evaluator-package.json
```

The output binds the exact derived input manifest, evaluator key id, fresh
challenge nonce, one allowed Run id, bounded issue/expiry window and
`hostBuildVersion`. Import it
from **System inspector > Commerce**, select the eligible first-party DashScope
Provider and start the Run. Retrying the same package recovers settled native
responses; it does not authorize another result.

## Review And Complete

Cutout exports `commerce-<run>-pending.json` only after all eleven artifacts,
seven semantic-QA receipts and the playback promotion close successfully. The
evaluator materializes the exact retained bytes into a new private inspection
directory:

```bash
pnpm commerce:evaluator -- inspect \
  --pending commerce-run-pending.json \
  --output-dir evaluator-inspection
```

`inspect` strictly decodes the pending bundle, rechecks its bundle hash, and
verifies every source, Provider and semantic-QA byte payload against its receipt
artifact id, SHA-256 and length. It writes fixed safe filenames for the source
images, eleven Provider deliverables, derived Markdown deliveries, seven QA
records and the playable MP4, plus `manifest.json` and `review.json`. The output
directory must not already exist, is owner-only on Unix, and is removed if any
write or byte check fails.

The standalone `review` command can regenerate only the review template when no
material extraction is needed:

```bash
pnpm commerce:evaluator -- review \
  --pending commerce-run-pending.json \
  --output evaluator-review.json
```

After inspecting every materialized source and deliverable, the evaluator changes
`reviewerId`, `decision` to `accepted`, and `reviewedAt` in
`evaluator-inspection/review.json` to the actual Unix time in milliseconds. The
deliverable closure and hashes must remain unchanged. Completion refuses a
pending or drifted review.

```bash
pnpm commerce:evaluator -- complete \
  --pending commerce-run-pending.json \
  --review evaluator-inspection/review.json \
  --public-key evaluator.pub \
  --secret-key evaluator.key \
  --output evaluator-completion.json
```

Import the completion in the Commerce panel and choose **Verify and admit**.
Rust re-verifies the challenge, commitment, replay ledger, complete bundle and
completion signature before the UI can expose a `14/14` admitted evidence file.
Both commitment creation and final admission compare the signed
`hostBuildVersion` with the compiled `CARGO_PKG_VERSION`; the completion and
admission must expose the same value. Missing, drifted or legacy v1 protocol
payloads fail closed.
The durable benchmark remains `5/14` until that native admission succeeds.
