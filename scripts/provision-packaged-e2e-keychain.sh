#!/usr/bin/env bash
set -euo pipefail

action="${1:-}"
remote="${2:-}"
provider_id="${3:-}"
remote_binary="${4:-}"
service="com.nebutra.cutout"
helper_source="scripts/macos-packaged-e2e-keychain.swift"
remote_helper_source="/private/tmp/cutout-packaged-e2e-keychain.swift"
remote_helper_binary="/private/tmp/cutout-packaged-e2e-keychain"
remote_keychain_password="${CUTOUT_PACKAGED_E2E_KEYCHAIN_PASSWORD:-}"

usage() {
  echo "Usage: $0 <provision|delete> <user@host> <provider-id> <remote-e2e-binary>" >&2
  exit 64
}

[[ "$action" == "provision" || "$action" == "delete" ]] || usage
[[ "$remote" =~ ^[A-Za-z0-9._-]+@([A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])$ ]] || usage
[[ "$provider_id" =~ ^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$ ]] || usage
[[ "$remote_binary" =~ ^/private/tmp/cutout-e2e-[A-Za-z0-9._/-]+/bundle/Cutout\.app/Contents/MacOS/(app|Cutout)$ ]] || usage
[[ -n "$remote_keychain_password" && ${#remote_keychain_password} -le 1024 ]] || {
  echo "CUTOUT_PACKAGED_E2E_KEYCHAIN_PASSWORD is required for the ephemeral VM user." >&2
  exit 64
}

ssh_options=(
  -o BatchMode=yes
  -o ConnectTimeout=10
  -o StrictHostKeyChecking=accept-new
)
account="provider:${provider_id}"

cleanup_remote_helper() {
  ssh "${ssh_options[@]}" "$remote" \
    "rm -f '$remote_helper_source' '$remote_helper_binary'" >/dev/null 2>&1 || true
}
trap cleanup_remote_helper EXIT TERM INT HUP

test -f "$helper_source"
scp "${ssh_options[@]}" "$helper_source" "$remote:$remote_helper_source" >/dev/null
ssh "${ssh_options[@]}" "$remote" \
  "xcrun swiftc -O '$remote_helper_source' -o '$remote_helper_binary' && codesign --verify --deep --strict '$remote_binary'"

if [[ "$action" == "delete" ]]; then
  printf '%s\n' "$remote_keychain_password" | ssh "${ssh_options[@]}" "$remote" \
    "'$remote_helper_binary' delete '$provider_id' '$remote_binary'"
  echo "Removed the packaged E2E Provider credential from the remote Keychain."
  exit 0
fi

security find-generic-password -s "$service" -a "$account" >/dev/null

# `security ... -w <value>` would expose the secret in argv. The remote helper
# reads the value from stdin and binds its Keychain ACL to the signed E2E binary.
{
  printf '%s\n' "$remote_keychain_password"
  security find-generic-password -s "$service" -a "$account" -w
} |
  ssh "${ssh_options[@]}" "$remote" \
    "'$remote_helper_binary' provision '$provider_id' '$remote_binary'"

ssh "${ssh_options[@]}" "$remote" \
  "security find-generic-password -s '$service' -a '$account' >/dev/null"
echo "Provisioned one packaged E2E Provider credential in the remote Keychain."
