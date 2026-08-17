#!/usr/bin/env bash
set -euo pipefail

target="${1:-}"
bundles="${2:-}"

case "$target" in
  aarch64-apple-darwin|x86_64-apple-darwin) ;;
  *)
    echo "Unsupported macOS release target: $target" >&2
    exit 2
    ;;
esac

if [[ "$bundles" != "app,dmg" ]]; then
  echo "Unsupported macOS release bundle set: $bundles" >&2
  exit 2
fi

log_root="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
attempt_log="$(mktemp "$log_root/cutout-macos-release.XXXXXX.log")"
trap 'rm -f -- "$attempt_log"' EXIT

run_build() {
  pnpm tauri build \
    --config src-tauri/tauri.release.conf.json \
    --target "$target" \
    --bundles "$bundles" 2>&1 | tee "$attempt_log"
  return "${PIPESTATUS[0]}"
}

set +e
run_build
status=$?
set -e
if [[ "$status" -eq 0 ]]; then
  exit 0
fi

timestamp_error='A timestamp was expected but was not found.'
if ! grep -Fq -- "$timestamp_error" "$attempt_log"; then
  exit "$status"
fi

retry_delay_seconds="${CUTOUT_MACOS_TIMESTAMP_RETRY_DELAY_SECONDS:-15}"
if [[ ! "$retry_delay_seconds" =~ ^([0-9]|[1-5][0-9]|60)$ ]]; then
  echo "CUTOUT_MACOS_TIMESTAMP_RETRY_DELAY_SECONDS must be an integer from 0 through 60." >&2
  exit 2
fi

echo "Apple timestamp service did not attach a trusted timestamp; retrying the macOS bundle build once." >&2
bundle_root="src-tauri/target/$target/release/bundle"
rm -rf -- "$bundle_root/macos" "$bundle_root/dmg"
: > "$attempt_log"
sleep "$retry_delay_seconds"

set +e
run_build
status=$?
set -e
exit "$status"
