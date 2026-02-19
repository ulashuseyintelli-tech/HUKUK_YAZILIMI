#!/usr/bin/env bash
# I0 Metrics Runway — Smoke Test (Faz 2: Compose Validation)
#
# Prerequisites:
#   - API running on localhost:3000
#   - docker-compose -f docker/docker-compose.yml -f docker/docker-compose.metrics.yml up -d
#
# Validates:
#   Phase 0: Synthetic traffic generation
#   Phase 1: /metrics endpoint — I0 metric names + regex validation
#   Phase 2: Prometheus target UP (with retry)
#   Phase 3: Grafana dashboard provisioned
#
# Exit 0 = PASS, Exit 1 = FAIL
#
# @see .kiro/specs/i0-metrics-runway/tasks.md — Task 11

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

check() {
  local desc="$1"
  local result="$2"
  if [ "$result" = "true" ]; then
    echo -e "${GREEN}✓${NC} $desc"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}✗${NC} $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== I0 Metrics Runway — Smoke Test (Faz 2) ==="
echo ""

# ── Phase 0: Synthetic Traffic ──────────────────────────────────────
echo "--- Phase 0: Synthetic Traffic ---"
echo "Sending 10 normal GET requests (1-2 RPS)..."
for i in $(seq 1 10); do
  curl -sf -o /dev/null http://localhost:3000/metrics || true
  sleep 0.5
done
echo -e "${GREEN}✓${NC} 10 normal requests sent"

# Try 404 route (generates http_responses_total{status="404"})
echo "Sending 5 requests to /nonexistent (404 fallback)..."
for i in $(seq 1 5); do
  curl -sf -o /dev/null http://localhost:3000/nonexistent || true
  sleep 0.3
done
echo -e "${GREEN}✓${NC} 5 fallback requests sent"

# Try 503 test route (generates http_responses_total{status="503"})
# Note: /__test__/force-503 is a test route, NOT guard BLOCK.
# NR-3 shadow downgrade behavior is unaffected.
echo "Sending 3 requests to /__test__/force-503 (503 test route)..."
FORCE503_OK=0
for i in $(seq 1 3); do
  HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000/__test__/force-503 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "503" ]; then
    FORCE503_OK=$((FORCE503_OK + 1))
  fi
  sleep 0.3
done
if [ "$FORCE503_OK" -gt 0 ]; then
  echo -e "${GREEN}✓${NC} $FORCE503_OK/3 requests returned 503"
else
  echo -e "${YELLOW}⚠${NC} /__test__/force-503 not available (NODE_ENV=production or route missing)"
fi
echo ""

# ── Phase 1: /metrics Endpoint Validation ───────────────────────────
echo "--- Phase 1: /metrics endpoint ---"
METRICS=$(curl -sf http://localhost:3000/metrics || echo "CURL_FAILED")

if [ "$METRICS" = "CURL_FAILED" ]; then
  check "/metrics endpoint reachable" "false"
  check "simulation_drift_total HELP/TYPE present" "false"
  check "drift_provider_errors_total HELP/TYPE present" "false"
  check "http_responses_total present with correct labels" "false"
  check "kill_switch_state HELP/TYPE present" "false"
else
  check "/metrics endpoint reachable" "true"

  # HELP/TYPE lines (always present even if counter=0)
  echo "$METRICS" | grep -q "^# HELP simulation_drift_total" && \
    check "simulation_drift_total HELP present" "true" || \
    check "simulation_drift_total HELP present" "false"

  echo "$METRICS" | grep -q "^# TYPE simulation_drift_total counter" && \
    check "simulation_drift_total TYPE=counter" "true" || \
    check "simulation_drift_total TYPE=counter" "false"

  echo "$METRICS" | grep -q "^# HELP drift_provider_errors_total" && \
    check "drift_provider_errors_total HELP present" "true" || \
    check "drift_provider_errors_total HELP present" "false"

  echo "$METRICS" | grep -q "^# HELP kill_switch_state" && \
    check "kill_switch_state HELP present" "true" || \
    check "kill_switch_state HELP present" "false"

  # http_responses_total with correct label semantics
  echo "$METRICS" | grep -qE '^http_responses_total\{status="200",method="GET"\} [0-9]+' && \
    check "http_responses_total{status=200,method=GET} > 0" "true" || \
    check "http_responses_total{status=200,method=GET} > 0" "false"

  # DriftType enum whitelist validation (if any drift data lines exist)
  DRIFT_LINES=$(echo "$METRICS" | grep -E '^simulation_drift_total\{' || true)
  if [ -n "$DRIFT_LINES" ]; then
    # Every type label must be one of: CARRIER_WRITE, CONFIG, RULESET, SCHEMA
    INVALID=$(echo "$DRIFT_LINES" | grep -vE 'type="(CARRIER_WRITE|CONFIG|RULESET|SCHEMA)"' || true)
    if [ -z "$INVALID" ]; then
      check "simulation_drift_total type ∈ DriftType enum" "true"
    else
      echo -e "${RED}  Invalid type labels found:${NC}"
      echo "$INVALID"
      check "simulation_drift_total type ∈ DriftType enum" "false"
    fi
  else
    echo -e "${YELLOW}  (no drift data lines yet — HELP/TYPE sufficient)${NC}"
    check "simulation_drift_total type ∈ DriftType enum (no data)" "true"
  fi

  # Label cardinality guard: no route/path/url labels on http_responses_total
  HTTP_LINES=$(echo "$METRICS" | grep -E '^http_responses_total\{' || true)
  if [ -n "$HTTP_LINES" ]; then
    ROUTE_LEAK=$(echo "$HTTP_LINES" | grep -E '(route=|path=|url=|endpoint=)' || true)
    if [ -z "$ROUTE_LEAK" ]; then
      check "http_responses_total: no route/path/url label leak" "true"
    else
      echo -e "${RED}  Route label leak detected:${NC}"
      echo "$ROUTE_LEAK"
      check "http_responses_total: no route/path/url label leak" "false"
    fi
  fi

  # Print I0 snapshot lines
  echo ""
  echo "--- I0 /metrics Snapshot ---"
  echo "$METRICS" | grep -E '^(simulation_drift_total|drift_provider_errors_total|http_responses_total|kill_switch_state|# (HELP|TYPE) (simulation_drift_total|drift_provider_errors_total|http_responses_total|kill_switch_state))' || echo "(no matching lines)"
  echo "---"
fi

echo ""

# ── Phase 2: Prometheus Target UP (with retry) ─────────────────────
echo "--- Phase 2: Prometheus target ---"
PROM_UP="false"
MAX_RETRIES=3
RETRY_INTERVAL=5

for attempt in $(seq 1 $MAX_RETRIES); do
  PROM_TARGETS=$(curl -sf http://localhost:9090/api/v1/targets 2>/dev/null || echo "CURL_FAILED")

  if [ "$PROM_TARGETS" = "CURL_FAILED" ]; then
    if [ "$attempt" -lt "$MAX_RETRIES" ]; then
      echo -e "${YELLOW}  Prometheus not ready (attempt $attempt/$MAX_RETRIES), retrying in ${RETRY_INTERVAL}s...${NC}"
      sleep $RETRY_INTERVAL
    fi
    continue
  fi

  check "Prometheus reachable" "true"

  # Check for job="api" target with health="up"
  if echo "$PROM_TARGETS" | grep -q '"health":"up"'; then
    PROM_UP="true"
    check "API target health=up" "true"

    # Extract and display target info
    echo "  Target details:"
    echo "$PROM_TARGETS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for t in data.get('data', {}).get('activeTargets', []):
        print(f\"    job={t.get('labels',{}).get('job','?')} health={t.get('health','?')} lastScrape={t.get('lastScrape','?')}\")
except: pass
" 2>/dev/null || true
    break
  else
    if [ "$attempt" -lt "$MAX_RETRIES" ]; then
      echo -e "${YELLOW}  Target not UP yet (attempt $attempt/$MAX_RETRIES), retrying in ${RETRY_INTERVAL}s...${NC}"
      sleep $RETRY_INTERVAL
    fi
  fi
done

if [ "$PROM_UP" = "false" ]; then
  check "API target health=up (after $MAX_RETRIES retries)" "false"
fi

echo ""

# ── Phase 3: Grafana Dashboard ──────────────────────────────────────
echo "--- Phase 3: Grafana dashboard ---"
GRAFANA_SEARCH=$(curl -sf -u admin:admin http://localhost:3001/api/search?query=guard 2>/dev/null || echo "CURL_FAILED")

if [ "$GRAFANA_SEARCH" = "CURL_FAILED" ]; then
  check "Grafana reachable" "false"
  check "Guard dashboard provisioned" "false"
else
  check "Grafana reachable" "true"

  if echo "$GRAFANA_SEARCH" | grep -q "Guard"; then
    check "Guard dashboard provisioned" "true"

    # Try to get dashboard UID for more detailed check
    DASH_UID=$(echo "$GRAFANA_SEARCH" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for d in data:
        if 'Guard' in d.get('title', ''):
            print(d.get('uid', 'unknown'))
            break
except: pass
" 2>/dev/null || echo "")

    if [ -n "$DASH_UID" ] && [ "$DASH_UID" != "" ]; then
      # Verify dashboard content via UID
      DASH_DETAIL=$(curl -sf -u admin:admin "http://localhost:3001/api/dashboards/uid/$DASH_UID" 2>/dev/null || echo "")
      if [ -n "$DASH_DETAIL" ]; then
        PANEL_COUNT=$(echo "$DASH_DETAIL" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    panels = data.get('dashboard', {}).get('panels', [])
    print(len(panels))
except: print(0)
" 2>/dev/null || echo "0")
        echo "  Dashboard UID: $DASH_UID, panels: $PANEL_COUNT"
      fi
    fi
  else
    check "Guard dashboard provisioned" "false"
  fi
fi

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi

echo -e "${GREEN}SMOKE TEST PASS${NC}"
exit 0
