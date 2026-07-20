# Implementation Plan

1. Add failing focused tests and fix #2 and #7.
2. Implement #1 and #3 together around a shared lease/transaction contract; synchronize all Agent surfaces and validate them.
3. Fix #4 and #5 with native/path boundary tests and CI drift checks.
4. Fix #6 and #9 and run browser/native/package gates.
5. Implement the composite receipt and bounded adapter increments for #8 and #10.
6. Implement and visually verify the outcome-first Creative Board in independently testable slices for #11.
7. Run the complete quality matrix, update issue evidence, and close only verified issues.

## Completion Evidence

All seven implementation waves are covered by focused regressions and the full
quality matrix recorded in `prd.md`. GitHub issue closure remains an external
project action and must occur only after the owning session reviews this
evidence and the release CI packaged-smoke result.
