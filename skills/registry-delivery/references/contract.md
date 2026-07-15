# Registry delivery contract

- Schema: `cutout.registry-item.v1`.
- Kinds: component, pattern, template, starter, skill, integration-adapter.
- Catalog: fixed project-owned `.cutout/registry/items`; no caller path.
- Sources: bundled/local/http host descriptors; core resolver never fetches.
- Integrity: every file has safe path, byte size and SHA-256 verification.
- Install: preview diff, explicit approval, recheck, controlled transaction.
- Update: installed-origin ledger retains item version and file base hashes.
- Conflicts: user-modified files become `three-way-conflict` and are preserved.
- Receipts: bind plan, item/version, approval and resulting file hashes.
- Frameworks: Next App Router and Vite React supported where declared.
- Nuxt and TanStack remain adapter-required until real fixtures and gates exist.
