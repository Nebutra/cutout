#!/usr/bin/env bash
set -euo pipefail
APP_ID="com.leishi.cutout";SOURCE="${HOME}/Library/Application Support/${APP_ID}";DESTINATION="${1:-${PWD}/release-data-drill}"
mkdir -p "$DESTINATION";stamp="$(date -u +%Y%m%dT%H%M%SZ)";archive="${DESTINATION}/${APP_ID}-${stamp}.tar.gz"
if [[ -d "$SOURCE" ]];then tar -C "$(dirname "$SOURCE")" -czf "$archive" "$(basename "$SOURCE")";else mkdir -p "$DESTINATION/empty/${APP_ID}";tar -C "$DESTINATION/empty" -czf "$archive" "$APP_ID";fi
tar -tzf "$archive" >/dev/null
verify="$(mktemp -d)";trap 'rm -rf "$verify"' EXIT
tar -xzf "$archive" -C "$verify";test -d "$verify/$APP_ID"
echo "Backup/restore drill passed: $archive"
