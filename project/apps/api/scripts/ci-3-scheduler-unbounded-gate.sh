#!/bin/bash
set -euo pipefail
# CI-3: Cron handler'larda dogrudan findMany kontrolu
# Pattern: "await this.db.*.findMany" yasakli (scheduler.service.ts)
# runBatched callback icindeki (args) => this.db...findMany({...args}) "await" ile
# baslamadigi icin gate'e takilmaz.

VIOLATIONS=$(grep -Pn "await\s+this\.db\.\w+\.findMany" apps/api/src/modules/scheduler/scheduler.service.ts || true)

if [ -n "$VIOLATIONS" ]; then
  echo "CI-3 FAIL: scheduler.service.ts'de dogrudan findMany bulundu (runBatched kullanin):"
  echo "$VIOLATIONS"
  exit 1
fi
echo "CI-3 PASS: Cron handler'larda dogrudan findMany yok"
