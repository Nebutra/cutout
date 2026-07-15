# Suggested Release Commit Split

Do not commit automatically. Review and stage each group independently:

1. `feat(agent-runtime)`: runtime, DAG, skills, CLI/MCP, governance contracts and tests.
2. `feat(design-os-ui)`: outcome workspace, governance UI, Workflow catalog and visual baselines.
3. `feat(registry)`: Library projection, consumer hosts, Tauri Registry transactions and receipts.
4. `chore(release)`: metadata, hardened runtime, entitlements, release/data-drill scripts and documentation.

Keep unrelated user changes out of these commits. Run the full local release gate after the final staged composition.
