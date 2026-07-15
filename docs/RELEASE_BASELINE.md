# Release Baseline: 0.1.0

Recorded on 2026-07-12 on Apple Silicon macOS.

| Gate | Result |
|---|---|
| Frontend entry | 447.1 KiB, budget 450 KiB |
| Frontend chunks | 49 |
| Release executable | 16 MiB, arm64 |
| Local `.app` startup | Process launched successfully |
| Startup RSS sample | 86,592 KiB |
| JavaScript tests | 944 passed, 1 skipped |
| Rust tests | 61 passed |
| Lint | 0 warnings, 0 errors |
| Data archive drill | Archive, list, extract, and directory verification passed |

The `.app` is ad-hoc/linker signed, has no TeamIdentifier, and fails distribution Gatekeeper assessment. No valid Developer ID identity exists on the recording machine. This is a local performance and packaging baseline, not a release or notarization receipt.

Database migration policy is forward-only per IndexedDB/store schema version. Before increasing a database version, add a fixture at the previous version, migrate it in tests, verify content hashes and project references, and exercise archive/restore with the migrated profile. Destructive downgrade is unsupported; rollback uses the pre-migration archive.
