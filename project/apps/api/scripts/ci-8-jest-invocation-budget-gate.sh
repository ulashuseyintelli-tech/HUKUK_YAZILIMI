#!/usr/bin/env bash
set -euo pipefail

# CI-8: Jest invocation budget gate (GH-03)
#
# Amaç: `ci.yml`'in tekrar 100+ ayrı Jest çağrısına şişmesini engellemek.
# Her Jest çağrısı ~13.6s sabit ts-jest bootstrap maliyeti getirir.
# Ölçüm: 2026-07-13'ten 2026-07-24'e 21 -> 100 çağrı, Test Suite 32 dakikaya çıktı.
#
# Yeni bir spec CI'a bağlanacaksa: yeni step AÇMA, mevcut bir manifest'in
# dosya listesine ekle.
#
# Sayım her iki launcher biçimini de kapsar (`npx jest` VE `pnpm exec jest`):
# patch anında ci.yml'de ikisi de kullanılıyordu (18 + 12). Yalnız birini
# saymak, launcher değiştirerek bütçeyi atlamayı mümkün kılardı — guard'ın
# kendisi false-green üretemez.

BUDGET=18

REPO_ROOT="$(git rev-parse --show-toplevel)"
WORKFLOW="${REPO_ROOT}/.github/workflows/ci.yml"

# Dosya bulunamazsa SESSIZCE GEÇME - guard'ın kendisi false-green üretmemeli.
if [ ! -f "$WORKFLOW" ]; then
  echo "CI-8 FAIL: workflow bulunamadi: ${WORKFLOW}"
  exit 1
fi

# Bir Jest process'i iki yoldan dogabilir:
#   1) ci.yml icindeki dogrudan `npx jest` / `pnpm exec jest` cagrisi
#   2) bir manifest dosyasi — run-ci-manifest.sh her manifest icin TEK process acar
# Ikisi de sayilir; aksi halde manifest ekleyerek butce sessizce asilabilirdi.
# Yorum satirlari sayilmaz: bir aciklamada 'npx jest' gecmesi butce tuketmemeli.
DIRECT="$(grep -vE '^[[:space:]]*#' "$WORKFLOW" \
  | grep -cE '(npx|pnpm([[:space:]]+exec)?)[[:space:]]+jest' || true)"
DIRECT="${DIRECT:-0}"

MANIFEST_DIR="${REPO_ROOT}/project/apps/api/ci-manifests"
if [ ! -d "$MANIFEST_DIR" ]; then
  echo "CI-8 FAIL: manifest dizini bulunamadi: ${MANIFEST_DIR}"
  exit 1
fi
MANIFESTS="$(find "$MANIFEST_DIR" -name '*.txt' -type f | wc -l | tr -d ' ')"
MANIFESTS="${MANIFESTS:-0}"

COUNT=$((DIRECT + MANIFESTS))

if [ "$COUNT" -gt "$BUDGET" ]; then
  cat <<EOF
=====================================================================
CI-8 JEST INVOCATION BUDGET EXCEEDED

  mevcut : ${COUNT}
  izinli : ${BUDGET}

Yeni bir jest step'i EKLEME. Her ek cagri ~13.6s sabit
ts-jest bootstrap maliyeti getirir ve Test Suite suresini buyutur.

YAPILACAK:
  Spec'ini mevcut bir manifest'in dosya listesine ekle
  (test-suite job'indaki pure/* veya db/* step'leri).
  DB gerektiren spec -> db/* manifesti. Digerleri -> pure/*.
  Ilgili manifest'in 'test -f' guard dongusune de ekle.

Butce gercekten yetersizse: bu bir owner kararidir,
GH-03 sahibiyle konus. Bu satiri tek tarafli yukseltme.
=====================================================================
EOF
  exit 1
fi

echo "CI-8 OK: ${COUNT}/${BUDGET} jest invocation (ci.yml=${DIRECT}, manifest=${MANIFESTS})"
