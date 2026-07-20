#!/usr/bin/env bash
set -euo pipefail

bundle_root="${1:?bundle root is required}"
host_arch="$(uname -m)"

case "$bundle_root" in
  *aarch64-apple-darwin*) bundle_arch=arm64 ;;
  *x86_64-apple-darwin*) bundle_arch=x86_64 ;;
  *) echo "Cannot infer bundle architecture from $bundle_root" >&2; exit 1 ;;
esac

# The release matrix cross-compiles both macOS architectures. Only execute the
# artifact matching this runner; the sibling matrix entry verifies its bundle.
if [[ "$host_arch" != "$bundle_arch" ]]; then
  echo "Skipping $bundle_arch launch on $host_arch host."
  exit 0
fi

app="$(find "$bundle_root" -maxdepth 1 -name '*.app' -type d -print -quit)"
test -n "$app"
executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Contents/Info.plist")"
binary="$app/Contents/MacOS/$executable"
test -x "$binary"

log_file="${RUNNER_TEMP:-/tmp}/cutout-package-smoke.log"
"$binary" >"$log_file" 2>&1 &
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
