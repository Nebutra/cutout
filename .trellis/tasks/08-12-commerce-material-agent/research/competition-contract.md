# Qianwen cross-border material Agent research

Source inspected 2026-08-12:
`https://www.qianwenai.com/arena/competitions/cross-border-material-agent`

## Runtime and package

- ZIP at most 100 MB; root directory is `agent`.
- Root entrypoint: `agent.py`, `agent.js`, `agent.jar` or Go `agent`.
- Root `agent.json`: lowercase runtime plus numeric three-part semver.
- Supported runtime: Debian 12 x86_64 with Python 3.12, Node 22, JDK 17 or Go
  1.22. Dependencies must be included; runtime has no network install.
- Invocation uses `--prompt` natural language containing input/output paths;
  `--version` must print the `agent.json` version; success is exit 0.
- `DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL`, `OPENAI_BASE_URL` and
  `AGENT_LOG_DIR` are provided. Log to `AGENT_LOG_DIR/agent.log`.
- Only Qianwen platform model traffic and returned artifact URLs are reachable.
  No MCP, Agent apps, workflows, memory, retrieval, embeddings, Responses API,
  model tools or local-file upload. Handle rate limits.
- Limit: 30 minutes and 4 GB RAM.

## Outputs

- `product_description_en`, `product_description_ko`,
  `product_description_pt`: txt/md, each with title, SKU breakdown, attributes,
  source platform, product id/URL and image/video names plus descriptions.
- `main_image`: one PNG/JPEG, at least 800 x 800.
- `detail_image_1` through `detail_image_5`: PNG/JPEG, both dimensions above
  260 px, each at most 5 MB.
- `product_video`: playable MP4/MOV, below 200 MB.
- `strategy_document`: txt/md describing actual design/generation strategy.

## Machine scoring

- A1 content compliance: 25%.
- A2 completeness and physical specifications: 20%.
- A3 exact leaf category, attributes and sale attributes: 18%.
- A4 visual/copy/spelling/unit/size/cultural/channel localization: 15%.
- A5 source-data fact consistency and source annotation: 10%.
- A6 usable image ratio at least 80%: 7%.
- A7 playable video without intolerable defects: 5%.

Expert scoring is strategy 35%, images 30%, video 20%, experience 15%.

## Public sample observations

`Task_Data.zip` contained eleven nested product JSON records plus
`clothing_categories.json` (~1.4 MB) and `clothing_attributes.json` (~1.9 MB).
Product data is nested below `ret.result.result` and includes source platform,
URL/id, Chinese subject/category, HTML description, product attributes, SKU
records and media URLs. The adapter must normalize structure and provenance
rather than pass the raw response or HTML to a model as trusted instructions.

## Implications

1. Compliance, deterministic output checks, category closure and fact lineage
   cover 73% before subjective image/video quality; implement them first.
2. An offline policy pack is necessary because runtime web research is banned.
3. A portable Node production host is necessary because desktop Tauri execution
   cannot run in the evaluator sandbox.
4. Video must be a real typed async Provider artifact path; current Cutout video
   reference extraction and capability catalog are not a generation pipeline.
5. The competition prompt/output format belongs in target/source adapters, not
   in the generic production state machine.
