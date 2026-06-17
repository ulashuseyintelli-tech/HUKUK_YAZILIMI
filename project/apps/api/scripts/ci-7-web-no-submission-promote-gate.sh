#!/bin/bash
set -euo pipefail
# CI-7 (Faz 4.7 C2b kirmizi cizgi): Web UI submission-level promote'u CAGIRAMAZ.
# Yalniz field-level promote serbest: promote-soft (soft-intel) / promote-address (ADDRESS).
# Eski toplu/submission-level promote'un ("kolay yol" diye) UI'a sizmasini yapisal engeller.
# Yakalananlar: promoteIntakeSubmission | promoteSubmission | client-intake-submissions/.../promote
# Arama yalniz: apps/web/src

PATTERN='promoteIntakeSubmission|promoteSubmission|client-intake-submissions/[^[:space:]]*promote'

if [ ! -d apps/web/src ]; then
  echo "CI-7 SKIP: apps/web/src yok"
  exit 0
fi

HITS=$(grep -rnE "$PATTERN" apps/web/src/ 2>/dev/null || true)

if [ -n "$HITS" ]; then
  echo "CI-7 FAIL: Web UI submission-level promote cagiriyor (yalniz field-level promote-soft/promote-address kullan):"
  echo "$HITS"
  exit 1
fi
echo "CI-7 PASS: Web'de submission-level promote cagrisi yok (yalniz field-level)."
