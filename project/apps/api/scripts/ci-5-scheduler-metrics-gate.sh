#!/bin/bash
set -euo pipefail
# CI-5: Scheduler Prometheus counter'lari kontrolu

MATCH=$(grep -rn "scheduler_processed_total" apps/api/src/modules/scheduler/ || true)

if [ -z "$MATCH" ]; then
  echo "CI-5 FAIL: scheduler_processed_total counter tanimi bulunamadi"
  exit 1
fi
echo "CI-5 PASS: Scheduler metrics tanimli"
