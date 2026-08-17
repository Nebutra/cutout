# Qianwen Cross-Border Commerce Agent

Self-contained Node 22 submission package for Debian 12 x86_64. The runtime has
no third-party dependencies and does not install packages.

```sh
node agent.js --version
node agent.js --prompt "Input directory: /absolute/input Output directory: /absolute/output"
```

`DASHSCOPE_API_KEY` is required. `AGENT_LOG_DIR` is optional; when omitted the
Agent uses a no-file log sink and writes only the requested output directory.
When provided, it must be a separate absolute directory. `DASHSCOPE_BASE_URL`
or `OPENAI_BASE_URL` may provide the official DashScope origin, exact `/api/v1`
base, or exact `/compatible-mode/v1` base. Production validation rejects other
origins and base paths.

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

Category selection receives bounded exact leaves with their complete catalog
lineage. Candidate retrieval uses general garment, audience, usage-context and
plus-size evidence rather than product IDs or public-sample answers. Product and
sales attributes remain source-pointer bound. The Host also renders source values
beside deterministic US, Korean and Brazilian size or measurement displays; the
model cannot author numeric conversions.

Facts that still contain source-market script after deterministic localization
are included in the same structured-plan call as a bounded, ordered fact-id
inventory. The response must close that inventory exactly for all three markets;
missing, reordered, script-leaking, numeric-drifted, or model/size-drifted entries
fail before media generation. Rendered copy keeps the original source value in
inline evidence and its JSON Pointer while target-market prose remains
script-clean. The public benchmark measures request closure only, not translation
quality, live Provider behavior, official scoring, or SOTA.

Image generation uses one deterministic semantic role-to-source plan. Alternate
angle and silhouette roles prefer non-anchor product views; texture, finish and
merchandising roles prefer description media and fall back to the best available
non-anchor product view. The strategy document records each delivered role's
purpose, source pointer, actual semantic-QA closure, repair status, and an exact
0.0-5.0 second video storyboard. These offline and testable contracts do not
claim live Provider quality or leaderboard rank.
