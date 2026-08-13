#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Packaged E2E requires a macOS host." >&2
  exit 2
fi

installed_app="/Applications/Cutout.app"
requested_identity="${APPLE_SIGNING_IDENTITY:-}"
trusted_team=""
if [[ -d "$installed_app" ]]; then
  codesign --verify --deep --strict "$installed_app"
  installed_signature="$(codesign -dvvv "$installed_app" 2>&1)"
  trusted_team="$(sed -n 's/^TeamIdentifier=//p' <<<"$installed_signature")"
  [[ "$trusted_team" =~ ^[A-Z0-9]{10}$ ]] || {
    echo "Packaged E2E blocked: installed Cutout has no trusted Developer ID Team." >&2
    exit 3
  }
fi

if [[ -z "$requested_identity" ]]; then
  [[ -n "$trusted_team" ]] || {
    echo "Packaged E2E blocked: APPLE_SIGNING_IDENTITY is required when production Cutout is not installed." >&2
    exit 3
  }
  matching_identities=()
  while IFS= read -r identity; do
    matching_identities+=("$identity")
  done < <(
    security find-identity -v -p codesigning 2>/dev/null \
      | sed -nE 's/^.*"(Developer ID Application: .+ \('"$trusted_team"'\))"$/\1/p' \
      | sort -u
  )
  [[ "${#matching_identities[@]}" -eq 1 ]] || {
    echo "Packaged E2E blocked: expected exactly one Developer ID identity for the installed Cutout Team." >&2
    exit 3
  }
  requested_identity="${matching_identities[0]}"
fi

[[ "$requested_identity" =~ ^Developer\ ID\ Application:\ .+\ \(([A-Z0-9]{10})\)$ ]] || {
  echo "Packaged E2E blocked: APPLE_SIGNING_IDENTITY is not a Developer ID Application identity." >&2
  exit 3
}
identity_team="${BASH_REMATCH[1]}"
if [[ -n "$trusted_team" && "$identity_team" != "$trusted_team" ]]; then
  echo "Packaged E2E blocked: signing identity does not match the installed Cutout Team." >&2
  exit 3
fi
security find-identity -v -p codesigning 2>/dev/null \
  | grep -Fq "\"$requested_identity\"" || {
    echo "Packaged E2E blocked: requested Developer ID identity is unavailable." >&2
    exit 3
  }

export APPLE_SIGNING_IDENTITY="$requested_identity"
VITE_CUTOUT_PACKAGED_E2E=1 pnpm tauri build \
  --features packaged-e2e \
  --config src-tauri/tauri.e2e.conf.json

app="src-tauri/target/release/bundle/macos/Cutout.app"
codesign --verify --deep --strict --verbose=2 "$app"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :LSUIElement' "$app/Contents/Info.plist")" == "true" ]] || {
  echo "Packaged E2E blocked: bundle is not declared as a background UI agent." >&2
  exit 3
}
signature="$(codesign -dvvv "$app" 2>&1)"
identifier="$(sed -n 's/^Identifier=//p' <<<"$signature")"
team="$(sed -n 's/^TeamIdentifier=//p' <<<"$signature")"
authority="$(sed -n 's/^Authority=//p' <<<"$signature" | head -1)"
[[ "$identifier" == "com.nebutra.cutout.packaged-e2e" ]] || {
  echo "Packaged E2E blocked: bundle identifier is not isolated." >&2
  exit 3
}
[[ "$team" == "$identity_team" && "$authority" == "$requested_identity" ]] || {
  echo "Packaged E2E blocked: built bundle is not signed by the requested Developer ID." >&2
  exit 3
}

echo "Built signed packaged E2E bundle for Team $team."
