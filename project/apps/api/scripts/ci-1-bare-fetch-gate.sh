#!/bin/bash
set -euo pipefail
# CI-1: Production path'te bare fetch() kontrolu
# Allowlist tek kaynak: fetch-allowlist.md (path'ler buradan parse edilir)
#
# KAPSAM: apps/api/src/ altindaki tum TS dosyalari (spec/test haric)
# Allowlist path'leri apps/api/src/ relative (orn. modules/tariff/gazette-watcher.service.ts)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ALLOWLIST_FILE="$SCRIPT_DIR/fetch-allowlist.md"

if [ ! -f "$ALLOWLIST_FILE" ]; then
  echo "CI-1 FAIL: $ALLOWLIST_FILE bulunamadi"
  exit 1
fi

# md'den path'leri cikar: "- path/to/file - gerekce: ..." formatindan
ALLOWLIST_PATHS=$(grep '^- ' "$ALLOWLIST_FILE" | sed 's/^- //' | sed 's/ -.*//' | tr -d '`' | sort)

# Bare fetch() kullanimlarini bul (spec/test haric)
VIOLATIONS=$(grep -rn "\bfetch(" apps/api/src/ --include="*.ts" \
  | grep -v '\.spec\.ts:' \
  | grep -v '\.test\.ts:' \
  | grep -v 'fetch-with-timeout\.util\.ts:' \
  || true)

# Allowlist'teki path'leri filtrele — canonical exact match
FILTERED=""
while IFS= read -r line; do
  [ -z "$line" ] && continue
  FILE_PATH=$(echo "$line" | cut -d: -f1)
  FILE_REL=${FILE_PATH#apps/api/src/}
  MATCH=0
  while IFS= read -r allowed; do
    [ -z "$allowed" ] && continue
    if [ "$FILE_REL" = "$allowed" ]; then
      MATCH=1
      break
    fi
  done <<< "$ALLOWLIST_PATHS"
  [ "$MATCH" -eq 0 ] && FILTERED="${FILTERED}${line}"$'\n'
done <<< "$VIOLATIONS"

# Yorum satirlarini filtrele (// ile baslayan fetch referanslari)
REAL_VIOLATIONS=""
while IFS= read -r line; do
  [ -z "$line" ] && continue
  CONTENT=$(echo "$line" | cut -d: -f3-)
  TRIMMED=$(echo "$CONTENT" | sed 's/^[[:space:]]*//')
  if echo "$TRIMMED" | grep -q '^//\|^\*\|^/\*'; then
    continue
  fi
  REAL_VIOLATIONS="${REAL_VIOLATIONS}${line}"$'\n'
done <<< "$FILTERED"

if [ -n "$REAL_VIOLATIONS" ]; then
  echo "CI-1 FAIL: Bare fetch() bulundu (fetchWithTimeout kullanin):"
  echo "$REAL_VIOLATIONS"
  exit 1
fi
echo "CI-1 PASS: Tum fetch cagrilari allowlist'te veya fetchWithTimeout kullaniyor"
