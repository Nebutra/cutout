#!/usr/bin/env bash
set -euo pipefail

bundle_root="${1:?bundle root is required}"
host_arch="$(uname -m)"

app="$(find "$bundle_root" -maxdepth 1 -name '*.app' -type d -print -quit)"
test -n "$app"
executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Contents/Info.plist")"
binary="$app/Contents/MacOS/$executable"
test -x "$binary"

case "$bundle_root" in
  *aarch64-apple-darwin*) bundle_arch=arm64 ;;
  *x86_64-apple-darwin*) bundle_arch=x86_64 ;;
  *)
    binary_description="$(file -b "$binary")"
    case "$binary_description" in
      *arm64*) bundle_arch=arm64 ;;
      *x86_64*) bundle_arch=x86_64 ;;
      *) echo "Cannot infer bundle architecture from $bundle_root" >&2; exit 1 ;;
    esac
    ;;
esac

# The release matrix cross-compiles both macOS architectures. Only execute the
# artifact matching this runner; the sibling matrix entry verifies its bundle.
if [[ "$host_arch" != "$bundle_arch" ]]; then
  echo "Skipping $bundle_arch launch on $host_arch host."
  exit 0
fi

log_file="${RUNNER_TEMP:-/tmp}/cutout-package-smoke.log"
result_root="/private/tmp/cutout-packaged-e2e"
result_file="$result_root/result.json"
progress_file="$result_root/progress.json"
if [[ "${CUTOUT_PACKAGED_E2E:-0}" == "1" ]]; then
  state_archive="$result_root/state-archive-$(date +%Y%m%d-%H%M%S)"
  for state_path in \
    "$HOME/Library/Application Support/com.nebutra.cutout.packaged-e2e" \
    "$HOME/Library/WebKit/com.nebutra.cutout.packaged-e2e"; do
    if [[ -e "$state_path" ]]; then
      mkdir -p "$state_archive"
      mv "$state_path" "$state_archive/$(basename "$(dirname "$state_path")")"
    fi
  done
fi
rm -f -- "$result_file"
rm -f -- "$progress_file"
CUTOUT_PACKAGED_E2E="${CUTOUT_PACKAGED_E2E:-0}" "$binary" >"$log_file" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true' EXIT

for _ in {1..20}; do
  if kill -0 "$pid" 2>/dev/null; then
    sleep 0.25
    continue
  fi
  cat "$log_file" >&2
  echo "Packaged Cutout process exited during startup." >&2
  exit 1
done

echo "Packaged Cutout remained alive through the startup window."

if [[ "${CUTOUT_PACKAGED_E2E:-0}" == "1" ]]; then
  # The closed benchmark includes three independently generated route suites.
  # Keep this process watchdog above the sum of renderer stage budgets; route
  # and material counts come from each resolved Agent plan, while per-stage and
  # native request deadlines still fail stalled work earlier.
  e2e_timeout_seconds="${CUTOUT_PACKAGED_E2E_TIMEOUT_SECONDS:-18000}"
  for ((second = 0; second < e2e_timeout_seconds; second += 1)); do
    test -f "$result_file" && break
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  test -f "$result_file" || { test ! -f "$progress_file" || cat "$progress_file" >&2; cat "$log_file" >&2; echo "Packaged background E2E produced no result." >&2; exit 1; }
  node -e 'const fs=require("fs");const r=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(r.protocol!=="cutout.packaged-e2e-result.v1"||r.status!=="passed")process.exit(1)' "$result_file"
  echo "Packaged hidden-WebView E2E passed."
fi
