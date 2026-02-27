#!/bin/bash
set -euo pipefail
# CI-2: Logger'da maskelenmemis PII kontrolu

# Pattern 1: Template literal icinde PII degiskeni
P1=$(grep -rn 'logger\.\(log\|warn\|error\).*\${\(email\|phone\|recipientEmail\|recipientPhone\|normalizedPhone\|clientEmail\|clientPhone\|emailTo\)}' \
  apps/api/src/modules/ --include="*.ts" \
  | grep -v '\.spec\.ts:' \
  || true)

# Pattern 2: Bare PII degiskeni — mask/masked/pii-ok iceren satirlar haric
P2=$(grep -rn 'logger\.\(log\|warn\|error\).*\b\(email\|phone\|recipientEmail\|recipientPhone\|normalizedPhone\|clientEmail\|clientPhone\|emailTo\)\b' \
  apps/api/src/modules/ --include="*.ts" \
  | grep -v '\.spec\.ts:' \
  || true)
P2_FILTERED=$(echo "$P2" | grep -v 'mask\|masked\|MASKED\|piiSafe\|// pii-ok\|errorMessage\|emailErr\|emailResult\|emailProvider\|emailService\|emailTemplate\|emailConfig\|phoneContact\|emailContact' || true)

if [ -n "$P1" ] || [ -n "$P2_FILTERED" ]; then
  echo "CI-2 FAIL: Maskelenmemis PII log'da bulundu:"
  [ -n "$P1" ] && echo "Template literal:" && echo "$P1"
  [ -n "$P2_FILTERED" ] && echo "Bare variable:" && echo "$P2_FILTERED"
  exit 1
fi
echo "CI-2 PASS: Logger'da maskelenmemis PII yok"
