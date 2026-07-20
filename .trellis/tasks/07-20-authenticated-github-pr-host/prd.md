# Authenticated GitHub pull request host

## Goal

Add a verified authenticated GitHub host contract for PR list/detail/check/review and previewed merge operations; keep unavailable state until a real host exists.

## Requirements

- Define a verified desktop-host session contract without exposing tokens to the
  WebView, logs, prompts, or `.cutout`.
- Add bounded PR list/detail, status checks, reviews, commits, and changed files.
- Preview merge against repository, PR number, expected head SHA, and merge
  method; require explicit approval and read back the resulting host state.
- Keep the existing unavailable state truthful until the host is authenticated.

## Acceptance Criteria

- [ ] No PR data or enabled mutation appears without a verified host session.
- [ ] Typed list/detail reads are bounded, cancellable, and covered by host and
      component tests.
- [ ] Merge rejects stale head state and returns a host-verified receipt.
- [ ] Credentials never cross into React state or Agent-visible artifacts.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
