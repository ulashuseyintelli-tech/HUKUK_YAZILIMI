#!/bin/bash
set -euo pipefail
# CI-4: trust proxy ayari kontrolu
# Spesifik pattern: set('trust proxy', 1) — sadece string match degil, tam cagri

MATCH=$(grep -n "set('trust proxy'" apps/api/src/main.ts || true)

if [ -z "$MATCH" ]; then
  echo "CI-4 FAIL: main.ts'de set('trust proxy', ...) ayari bulunamadi"
  exit 1
fi
echo "CI-4 PASS: trust proxy ayari mevcut"
echo "$MATCH"
