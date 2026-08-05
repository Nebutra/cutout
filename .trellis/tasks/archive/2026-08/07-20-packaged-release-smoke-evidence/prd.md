# Packaged Release Smoke Evidence

## Goal

Produce and retain evidence that a real release candidate installs or launches
on each supported platform and that updater artifacts satisfy the declared
signing boundary.

## Acceptance Criteria

- [ ] A release tag builds the complete macOS, Windows, and Linux artifact matrix.
- [ ] The packaged macOS application launches and passes the committed smoke script.
- [ ] Updater metadata and signatures validate against the configured public key.
- [ ] Signing, notarization, and platform trust results are reported separately
      and only claimed when the corresponding credentials and evidence exist.
- [ ] Release artifacts, checksums, and CI run URLs are recorded in the task evidence.
