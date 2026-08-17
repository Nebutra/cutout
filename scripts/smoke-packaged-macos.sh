#!/usr/bin/env bash
set -euo pipefail

bundle_root="${1:?bundle root is required}"
host_arch="$(uname -m)"
result_root="$HOME/Library/Application Support/com.nebutra.cutout.packaged-e2e-evidence"
result_file="$result_root/result.json"
progress_file="$result_root/progress.json"
foreground_file="$result_root/foreground.json"
terminal_evidence="$result_root/final-evidence"
log_file="$result_root/cutout-package-smoke.log"
driver_log="$result_root/cutout-package-smoke-driver.log"
pid=""
frontmost_sample_count=0
frontmost_change_count=0
frontmost_consecutive_change_count=0
frontmost_max_consecutive_change_count=0
baseline_frontmost_bundle_id=""
baseline_frontmost_bundle_id_sha256=""
smoke_terminal_reason="script-error"
smoke_mode="full"
[[ "${CUTOUT_PACKAGED_E2E_WINDOW_PROBE:-0}" == "1" ]] && smoke_mode="window-probe"
packaged_e2e_proxy_env=()
packaged_e2e_proxy_enabled=0

descendant_process_ids() {
  local parent_pid="$1"
  local child_pid
  while IFS= read -r child_pid; do
    [[ "$child_pid" =~ ^[0-9]+$ ]] || continue
    printf '%s\n' "$child_pid"
    descendant_process_ids "$child_pid"
  done < <(pgrep -P "$parent_pid" 2>/dev/null || true)
}

cleanup_test_process() {
  [[ -n "$pid" ]] || return 0
  local tracked_pids=("$pid")
  local child_pid
  while IFS= read -r child_pid; do
    [[ "$child_pid" =~ ^[0-9]+$ ]] && tracked_pids+=("$child_pid")
  done < <(descendant_process_ids "$pid")
  kill "${tracked_pids[@]}" 2>/dev/null || true
  for _ in {1..20}; do
    local alive=0
    for child_pid in "${tracked_pids[@]}"; do
      if kill -0 "$child_pid" 2>/dev/null; then
        alive=1
        break
      fi
    done
    ((alive == 0)) && return 0
    sleep 0.25
  done
  kill -KILL "${tracked_pids[@]}" 2>/dev/null || true
}

finalize_packaged_e2e() {
  local smoke_exit_code=$?
  trap - EXIT TERM INT HUP
  cleanup_test_process
  if [[ ! -f "$foreground_file" && -n "$baseline_frontmost_bundle_id_sha256" ]]; then
    printf '{"foregroundOwnershipPreserved":true,"sampleCount":%d,"changedSampleCount":%d,"maxConsecutiveChangedSamples":%d,"baselineBundleIdSha256":"%s"}\n' \
      "$frontmost_sample_count" "$frontmost_change_count" \
      "$frontmost_max_consecutive_change_count" "$baseline_frontmost_bundle_id_sha256" \
      >"$foreground_file"
  fi
  if ! node scripts/validate-packaged-e2e-evidence.mjs \
    --finalize "$result_root" "$smoke_exit_code" "$smoke_mode" "$smoke_terminal_reason"; then
    smoke_exit_code=1
  fi
  exit "$smoke_exit_code"
}

terminate_packaged_e2e() {
  local reason="$1"
  local exit_code="$2"
  trap - TERM INT HUP
  smoke_terminal_reason="$reason"
  exit "$exit_code"
}

if [[ "${CUTOUT_PACKAGED_E2E:-0}" == "1" ]]; then
  previous_result_root="$result_root.previous"
  rm -rf -- "$previous_result_root"
  if [[ -d "$result_root" ]]; then
    mv -- "$result_root" "$previous_result_root"
  fi
fi
mkdir -p -- "$result_root"
chmod 700 "$result_root"
if [[ "${CUTOUT_PACKAGED_E2E:-0}" == "1" ]]; then
  : >"$driver_log"
  # The remote driver owns no inherited terminal pipe after this point. App and
  # WebKit descendants can therefore never keep an SSH/expect session open
  # after the smoke owner has finalized its evidence and exited.
  exec >>"$driver_log" 2>&1
  rm -rf -- "$terminal_evidence"
  trap finalize_packaged_e2e EXIT
  trap 'terminate_packaged_e2e terminated 143' TERM
  trap 'terminate_packaged_e2e interrupted 130' INT
  trap 'terminate_packaged_e2e hangup 129' HUP
fi

if [[ -n "${CUTOUT_PACKAGED_E2E_HTTPS_PROXY:-}" ]]; then
  packaged_e2e_https_proxy="${CUTOUT_PACKAGED_E2E_HTTPS_PROXY%/}"
  if [[ ! "$packaged_e2e_https_proxy" =~ ^http://127\.0\.0\.1:([0-9]{1,5})$ ]]; then
    smoke_terminal_reason="preflight-failed"
    echo "Packaged E2E blocked: HTTPS proxy must be an HTTP loopback URL with an explicit port." >&2
    exit 1
  fi
  packaged_e2e_proxy_port="${BASH_REMATCH[1]}"
  if ((10#$packaged_e2e_proxy_port < 1 || 10#$packaged_e2e_proxy_port > 65535)); then
    smoke_terminal_reason="preflight-failed"
    echo "Packaged E2E blocked: HTTPS proxy port is outside the valid range." >&2
    exit 1
  fi
  packaged_e2e_proxy_env=(
    "CUTOUT_PACKAGED_E2E_HTTPS_PROXY=$packaged_e2e_https_proxy"
  )
  packaged_e2e_proxy_enabled=1
fi

app="$(find "$bundle_root" -maxdepth 1 -name '*.app' -type d -print -quit)"
test -n "$app"
app="$(cd "$app" && pwd -P)"
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
      *) smoke_terminal_reason="preflight-failed"; echo "Cannot infer bundle architecture from $bundle_root" >&2; exit 1 ;;
    esac
    ;;
esac

# The release matrix cross-compiles both macOS architectures. Only execute the
# artifact matching this runner; the sibling matrix entry verifies its bundle.
if [[ "$host_arch" != "$bundle_arch" ]]; then
  echo "Skipping $bundle_arch launch on $host_arch host."
  if [[ "${CUTOUT_PACKAGED_E2E:-0}" == "1" ]]; then
    smoke_terminal_reason="preflight-failed"
    exit 1
  fi
  exit 0
fi

if [[ "${CUTOUT_PACKAGED_E2E:-0}" == "1" ]]; then
  smoke_terminal_reason="preflight-failed"
  codesign --verify --deep --strict --verbose=2 "$app"
  [[ "$(/usr/libexec/PlistBuddy -c 'Print :LSUIElement' "$app/Contents/Info.plist")" == "true" ]] || {
    echo "Packaged E2E blocked: bundle is not declared as a background UI agent." >&2
    exit 1
  }
  bundle_signature="$(codesign -dvvv "$app" 2>&1)"
  bundle_identifier="$(sed -n 's/^Identifier=//p' <<<"$bundle_signature")"
  bundle_team="$(sed -n 's/^TeamIdentifier=//p' <<<"$bundle_signature")"
  [[ "$bundle_identifier" == "com.nebutra.cutout.packaged-e2e" ]] || {
    echo "Packaged E2E blocked: bundle identifier is not isolated." >&2
    exit 1
  }
  [[ "$bundle_team" =~ ^[A-Z0-9]{10}$ ]] || {
    echo "Packaged E2E blocked: bundle has no Developer ID Team." >&2
    exit 1
  }

  expected_team="${CUTOUT_PACKAGED_E2E_TEAM_ID:-}"
  if [[ -z "$expected_team" ]]; then
    installed_app="/Applications/Cutout.app"
    [[ -d "$installed_app" ]] || {
      echo "Packaged E2E blocked: CUTOUT_PACKAGED_E2E_TEAM_ID is required when production Cutout is not installed." >&2
      exit 1
    }
    codesign --verify --deep --strict "$installed_app"
    installed_signature="$(codesign -dvvv "$installed_app" 2>&1)"
    expected_team="$(sed -n 's/^TeamIdentifier=//p' <<<"$installed_signature")"
  fi
  [[ "$expected_team" =~ ^[A-Z0-9]{10}$ && "$bundle_team" == "$expected_team" ]] || {
    echo "Packaged E2E blocked: bundle Team does not match trusted production Cutout." >&2
    exit 1
  }
fi

e2e_bundle_id="com.nebutra.cutout.packaged-e2e"
frontmost_change_failure_streak=2

frontmost_bundle_id() {
  local application
  application="$(lsappinfo front 2>/dev/null || true)"
  [[ -n "$application" ]] || return 0
  lsappinfo info -only bundleID "$application" 2>/dev/null \
    | sed -nE 's/^"CFBundleIdentifier"="([^"]+)"$/\1/p'
}

assert_e2e_is_not_frontmost() {
  local current_bundle_id
  frontmost_sample_count=$((frontmost_sample_count + 1))
  current_bundle_id="$(frontmost_bundle_id)"
  # The user is free to switch between foreground applications while the
  # isolated run is working. Only this dedicated bundle becoming frontmost is
  # a violation; comparing every sample to the original foreground app turns
  # normal user activity into a false E2E failure.
  if [[ "$current_bundle_id" == "$e2e_bundle_id" ]]; then
    frontmost_change_count=$((frontmost_change_count + 1))
    frontmost_consecutive_change_count=$((frontmost_consecutive_change_count + 1))
    if ((frontmost_consecutive_change_count > frontmost_max_consecutive_change_count)); then
      frontmost_max_consecutive_change_count="$frontmost_consecutive_change_count"
    fi
  else
    frontmost_consecutive_change_count=0
  fi
  if ((frontmost_consecutive_change_count >= frontmost_change_failure_streak)); then
    printf '{"foregroundOwnershipPreserved":false,"sampleCount":%d,"changedSampleCount":%d,"maxConsecutiveChangedSamples":%d,"baselineBundleIdSha256":"%s"}\n' \
      "$frontmost_sample_count" "$frontmost_change_count" \
      "$frontmost_max_consecutive_change_count" "$baseline_frontmost_bundle_id_sha256" \
      >"$foreground_file"
    smoke_terminal_reason="foreground-activation"
    echo "Packaged background E2E changed foreground ownership." >&2
    exit 1
  fi
}

if [[ "${CUTOUT_PACKAGED_E2E:-0}" == "1" ]]; then
  smoke_terminal_reason="preflight-failed"
  baseline_frontmost_bundle_id="$(frontmost_bundle_id)"
  [[ -n "$baseline_frontmost_bundle_id" \
    && "$baseline_frontmost_bundle_id" != "$e2e_bundle_id" \
    && "$baseline_frontmost_bundle_id" != "com.apple.SecurityAgent" ]] || {
    echo "Packaged E2E blocked: foreground baseline is unavailable or interactive." >&2
    exit 1
  }
  baseline_frontmost_bundle_id_sha256="$(
    printf '%s' "$baseline_frontmost_bundle_id" | shasum -a 256 | awk '{print $1}'
  )"
  login_keychain="$HOME/Library/Keychains/login.keychain-db"
  if ! security show-keychain-info "$login_keychain" >/dev/null 2>&1; then
    echo "Packaged E2E blocked: the test user's login Keychain must already be unlocked." >&2
    exit 1
  fi
  state_archive="/private/tmp/cutout-packaged-e2e-state-archive-$(date +%Y%m%d-%H%M%S)"
  for state_path in \
    "$HOME/Library/Application Support/com.nebutra.cutout.packaged-e2e" \
    "$HOME/Library/WebKit/com.nebutra.cutout.packaged-e2e"; do
    if [[ -e "$state_path" ]]; then
      mkdir -p "$state_archive"
      mv "$state_path" "$state_archive/$(basename "$(dirname "$state_path")")"
    fi
  done
  # The E2E bundle uses an isolated application id, while production Cutout's
  # Keychain service is intentionally stable. Project only strict, non-secret
  # Provider metadata into the clean harness so native discovery can re-check
  # the matching local credentials without copying or exposing key material.
  node scripts/stage-packaged-e2e-provider-registry.mjs
  unset CUTOUT_PACKAGED_E2E_IMAGE_MODEL
  for capture_id in design-systems prototype-suites selected-delivery failure; do
    rm -f -- "$result_root/captures/$capture_id.png"
  done
fi
rm -f -- "$result_file"
rm -f -- "$progress_file"
rm -f -- "$foreground_file"
: >"$log_file"
if [[ "${CUTOUT_PACKAGED_E2E:-0}" == "1" ]]; then
  if pgrep -f -x -- "$binary" >/dev/null 2>&1; then
    echo "Packaged E2E blocked: an isolated test bundle process is already running." >&2
    exit 1
  fi
  # Launch in the smoke owner's audit session so an unlocked, test-scoped
  # Keychain remains readable without SecurityAgent interaction. The dedicated
  # bundle's native lifecycle still owns background activation and visibility.
  (
    trap - EXIT TERM INT HUP
    if ((packaged_e2e_proxy_enabled == 1)); then
      exec env -u HTTPS_PROXY -u https_proxy -u ALL_PROXY -u all_proxy \
        CUTOUT_PACKAGED_E2E=1 \
        "${packaged_e2e_proxy_env[@]}" \
        "$binary"
    fi
    exec env CUTOUT_PACKAGED_E2E=1 "$binary"
  ) >"$log_file" 2>&1 &
  pid=$!
else
  (
    trap - EXIT TERM INT HUP
    exec "$binary"
  ) >"$log_file" 2>&1 &
  pid=$!
fi
smoke_terminal_reason="process-exited"

for _ in {1..20}; do
  if kill -0 "$pid" 2>/dev/null; then
    if [[ "${CUTOUT_PACKAGED_E2E:-0}" == "1" ]]; then
      assert_e2e_is_not_frontmost
    fi
    sleep 0.25
    continue
  fi
  cat "$log_file" >&2
  echo "Packaged Cutout process exited during startup." >&2
  exit 1
done

echo "Packaged Cutout remained alive through the startup window."

if [[ "${CUTOUT_PACKAGED_E2E:-0}" == "1" ]]; then
  if [[ "${CUTOUT_PACKAGED_E2E_WINDOW_PROBE:-0}" == "1" ]]; then
    probe_seconds="${CUTOUT_PACKAGED_E2E_WINDOW_PROBE_SECONDS:-60}"
    for ((second = 0; second < probe_seconds; second += 1)); do
      kill -0 "$pid" 2>/dev/null || break
      assert_e2e_is_not_frontmost
      sleep 1
    done
    kill -0 "$pid" 2>/dev/null || {
      cat "$log_file" >&2
      echo "Packaged background window probe exited early." >&2
      exit 1
    }
    test -s "$result_root/captures/design-systems.png" || {
      echo "Packaged background window probe produced no native capture." >&2
      exit 1
    }
    jq -e '.phases | any(.id == "window-probe-ready" and .status == "passed")' \
      "$progress_file" >/dev/null
    printf '{"foregroundOwnershipPreserved":true,"sampleCount":%d,"changedSampleCount":%d,"maxConsecutiveChangedSamples":%d,"baselineBundleIdSha256":"%s"}\n' \
      "$frontmost_sample_count" "$frontmost_change_count" \
      "$frontmost_max_consecutive_change_count" "$baseline_frontmost_bundle_id_sha256" \
      >"$foreground_file"
    smoke_terminal_reason="window-probe-passed"
    echo "Packaged background window probe passed."
    exit 0
  fi
  # Route, suite and material counts come from the resolved Agent plan. One hour
  # is the outer delivery budget; exceeding it is a performance failure rather
  # than permission to wait for every theoretical per-stage timeout.
  e2e_timeout_seconds="${CUTOUT_PACKAGED_E2E_TIMEOUT_SECONDS:-3600}"
  for ((second = 0; second < e2e_timeout_seconds; second += 1)); do
    test -f "$result_file" && break
    kill -0 "$pid" 2>/dev/null || break
    assert_e2e_is_not_frontmost
    sleep 1
  done
  if [[ ! -f "$result_file" ]]; then
    if kill -0 "$pid" 2>/dev/null; then
      smoke_terminal_reason="outer-timeout"
    else
      smoke_terminal_reason="process-exited"
    fi
    test ! -f "$progress_file" || cat "$progress_file" >&2
    cat "$log_file" >&2
    echo "Packaged background E2E produced no result." >&2
    exit 1
  fi
  printf '{"foregroundOwnershipPreserved":true,"sampleCount":%d,"changedSampleCount":%d,"maxConsecutiveChangedSamples":%d,"baselineBundleIdSha256":"%s"}\n' \
    "$frontmost_sample_count" "$frontmost_change_count" \
    "$frontmost_max_consecutive_change_count" "$baseline_frontmost_bundle_id_sha256" \
    >"$foreground_file"
  if node -e 'const fs=require("node:fs");const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.exit(value?.protocol==="cutout.packaged-e2e-result.v1"&&value?.status==="failed"?0:1)' \
    "$result_file"; then
    smoke_terminal_reason="product-failed"
    exit 1
  fi
  smoke_terminal_reason="evidence-invalid"
  node scripts/validate-packaged-e2e-evidence.mjs "$result_root"
  smoke_terminal_reason="passed"
  echo "Packaged hidden-WebView E2E passed."
fi
