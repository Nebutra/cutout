# Commerce real-Host verification review

## Conclusion

The native receipt verifier proves local receipt authenticity and exact output
byte identity, but the in-progress `createTrustedCommerceProfileBenchmarkReport`
bridge does not yet prove Commerce production readiness. The truthful current
real-Host baseline remains `0/8 blocked`.

## Blocking findings

1. `commerceEvaluationReady` is caller-authored instead of recomputing
   `evaluateCommerceProduction` from verified publications and receipts.
2. Signed semantic role, node id, locks, graph node and frozen Plan bindings are
   not checked. One receipt can therefore be reused across unrelated metrics.
3. The exact eleven-artifact closure is absent: three localized descriptions,
   six image roles, one product video and one strategy document.
4. Evidence references do not bind their content hash to the signed receipt
   hash and allow additional caller-authored artifact ids.
5. Locale/citation/catalog, image identity/overlay/policy/usability, video
   identity/policy and strategy evidence assertions remain caller-authored.
6. A trusted report containing real passes cannot be durably decoded or compared
   because the normal decoder intentionally rejects all real-host passes.
7. MP4 inspection proves container, codec and readable sample tables but still
   records `playbackVerified=false`; asynchronous success therefore precedes the
   required full playback boundary.
8. Vision/OCR is still capability-required, so generated image bytes and
   dimensions cannot prove product identity, text, overlays or sensitive-visual
   compliance.
9. Structured output is signed JSON while Commerce delivery requires
   text/Markdown; a deterministic derived-artifact step with CAS provenance is
   missing.
10. Commerce media evaluation metadata is not authoritatively bound to the
    signed image/video bytes.

## Required production rehearsal

A passing run must execute the exact frozen Commerce graph and Plan in a
packaged Host, produce and persist all eleven artifacts in CAS, Native-verify
every receipt and byte payload, run deterministic and signed semantic QA,
fully decode/play video, derive Markdown from structured outputs with
provenance, generate strategy last from actual run evidence, internally call
`evaluateCommerceProduction`, and persist a signed bundle that later decode and
comparison can reverify.
