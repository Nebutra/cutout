# Technical Design

## Boundaries

The work has four independently testable boundaries:

1. Security-reporting and issue #12 command/runtime hardening.
2. Desktop updater configuration and state-machine hardening.
3. Release workflow, version contract, and platform signing gates.
4. GitHub repository/environment/ruleset configuration.

Repository code owns deterministic contracts and tests. GitHub API mutations
own repository-hosted enforcement. Neither is accepted as complete without a
read-back proving the effective state.

## Security Reporting

Enable GitHub private vulnerability reporting through the repository API and
commit `SECURITY.md`. Public issue comments contain no exploit details. Issue
#12 closes only after the private route exists and each disclosed finding class
has a current-HEAD outcome.

## Issue #12 Security Model

Provider credentials, provider identity, protocol, and destination form one
validated host-owned binding before any secret is read. DNS policy validates
all resolved addresses and connects without a second unvalidated resolution.

Desktop file reads/writes operate only on host-issued opaque grants or fixed
authorized roots. Caller-supplied absolute paths never become authority.

The stdio MCP process requires `CUTOUT_PROJECT_ROOT`; missing or invalid binding
fails startup. Approval leases remain host-issued, request-digest-bound,
revision-bound, expiring, and single-use. Generated starter identifiers and CSS
values pass framework-specific escaping/validation. Repository inspection uses
non-interactive Git configuration, disables hooks/config includes where
applicable, and enforces explicit file/depth/byte budgets.

## Updater Configuration

`RuntimeConfig` distinguishes stable and optional Beta capability. In release
builds, public key, endpoints, allowlist, and timeout come only from compile-time
values. Debug/test builds may use environment overrides for local fixtures.

The native state machine owns retryability. Cancellation restores a native
downloadable state after the cancelled future finishes; download/install errors
retain enough checked metadata for an explicit retry. Frontend phase transitions
mirror the returned native snapshot instead of guessing a successful reset.

The current static GitHub Release channel has no signed mutable control plane.
Therefore staged rollout and automatic rollback are removed from workflow input,
release documents, UI/docs claims, and tests. Recovery snapshots and signed
forward updates remain.

Beta is optional capability metadata returned by `updater_status`. The UI only
offers channels listed by native capability.

## Version Authority

`package.json` is the product-version authority for JavaScript surfaces. UI,
CLI, MCP, Agent capability/plugin build data, and recovery metadata import or
derive that value. Release validation additionally requires Tauri and Cargo to
match it and scans for forbidden duplicated release literals in owned surfaces.

## Release Workflow

A dedicated quality job runs the complete provider-free gate. Native builders
depend on it and package the selected tag. All actions and toolchains use pinned
reviewed revisions. The final writer verifies the tag, complete matrix,
signatures, notarization, checksums, and attestations before draft promotion.

Windows signing material is explicit and protected. If Windows remains in the
public matrix, missing certificate material stops the build before publication.

GitHub is the sole release authority. Local tooling checks that the private
mirror contains the GitHub release commit before tag creation; mirroring is
one-way and never part of a non-atomic dual-push release transaction.

## GitHub Enforcement

The release environment permits only `main` and release tags, disables admin
bypass, and uses available reviewers without inventing an independent approver.
Repository rules require pull requests/status checks for `main` and block
release-tag update/deletion. Settings are applied through idempotent API calls
and read back into task evidence.

## Compatibility And Rollback

Existing `0.1.3` clients continue to consume standard Tauri `latest.json`.
Removing unused rollout/rollback attachments does not alter artifact signature
verification. Debug updater fixtures retain environment injection.

Code changes roll back through Git. GitHub settings roll back by restoring the
captured environment/ruleset JSON. Published releases and existing tags are not
rewritten.
