# Qianwen Cross-Border Commerce Agent

Self-contained Node 22 submission package for Debian 12 x86_64. The runtime has
no third-party dependencies and does not install packages.

```sh
node agent.js --version
node agent.js --prompt "Input directory: /absolute/input Output directory: /absolute/output"
```

Required environment variables are `DASHSCOPE_API_KEY` and `AGENT_LOG_DIR`.
`DASHSCOPE_BASE_URL` or `OPENAI_BASE_URL` may provide the official DashScope
origin/compatible-mode base. Production validation rejects other origins.

The output directory must initially be empty. The Agent publishes exactly three
localized Markdown descriptions, six PNG/JPEG images, one MP4 video, and
one Markdown strategy document after all deterministic validation gates pass.

Validate an already completed output root offline and optionally write the
sanitized, path-free JSON evidence outside that root:

```sh
node scripts/validate-rehearsal.js --output-root /canonical/absolute/output
node scripts/validate-rehearsal.js --output-root /canonical/absolute/output \
  --report /canonical/absolute/evidence.json
```

The evidence records exact closure, decoded image dimensions, package-native
MP4 container/video-track/sample-table structure, artifact hashes, and A1-A7
physical prerequisites. It does not claim end-to-end codec playback or
subjective media quality and never includes
document bodies, source URLs, Provider identifiers, credentials, or checkpoint
contents.

Localized product copy is model-authored from supplied facts. The seven media
inventory lines are different: after generation and QA, the Host projects them
from exact physical filenames and the fixed semantic role contract. A model
cannot predeclare scene contents that the delivered image or video may not
contain, and the offline validator rejects free-form substitutions.
