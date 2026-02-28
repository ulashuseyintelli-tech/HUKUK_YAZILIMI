#!/usr/bin/env bash
# CI-6: Symbol Token Singleton Gate
#
# Ensures each DI Symbol token is defined exactly once in the codebase.
# Prevents accidental duplicate Symbol('...') definitions that would
# silently break NestJS dependency injection at runtime.
#
# Exit 1 if any token literal appears more than once.

set -euo pipefail

FAIL=0

check_token() {
  local token_str="$1"
  local count
  count=$(grep -r "Symbol('${token_str}')" apps/api/src/ --include='*.ts' | wc -l)
  count=$((count + 0))  # trim whitespace

  if [ "$count" -eq 0 ]; then
    echo "⚠️  Symbol('${token_str}') not found — token may have been removed"
  elif [ "$count" -eq 1 ]; then
    echo "✅ Symbol('${token_str}') — singleton (1 definition)"
  else
    echo "❌ Symbol('${token_str}') — DUPLICATE! Found ${count} definitions"
    grep -rn "Symbol('${token_str}')" apps/api/src/ --include='*.ts'
    FAIL=1
  fi
}

echo "=== CI-6: Symbol Token Singleton Gate ==="

check_token "IClock"
check_token "ISimulationClock"
check_token "ISimulationFeatureFlagService"

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "❌ FAIL: Duplicate Symbol token definitions detected."
  echo "   Each Symbol must be defined in exactly one file and imported everywhere else."
  exit 1
fi

echo ""
echo "✅ All Symbol tokens are singletons."
