# Bug analysis: opaque Provider stalls and dead future seams

## 1. Root cause category

- **Category B - Cross-layer contract:** Provider route evidence proved that an
  OpenAI-shaped `/images/edits` adapter was executable, but code also assumed
  every compatible relay accepted the optional `input_fidelity` field.
- **Category E - Implicit assumption:** design-system generation swallowed an
  edit failure and generated without references, making completed output weaker
  than the requested reference-conditioned outcome.
- **Category A - Missing spec:** an unused account/session abstraction was kept
  only for a hypothetical remote backend, with no consumer or removal trigger.

## 2. Why earlier fixes did not close the issue

1. Route eligibility fixes separated capability evidence from model ranking,
   but did not separate required multipart fields from optional OpenAI fields.
2. A five-minute tool deadline prevented an infinite wait but still allowed a
   failed candidate wave to feel hung, and candidate attempts had no explicit
   progress lifecycle.
3. Unit tests proved image edit request shape and slicing separately; only the
   complete route-suite E2E asserted all Agent-planned resources reached a pack.

## 3. Prevention mechanisms

| Priority | Mechanism | Specific action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Keep optional-field compatibility fallback inside the generation boundary | Done |
| P0 | Runtime | Bound each desktop Provider attempt to three minutes with cancellation | Done |
| P0 | Test | Cover 400 downgrade, non-downgrade errors and full resource-pack delivery | Done |
| P1 | Observability | Emit start/terminal events for every Design System candidate attempt | Done |
| P1 | Code review | Reject future service/query seams without a current consumer | Done |
| P1 | Documentation | Add executable Provider compatibility matrix and cross-layer checklist | Done |

## 4. Systematic expansion

- Other Provider optional fields (`size`, quality/style extensions and reasoning
  options) need the same required-versus-optional review before defaulting.
- Any reference-conditioned path must fail closed when no executable adapter can
  consume references; unconditioned generation is a different outcome.
- Timeout evidence must exist at the individual attempt and overall workflow
  layers; one global test deadline is not user-facing orchestration.
- Interfaces, query keys and local implementations with zero imports are legacy
  even when their comments describe a plausible future architecture.

## 5. Knowledge capture

- Updated `.trellis/spec/frontend/byok-provider-protocols.md`.
- Updated `.trellis/spec/guides/cross-layer-thinking-guide.md`.
- Updated `.trellis/spec/frontend/quality-guidelines.md` and the generic frontend
  guides from repository evidence.
- No shared Trellis template directory exists in this repository; no template
  synchronization applies.
