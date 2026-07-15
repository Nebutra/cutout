# Cutout Roadmap

This is the single authority for planned product capabilities and release prerequisites. Detailed checklists do not change status here. An item is not implemented, production-ready, released, connected, synced, or certified until every exit criterion has evidence.

## Now

| Item | Current state | Dependencies | Exit criteria | Claim boundary |
| --- | --- | --- | --- | --- |
| Local Agent, Canvas, Deliver | Local projects, Design IR, preview, approval, export, CLI, MCP, Skills contracts, and a desktop-internal durable local Agent Host with authorized `.cutout` checkpoints exist. | Stable schemas, migrations, policy, accessibility, packaged lifecycle and release gates. | Supported local journeys pass unit, integration, crash/restart, sleep/wake, visual, privacy, migration, and packaged-app smoke tests; manifest matches behavior. | The local Host schedules and recovers approved work but has no bundled provider executor or arbitrary shell. Do not claim live sync, cloud execution, web search, or video processing. |
| Provider and speech foundations | BYOK adapters and an injected OpenAI-compatible ASR/TTS protocol adapter exist. The speech host reports recording and shortcuts unavailable. | Authorized transport, mock servers, receipts, cancellation, timeout and privacy tests. | Every advertised adapter has authorized transport, bounded receipts, capability evidence, and packaged-host tests. | Do not claim remote speech, microphone capture, account connectivity, or global shortcuts. |
| Release evidence | Local macOS builds plus release scripts exist. Tauri updater artifacts, stable/beta manifest generation, hash/SBOM/provenance/rollback metadata and release-only CI are implemented and fixture-tested; no production signing key, published manifest, notarization or rollout evidence is recorded. | Reproducible build, protected CI secrets, HTTPS distribution, privacy manifests, clean-machine tests and owner review. | Release checklist completes with immutable artifacts, signature verification, previous-version/rollback evidence and a staged rollout record. | Local fixtures and CI definitions do not make a DMG distributed, signed, notarized, automatically updating or rollback-ready. |

## Next

| Item | Current state | Dependencies | Exit criteria | Claim boundary |
| --- | --- | --- | --- | --- |
| OAuth account hosts | Integration contracts accept opaque sessions; no production GitHub, Notion, or Canva OAuth host is bundled. | Registered apps, approved redirects/scopes, encrypted host token store, refresh/revoke, provider review and rate limits. | Authorization, refresh, revoke, least privilege, audit, deletion, denial and expiry tests pass on approved sandbox accounts. | Do not claim account connection, workspace search, publishing, or sync from manifests or mocks. |
| Real third-party hosts | Figma authorized snapshots and host-gated contracts exist; other hosts remain planned or adapter-required. | Official SDK/API implementation, product/store review, signed host, handshake, privacy and provenance review. | Each host passes the integration release checklist on a real approved app/account with truthful unavailable states. | Do not claim native integration, bidirectional/live sync, marketplace approval, or vendor acceptance. |
| macOS microphone and shortcut backend | Tauri exposes truthful unavailable capabilities and safe session boundaries. | Reviewed CoreAudio/AVFoundation or `cpal`, microphone usage description, user-gesture permission, app-private files, approved shortcut plugin and collision handling. | Signed app passes enumerate, grant, deny, revoke, record, cancel, timeout, size, deletion, sleep/wake, hot-unplug and shortcut tests. | Do not claim recording, permission prompting, device enumeration, push-to-talk, or system shortcuts. |

## Later

| Item | Current state | Dependencies | Exit criteria | Claim boundary |
| --- | --- | --- | --- | --- |
| Cloud collaboration | Local repositories and provider interfaces exist; no production remote project service exists. | Identity, tenancy, authorization, encrypted storage, realtime transport, conflict resolution, audit, retention, backup, abuse and incident operations. | Isolation, offline conflict, permissions, deletion, restore, load, security and disaster-recovery tests pass. | Do not claim teams, multiplayer, cloud backup, remote access, or cloud sync. |
| Remote media providers | Catalog definitions and protocol contracts exist; most remote media/speech execution is not bundled. | Approved accounts and terms, credential custody, moderation, regional policy, quotas, cost, cancellation and provenance. | Mock plus authorized sandbox and failure tests pass; spend/privacy owners approve; discovery reflects actual models. | Do not claim Deepgram, ElevenLabs, AssemblyAI, Replicate, fal, video, or remote media execution from catalog presence. |
| Store-distributed integration apps | SDK plans exist for Figma, Canva, Framer and host surfaces. | Vendor enrollment, security/privacy review, listing assets, support and store approval. | The submitted app is approved and install/connect/disconnect/update paths pass production tests. | Do not claim marketplace availability, vendor endorsement, or an approved listing. |

## External Prerequisites

| Prerequisite | Current state | Required evidence / exit criteria | Claim boundary |
| --- | --- | --- | --- |
| Apple Developer ID, notarization, updater | Updater artifact/manifest infrastructure and fixture tests exist, but no distribution identity, notarization ticket, stapled artifact, protected updater key, published endpoint, rollout, or rollback evidence is recorded. | Active Apple membership; Developer ID identities; hardened entitlements; successful notarization/stapling; clean-Mac Gatekeeper validation. Updater also needs protected keys, published HTTPS manifests, staged rollout, rollback and real signature-failure evidence. | Do not claim signed distribution, notarization, Gatekeeper readiness, automatic updates, or rollback from local fixtures or workflow code. |
| OAuth/vendor accounts | Production credentials are not committed; manifests do not create accounts. | Named owner, approved vendor app/account, least-privilege scopes, keychain/secret-manager custody, rotation, revocation and incident process. | Do not claim connected accounts or production API access. |
| Cloud infrastructure | No production collaboration backend or operational control plane exists. | Approved architecture, environments, IAM, observability, budgets, backups, on-call, security and lifecycle controls. | Do not claim hosted availability or durability. |
| Vendor SDK/store reviews | Protocol adapters and mock tests are not vendor approval. | Official SDK compliance, real-host testing, privacy disclosure, security review and written acceptance where required. | Do not say vendor-approved, certified, official partner, or marketplace-listed without evidence. |

## Supporting Evidence

- macOS release: [baseline](./RELEASE_BASELINE.md) and [checklist](./RELEASE_CHECKLIST.md)
- integrations: [release checklist](./INTEGRATION_RELEASE_CHECKLIST.md), [capability matrix](./INTEGRATION_CAPABILITY_MATRIX.md), and [SDK](./INTEGRATION_SDK.md)
- external Agent control: [headless control](./HEADLESS_AGENT_CONTROL.md) and [Agent integration](./AGENT_INTEGRATION.md)
- provider policy: [production provider policy](./PRODUCTION_PROVIDER_POLICY.md)
- data custody: [privacy and data lifecycle](./PRIVACY_DATA_LIFECYCLE.md)

Domain documents may add technical detail. If status or priority conflicts, this roadmap wins.
