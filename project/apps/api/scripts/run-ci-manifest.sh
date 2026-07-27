#!/usr/bin/env bash
set -euo pipefail

# GH-05: CI manifest runner.
#
# Bir manifest, tek bir Jest process'inde kosulacak spec dosyalarinin listesidir.
# Liste `.github/workflows/ci.yml` icinde DEGIL, `apps/api/ci-manifests/` altinda
# duz metin olarak durur. Sebep: ci.yml governance control-plane'dir; oraya spec
# eklemek her seferinde owner-ratified bir binding gerektirir. ci-manifests/
# korumali degildir, yani bir feature PR kendi spec'ini kendisi baglayabilir.
#
# ci.yml'nin bu script'i cagirmasi konsolidasyon kazancini korur: spec sayisi
# artsa da Jest process sayisi manifest sayisi kadar kalir (~13.6s sabit
# ts-jest bootstrap / process).
#
# Korunan guard'lar (GH-03 ile ayni):
#   - her spec icin `test -f` varlik kontrolu   -> silinen/tasinan spec = CI RED
#   - acik dosya listesi, regex YOK             -> desen daralmasi spec dusuremez
#   - --runInBand                               -> olculdu: bu spec sayilarinda
#                                                  worker-pool'dan HIZLI
#   - --passWithNoTests YOK                     -> sessiz gecis imkansiz
#   - bos veya eksik manifest = FAIL            -> guard'in kendisi false-green
#                                                  uretemez

NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "CI-MANIFEST FAIL: usage: run-ci-manifest.sh <manifest-name>"
  exit 1
fi

API_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="${API_DIR}/ci-manifests/${NAME}.txt"

if [ ! -f "$MANIFEST" ]; then
  echo "CI-MANIFEST FAIL: manifest bulunamadi: ${MANIFEST}"
  exit 1
fi

cd "$API_DIR"

SPECS=()
while IFS= read -r line; do
  SPECS+=("$line")
done < <(grep -vE '^[[:space:]]*(#|$)' "$MANIFEST" || true)

if [ "${#SPECS[@]}" -eq 0 ]; then
  echo "CI-MANIFEST FAIL: ${NAME} hic spec listelemiyor"
  exit 1
fi

for f in "${SPECS[@]}"; do
  if [ ! -f "$f" ]; then
    echo "MISSING spec in ${NAME}: $f"
    exit 1
  fi
done

echo "CI-MANIFEST ${NAME}: ${#SPECS[@]} spec"
exec npx jest --ci --forceExit --runInBand --runTestsByPath "${SPECS[@]}"
