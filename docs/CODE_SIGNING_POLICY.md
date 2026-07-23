# Code signing policy

Cutout publishes native desktop installers only through the reviewed GitHub
Actions release workflow. Source tags are immutable, all platform artifacts are
collected by one publisher, and public checksums and provenance are generated
before a draft release becomes public.

## Windows

Windows publication is blocked until the Cutout project is accepted by SignPath
Foundation and the protected `release` environment contains the assigned
SignPath configuration. Once active, free code signing is provided by
[SignPath.io](https://about.signpath.io), certificate by
[SignPath Foundation](https://signpath.org).

The workflow sends only GitHub-hosted unsigned workflow artifacts to SignPath.
It does not store or import a Windows certificate or private key. Returned NSIS
and MSI installers must have a valid Authenticode signature from the configured
SignPath certificate, a code-signing EKU, and a trusted timestamp. The final
signed NSIS installer is then signed again with Cutout's independent Tauri
updater key, and that updater signature is verified before publication.

## macOS and updater signatures

macOS application and DMG artifacts require a valid Developer ID signature,
Apple notarization, Gatekeeper acceptance, and stapled notarization tickets.
Every updater artifact also requires an independent Tauri updater signature.

## Roles and privacy

- Committers and reviewers: [Nebutra organization members](https://github.com/orgs/Nebutra/people)
- Approvers: [Nebutra organization owners](https://github.com/orgs/Nebutra/people?query=role%3Aowner)
- Privacy policy: [Privacy and data lifecycle](./PRIVACY_DATA_LIFECYCLE.md)

Cutout does not publish a platform artifact when any required signing,
notarization, timestamp, updater-signature, checksum, or provenance check fails.
