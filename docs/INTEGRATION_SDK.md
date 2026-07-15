# Cutout Integration SDK v1

`integration-sdk.v1` is the product integration boundary for importing,
exporting, synchronizing, and publishing normalized external resources. It is
separate from External Agent Control (`cutout.control.v1`): agents can request
product capabilities, but cannot import provider adapters or receive provider
credentials.

## Boundaries

- OAuth and API credentials stay in the host. SDK sessions receive only an
  opaque `SecretHandle`.
- Every operation is revision guarded and returns a previewable plan. Applying
  a plan remains the responsibility of the product policy layer.
- Resources carry provenance and an explicit license state.
- Sync cursors are opaque. Webhook receipts are accepted only after the host
  verifies the signature.
- Conflict policy is explicit: `fail`, `prefer-local`, `prefer-remote`, or
  `manual`.
- Provider-specific SDKs belong in adapters. They are forbidden dependencies
  of External Agent Control and the Integration SDK core.

## Implemented boundaries

- Figma Snapshot: preview/import/export of authorized snapshot data. No live
  sync, OAuth host, or remote Figma API is claimed.
- Local Repository: host-authorized safe scan followed by preview/import. No
  arbitrary path access is exposed.
- GitHub and Notion: adapters, approved Delivery executors, and desktop OAuth
  session state are implemented. They remain disabled until a desktop host is
  injected and authorization completes; Cutout never stores provider tokens.
- Figma and Obsidian: installable foreground plugin artifacts are provided.
  Availability begins only after a matching short-lived host handshake.
- Pencil, Paper, Framer and Canva: versioned MCP/CLI/plugin/app host contracts
  and approval receipts are implemented. No bundled provider process or cloud
  service is represented as running.

Remote cloud collaboration has a provider interface but no production service.
The bundled team implementation is local-first IndexedDB review state and
reports `remoteSync: false`.

## Production acceptance

The credential-free smoke command is `pnpm integration:smoke`; every host or
remote provider must report `capability-required`. Protected release probes
inject host-owned handles and follow [the release/readback checklist](./INTEGRATION_RELEASE_CHECKLIST.md).
Provider execution policy is documented in [PRODUCTION_PROVIDER_POLICY.md](./PRODUCTION_PROVIDER_POLICY.md),
and the privacy inventory, retention, export and deletion contract is in
[PRIVACY_DATA_LIFECYCLE.md](./PRIVACY_DATA_LIFECYCLE.md).

## Adapter conformance

Adapters register with `IntegrationRegistry` and can be checked with
`runAdapterConformance`. The harness validates manifest identity and limits,
capability methods, revision fidelity, auth boundaries, and secret-free result
plans. Repository architecture tests additionally prevent External Agent
Control from importing provider adapters or SDK packages.
