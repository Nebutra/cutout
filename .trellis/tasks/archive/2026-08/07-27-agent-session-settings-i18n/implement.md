# Implementation plan

## Ordered work

1. Align with the capability-probe child on one strict sanitized frontend schema
   for inventory, probe status, auth class, blocking reason, and optional BYOK
   navigation. Confirm the Phase A contract contains no execution fields or
   commands.
2. Add native/TypeScript regression fixtures proving the Codex probe uses only
   fixed `login status`, makes no model request, discards raw output, and cannot
   receive caller executable/argv/path/env/login authority. Do not add or expose
   `codex exec`.
3. Refactor `AiSection` into a thin tab owner plus a provider pane that preserves
   existing provider list/add/edit, reviewed credential import, and model routing
   behavior.
4. Add `AgentSessionsPane` and a pure exhaustive presentation mapper for all 39
   inventory rows plus sanitized probe facts. Every row is non-runnable; cover
   `filesystem-isolation-required`, API-key/access-token, Claude vendor approval,
   unsupported, missing, permission, version, platform, and probe-failure states.
5. Add `agent-sessions` contextual Settings navigation. Select the owning tab
   before focus, retain `model-routing`, and make API-key/access-token/Claude BYOK
   links navigate to the provider tab without importing or selecting anything.
6. Add explicit Lingui IDs and complete all five catalogs. Review English and
   Simplified Chinese side by side for signed-in-versus-runnable truth,
   filesystem isolation, auth classes, vendor approval, unsupported states, and
   BYOK navigation.
7. Update executable Agent safety/capability documentation so Phase A is
   described as probe-only and execution remains `filesystem-isolation-required`.
   Preserve the public no-provider/session-executor limitation.
8. Run focused and cross-layer gates. Automated validation must not invoke a
   live Agent/model request, `codex exec`, Claude, or optional GitHub Actions.

## Expected files and ownership risks

- `src/components/settings/sections/AiSection.tsx`: high provider-regression risk;
  keep the current provider view machine and model routing intact while
  extracting a pane.
- `src/components/settings/SettingsDialog.tsx` and
  `src/components/settings/settings-ui.ts`: focus ordering risk when the target
  belongs to an inactive tab.
- New Settings session components/presenter: must consume the probe-only shared
  schema and must not import provider draft/key, Agent composer, session
  plan/apply, run event, cancellation, or result APIs.
- Capability/auth probe service and native permission: authority risk; allow only
  the fixed non-generating probe and reject raw output/unknown fields.
- `src/locales/*/messages.po`: generated extraction ordering and five-catalog
  parity; do not hand-delete unrelated entries.
- `.trellis/spec/frontend/agent-control-safety.md` and capability manifest/docs:
  probe availability must not be represented as desktop or headless execution.

## Focused tests

- Strict schemas reject unknown fields/enums, raw paths, credential-shaped text,
  account/quota data, command/argv/env/PID fields, and every execution-shaped
  field such as `runnable`, `plan`, `runId`, prompt, output, cancel, or result.
- Native probe tests prove fixed argv, no shell, no model request, raw output
  disposal, exact auth mapping, timeout/error sanitization, and no caller-selected
  authority.
- Presentation tests cover the full matrix. ChatGPT is `Signed in` plus
  `Filesystem isolation required`; API-key/access-token navigate to BYOK; Claude
  is vendor blocked; no state projects a runnable action.
- Settings tests assert both tabs, default/provider compatibility, all 39 rows
  reachable, no provider mutation or execution API from the session tab, and
  contextual focus for `model-routing` and `agent-sessions`.
- Static/import boundary tests assert there is no local-session composer option,
  plan/consent/apply component, progress/cancel/result UI, dormant feature flag,
  or `codex exec` Phase A permission.
- Visual tests cover desktop/mobile, light/dark, provider/session tabs, all-row
  scrolling, refresh state, and long English/Chinese blocked copy with no
  overflow, clipping, overlap, or layout shift.

## Validation commands

```bash
pnpm exec vitest run src/services/ai/local-agent-inventory.test.ts src/services/ai/provider-discovery.test.ts src/components/settings
pnpm exec vitest run src/i18n/__tests__/parity.test.ts
pnpm i18n:ci
pnpm exec tsc -b --pretty false
pnpm lint
cargo test --manifest-path src-tauri/Cargo.toml commands::ai::
cargo fmt --manifest-path src-tauri/Cargo.toml --check
pnpm agent:validate
pnpm build
git diff --check
```

Run the probe child's exact Rust target if it lands outside `commands::ai::`.
Tests use fake process fixtures only and must fail if `codex exec`, Claude, or a
model request is attempted.

## Pre-start review

- Confirm the native permission and frontend service expose probes only.
- Confirm `chatgpt` maps to signed-in status, never execution readiness or
  allowance copy.
- Confirm API-key/access-token and Claude navigation enters the provider tab
  without creating a provider draft or fallback.
- Confirm no Agent composer/workspace/run-event code needs to change in Phase A.
- Confirm English and Chinese use the literal blocking concept
  `Filesystem isolation required` / `需要文件系统隔离` and do not soften it to a
  ready, read-only, or safe claim.
