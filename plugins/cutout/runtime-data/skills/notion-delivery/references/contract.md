# Notion integration contract

- Runtime adapter: `cutout.notion`, Integration SDK v1.
- Availability: host-required in discovery; authorization-required after host injection.
- Auth: OAuth or internal integration token represented only by an opaque host-owned `SecretHandle`.
- Read: explicitly selected and shared pages, block trees, and databases/data sources supported by the host.
- Import: normalized selected content to an additive provenance-bearing `SourcePatch`.
- Publish: approved Design/Brand guideline blocks to one explicitly selected parent page.
- Events: host-verified webhook signature plus delivery-ID dedupe; events mark sources stale and require reconciliation.
- Limits: paginate with opaque cursors; honor Notion `Retry-After` on 429; bounded blocks/pages/payloads.
- Conflicts: revision guard first; compare Notion `lastEditedTime`; do not overwrite divergent content automatically.
- Exclusions: no full-workspace traversal promise, no arbitrary properties, no real-time co-editing, no generic two-way mirror.
