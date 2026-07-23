# Code signing policy

Cutout publishes native desktop installers only through the reviewed GitHub
Actions release workflow. Source tags are immutable, all platform artifacts are
collected by one publisher, and public checksums and provenance are generated
before a draft release becomes public.

## Windows

Cutout currently publishes Windows NSIS and MSI installers without
Authenticode. The release workflow verifies that both installers report
`NotSigned`; no Windows certificate, password, private key, or remote signing
service credential is required. Microsoft Defender SmartScreen may warn users
before installation.

The Windows NSIS updater artifact still carries Cutout's independent Tauri
updater signature. CI verifies that signature against the configured public key
before publication. Public SHA-256 checksums and GitHub build provenance cover
both Windows installers, but neither is represented as an Authenticode
signature or trusted Windows publisher identity.

## macOS and updater signatures

macOS application and DMG artifacts require a valid Developer ID signature,
Apple notarization, Gatekeeper acceptance, and stapled notarization tickets.
Every updater artifact also requires an independent Tauri updater signature.

## Roles and privacy

- Committers and reviewers: [Nebutra organization members](https://github.com/orgs/Nebutra/people)
- Approvers: [Nebutra organization owners](https://github.com/orgs/Nebutra/people?query=role%3Aowner)
- Privacy policy: [Privacy and data lifecycle](./PRIVACY_DATA_LIFECYCLE.md)

Cutout does not publish a platform artifact when its required notarization,
updater-signature, checksum, provenance, or explicit signing-status check fails.
