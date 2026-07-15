#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)";cd "$ROOT"
PNPM="${PNPM:-npx -y -p pnpm@10.24.0 pnpm}";mode="${1:---local}"
case "$mode" in --local|--distribute) ;; *) echo "Usage: scripts/release-macos.sh [--local|--distribute]" >&2;exit 2;; esac
node scripts/validate-release-version.mjs
if [[ "$mode" == "--distribute" ]];then
 identity_count="$(security find-identity -p codesigning -v 2>/dev/null|awk '/valid identities found/{print $1}')"
 [[ "${identity_count:-0}" -gt 0 ]]||{ echo "Distribution blocked: no valid Developer ID Application identity." >&2;exit 3; }
 [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]||{ echo "Distribution blocked: APPLE_SIGNING_IDENTITY is unset." >&2;exit 3; }
 [[ -n "${APPLE_API_KEY:-}"&&-n "${APPLE_API_ISSUER:-}" ]]||{ echo "Distribution blocked: notarization credentials are unset." >&2;exit 3; }
 [[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]||{ echo "Distribution blocked: TAURI_SIGNING_PRIVATE_KEY is unset." >&2;exit 3; }
 [[ -n "${CUTOUT_UPDATER_PUBKEY:-}"&&-n "${CUTOUT_UPDATER_ALLOWED_HOSTS:-}" ]]||{ echo "Distribution blocked: updater public key or host allowlist is unset." >&2;exit 3; }
fi
$PNPM lint;$PNPM test;$PNPM build
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo check --manifest-path src-tauri/Cargo.toml
if [[ "$mode" == "--distribute" ]];then
 $PNPM tauri build --bundles app,dmg
else echo "Local release gate passed. Signing/notarization were not claimed or attempted.";fi
