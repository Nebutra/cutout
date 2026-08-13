# Commerce evidence and production profile

## Goal

Add cross-border commerce as a removable, evidence-first Design OS Profile that
turns supplied product records and offline platform catalogs into localized,
fact-consistent material Outcomes without sample-specific logic.

## Requirements

- Parse bounded, allowlisted input files and supported nested source-product
  shapes into `product-facts.v1`: identity, title/descriptions, media references,
  category, SKU variants, attributes, measurements, source pointers and explicit
  unknowns. Untrusted HTML is data, never executable instruction.
- Normalize supplied category and attribute catalogs into a deterministic local
  index. Select only valid leaf categories and permitted key/value enums.
- Require every localized claim and visual overlay to cite source fact ids;
  missing or ambiguous evidence remains unknown and cannot be invented.
- Ship versioned offline channel/market policy for AliExpress and en-US, ko-KR
  and pt-BR: language, spelling, units, sizing, prohibited claims, sensitive
  visuals and image/video/document constraints. Compile policy into both model
  constraints and deterministic validation.
- Implement commerce as declarative Outcome/schema/policy/evaluator/recipe
  fragments over the Kernel. It may request semantic capabilities but contains
  no executable adapter, arbitrary network origin or filesystem path.
- Compile three localized descriptions, one main-image role, five complementary
  detail-image roles, one product-video role and one evidence-derived strategy
  document into a bounded DAG. Preserve one shared creative direction and
  product identity locks across media.
- Evaluate physical completeness, category/attribute closure, localization,
  fact consistency, image usability, product identity, video playability and
  output compliance. Repair only failed nodes and keep valid siblings.
- Keep competition-only filenames, sample shapes and scoring weights in the
  Competition Host/Profile binding, not generic commerce semantics.
- Publish a versioned, evidence-tiered Profile benchmark that separates
  deterministic compliance, mocked production and real-Host production. It
  must compare compatible snapshots, expose per-capability deltas/regressions
  and never let mocked receipts make real production readiness green.

## Acceptance Criteria

- [x] P1: Every public and held-out supported product shape normalizes
      deterministically; malformed, oversized, traversal and unsupported inputs
      fail closed with actionable diagnostics.
- [x] P2: Every output claim and visual overlay resolves to source fact ids;
      unknown composition, dimensions, certification or performance is never
      generated as fact.
- [x] P3: Category/attribute output is accepted only when the exact leaf and
      enum values exist in the supplied catalogs.
- [x] P4: All three locale policy packs compile into generation and executable
      gates, including unit/size and prohibited-claim cases.
- [x] P5: A canonical commerce graph contains all required semantic roles and
      can be installed/removed without changing Kernel lifecycle or prototype
      source behavior.
- [x] P6: Mocked capability receipts produce three localized documents, one
      main image, five detail images, one video and one strategy document; only
      rejected frontiers repair and at least 80% of images remain usable.
- [x] P7: Strategy output cites actual normalized facts, plan, route, validation
      and repair evidence rather than static marketing prose.
- [x] P8: A canonical benchmark report measures P1-P7 with reproducible evidence,
      reports deterministic/mock/real tiers separately, marks unavailable real
      Host execution as blocked and produces an exact progress/regression diff
      against a compatible prior snapshot.

## Out Of Scope

- Seller-account publication, listing mutation or arbitrary marketplace control.
- Live search, web crawl, retrieval or unsupported external facts.
- Provider request/poll/download implementation and benchmark package filenames.
