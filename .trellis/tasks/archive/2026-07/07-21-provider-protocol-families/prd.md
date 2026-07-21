# Add custom provider protocol families

## Goal

Let users connect custom or relay endpoints that expose common LLM protocol
families, while ensuring every selectable protocol has a real runtime adapter,
correct authentication behavior, and connection validation.

## Background

- The current custom `openai-compatible` provider exposes only OpenAI
  Responses and Chat Completions wire protocols.
- Anthropic and Google already have first-class runtime adapters, but their
  protocol families cannot currently be selected for an arbitrary custom base
  URL through the same provider form.
- Protocol family is not the same as provider vendor: request paths, auth
  headers, streaming formats, and model discovery differ across families.

## Requirements

- Research and document the common protocol families justified by official
  APIs and the adapters already implemented in this repository.
- Add only protocol choices that can execute end to end through the JS adapter,
  Rust credential proxy, provider persistence/discovery, connection check, and
  generation service.
- Preserve existing OpenAI Responses and Chat Completions configurations.
- Keep protocol-specific endpoint and authentication behavior explicit; do not
  label Anthropic Messages or Gemini GenerateContent as OpenAI compatible.
- Keep secrets in the existing Rust-owned provider credential boundary.
- Synchronize form labels, schemas/types, registry metadata, Rust config and
  validation, tests, and user-facing documentation/specs in one change.
- Do not claim native protocol support for a provider unless the runtime and
  connection test both use that protocol.

## Acceptance Criteria

- [ ] The final MVP protocol list is evidence-backed and distinguishes protocol
      families from vendor presets.
- [ ] Every selectable protocol persists, reloads, validates, lists/tests models
      where supported, and creates the correct generation adapter.
- [ ] Existing provider configs migrate without user action.
- [ ] Unsupported combinations fail closed with actionable copy.
- [ ] Unit, Rust, integration, lint, type-check, and relevant visual tests pass.

## Out Of Scope

- Adding protocol names without executable runtime support.
- Generic arbitrary-header templates or user-authored request bodies.
- Runtime web fetching or provider capability claims beyond implemented calls.
