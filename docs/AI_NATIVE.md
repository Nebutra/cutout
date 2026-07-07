# Cutout AI Native

Cutout exposes a local JSON queue so coding agents can control the running app
without clicking the UI.

## Paths

Run:

```sh
pnpm ai paths
```

On macOS the queue root is:

```text
~/Library/Application Support/com.leishi.cutout/ai-native
```

Agents may write `*.json` commands to `inbox/`. The app moves them to
`processing/`, executes them in the webview, then writes results to `outbox/`.
Invalid input is written to `failed/`.
Generated experimental assets are written to `artifacts/`.

## CLI

```sh
pnpm ai get-state
pnpm ai get-ai-config
pnpm ai upsert-provider '{"kind":"openai-compatible","label":"Mox","baseUrl":"https://aigw.mox.ktvsky.com","defaultModel":"gpt-image-1","enabled":true}'
echo "$OPENAI_API_KEY" | pnpm ai set-provider-key <providerId> -
pnpm ai set-model-assignment image <providerId> gpt-image-1
pnpm ai set-brief "政府官网"
pnpm ai set-param threshold 246
pnpm ai set-params '{"threshold":246,"minArea":900,"mergeGap":18,"padding":10}'
pnpm ai import-board /absolute/path/sheet.png
pnpm ai import-mockup /absolute/path/mockup.png
pnpm ai run-cutout
pnpm ai generate-mockup
pnpm ai deconstruct-mockup
pnpm ai plan-and-generate
pnpm ai name-slices
pnpm ai semantic-plan "政府官网"
pnpm ai semantic-slices '{"brief":"政府官网","maxSlices":6,"routes":["text-to-image","image-to-image"]}'
```

Use `--no-wait` to only enqueue a command.

## JSON API

Envelope format:

```json
{
  "id": "stable-command-id",
  "client": "codex",
  "action": {
    "type": "set-param",
    "key": "threshold",
    "value": 246
  }
}
```

The app also accepts the action object directly if no envelope is needed.

Supported action types:

- `ping`
- `get-state` / `snapshot`
- `get-ai-config`
- `set-model-assignment`
- `clear-model-assignment`
- `upsert-provider`
- `remove-provider`
- `set-provider-key`
- `test-provider`
- `set-brief`
- `set-param`
- `set-params`
- `reset-params`
- `import-board`
- `import-mockup`
- `run-cutout`
- `generate-mockup`
- `deconstruct-mockup`
- `compose-mockup`
- `plan-and-generate`
- `plan-semantic-slices`
- `run-semantic-slices`
- `rerun-subtree`
- `name-slices`
- `clear-graph`
- `set-graph`
- `reset-dag-nodes`
- `clear-intent`
- `set-intent`
- `select-slice`
- `rename-slice`
- `clear-selection`

The app window also exposes `window.__CUTOUT_AI__.dispatch(action)` and
`window.__CUTOUT_AI__.getState()` for in-webview automation and debugging.

## Semantic Slice Experiment

`plan-semantic-slices` returns a structured slice plan without generating images.
It defaults to the current brief, the configured `chat` model, and an automatic
reference image (`mockup` first, then `board`, then none).

```json
{
  "type": "plan-semantic-slices",
  "brief": "政府官网",
  "maxSlices": 8,
  "reference": "mockup"
}
```

`run-semantic-slices` plans, generates each slice, validates the result, and
writes accepted or retryable images into `ai-native/artifacts/`. It defaults to
the configured `chat` model for planning/QA and the configured `image` model for
generation.

```json
{
  "type": "run-semantic-slices",
  "brief": "政府官网",
  "maxSlices": 6,
  "routes": ["text-to-image", "image-to-image"],
  "reference": "mockup",
  "validate": true,
  "artifactPrefix": "gov"
}
```

Useful overrides:

- `providerId` / `model`: reasoning and planning model.
- `imageProviderId` / `imageModel`: image generation model.
- `validationProviderId` / `validationModel`: vision QA model.
- `reference`: `auto`, `none`, `mockup`, or `board`.
- `referencePath`: absolute image path to use instead of current app state.
- `writeArtifacts: false`: return metadata without writing generated images.
