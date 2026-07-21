# Close remaining GitHub issues

## Goal

Audit every currently open issue in `Nebutra/cutout`, complete any bounded missing implementation, and close only issues whose published acceptance criteria are proven by repository evidence.

## Requirements

- Treat the GitHub issue body as the source requirement and the repository as the implementation source of truth.
- Preserve the repository Agent contract, including synchronized CLI/MCP/protocol/manifest/docs and `pnpm agent:validate`.
- Use independent sub-agent audits for security/runtime, governance/native release, and architecture/product milestones.
- Do not close milestone issues with mocks, documentation, or partial contracts.
- Keep `.cutout` Design IR and provenance authoritative and retain preview-before-apply semantics.

## Acceptance Criteria

- [x] Every open issue has an evidence-backed disposition: issues #1-#11 were verified, commented, and closed.
- [x] Bounded missing work required by closable issues is implemented with regression tests.
- [x] The relevant TypeScript, Rust/Tauri, Agent contract, build, and release smoke gates passed; signing/notarization was kept separate from local smoke claims.
- [x] GitHub received concise verification comments before each issue was closed.
- [x] The repository has no remaining open GitHub issues and contains no false implementation claims.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
