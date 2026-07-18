#!/usr/bin/env bash
# DBP-P2-UYAP-CONTRACT-A-P04B-VAL-I1 — LOCAL validator image build (owner D1)
#
# Bu script project-controlled minimal xmllint/libxml2 validator image'ını LOCAL build eder.
# Image registry'ye PUSH EDİLMEZ; kullanım yalnız local image ID (sha256) iledir.
# DTD / XML / DTD doğrulaması bu image'da ve bu script'te YOKTUR (P04B-VAL-I2 kapsamı).
#
# Kullanım:
#   ./build-validator-image.sh
#
# CI NOTU: bu script CI'da ÇALIŞTIRILMAZ (owner: CI image build/pull/exec YOK). Yalnız local.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
IMAGE_NAME="uyap-contract-a-validator"
LOCAL_TAG="${IMAGE_NAME}:local"

# Windows Git Bash: konteyner içi mutlak yolların MSYS path-conversion'ına takılmaması için.
export MSYS_NO_PATHCONV=1

echo "== Dockerfile SHA-256 =="
sha256sum "${SCRIPT_DIR}/Dockerfile"

echo
echo "== docker build (LOCAL; --pull digest doğrular; --no-cache reproducibility; PUSH YOK) =="
docker build --pull --no-cache -t "${LOCAL_TAG}" "${SCRIPT_DIR}"

IMAGE_ID="$(docker image inspect --format '{{.Id}}' "${LOCAL_TAG}")"
echo
echo "== local image ID (kullanım bu sha256 iledir; tag ephemeral) =="
echo "${IMAGE_ID}"

echo
echo "== security-profile smoke: xmllint --version =="
# Runtime izolasyon profili (P04B-VAL-I2 çalıştırma sözleşmesiyle aynı); --version ağ/yazma gerektirmez.
docker run --rm \
  --network none \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --user 65532:65532 \
  --pids-limit 64 \
  --memory 128m \
  --cpus 1 \
  "${IMAGE_ID}" --version < /dev/null

echo
echo "NOTE: image registry'ye PUSH EDİLMEZ."
echo "NOTE: DTD / XML / validation bu image'da YOKTUR (P04B-VAL-I2)."
echo "NOTE: UYAP CUTOVER = HARD HOLD."
