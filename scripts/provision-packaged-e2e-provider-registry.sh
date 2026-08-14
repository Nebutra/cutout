#!/usr/bin/env bash
set -euo pipefail

action="${1:-}"
remote="${2:-}"
source_registry="$HOME/Library/Application Support/com.nebutra.cutout/providers.json"
remote_staging="/private/tmp/cutout-packaged-e2e-provider-registry.json"
sanitizer="scripts/stage-packaged-e2e-provider-registry.mjs"
temporary_root=""

usage() {
  echo "Usage: $0 <provision|delete> <user@host>" >&2
  exit 64
}

[[ "$action" == "provision" || "$action" == "delete" ]] || usage
[[ "$remote" =~ ^([A-Za-z0-9._-]+)@([A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])$ ]] || usage
remote_user="${BASH_REMATCH[1]}"
remote_registry="/Users/$remote_user/Library/Application Support/com.nebutra.cutout/providers.json"
ssh_options=(
  -o BatchMode=yes
  -o ConnectTimeout=10
  -o StrictHostKeyChecking=accept-new
)

cleanup() {
  ssh "${ssh_options[@]}" "$remote" "rm -f '$remote_staging'" >/dev/null 2>&1 || true
  if [[ -n "$temporary_root" && -d "$temporary_root" ]]; then
    rm -rf -- "$temporary_root"
  fi
}
trap cleanup EXIT TERM INT HUP

if [[ "$action" == "delete" ]]; then
  ssh "${ssh_options[@]}" "$remote" "rm -f '$remote_registry'"
  echo "Removed the packaged E2E Provider registry fixture."
  exit 0
fi

test -f "$source_registry"
test -f "$sanitizer"
temporary_root="$(mktemp -d /private/tmp/cutout-packaged-e2e-provider.XXXXXX)"
sanitized_registry="$temporary_root/providers.json"

node --input-type=module - "$source_registry" "$sanitized_registry" <<'NODE'
import { stageProviderRegistry } from './scripts/stage-packaged-e2e-provider-registry.mjs'

const [, , source, destination] = process.argv
const count = await stageProviderRegistry(source, destination)
if (count < 1) process.exit(1)
process.stdout.write(`Prepared ${count} non-secret Provider record(s).\n`)
NODE

scp "${ssh_options[@]}" "$sanitized_registry" "$remote:$remote_staging" >/dev/null
ssh "${ssh_options[@]}" "$remote" \
  "mkdir -p '$(dirname "$remote_registry")' && chmod 700 '$(dirname "$remote_registry")' && mv '$remote_staging' '$remote_registry' && chmod 600 '$remote_registry'"
echo "Provisioned the packaged E2E Provider registry fixture."
