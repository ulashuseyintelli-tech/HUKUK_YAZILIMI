/**
 * Guard Alert Rules — YAML Validation Tests
 *
 * Operational Guard Phase — Task 8.3
 *
 * Validates guard-alerts.yml structural integrity:
 *   - Valid YAML
 *   - All A1–A5 alerts present
 *   - Every alert has runbook annotation
 *   - Every alert has required fields (expr, labels, annotations)
 *
 * @see .kiro/specs/operational-guard-phase/requirements.md — R6, R11
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ============================================================================
// Types
// ============================================================================

interface AlertRule {
  alert: string;
  expr: string;
  for?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

interface AlertGroup {
  name: string;
  rules: AlertRule[];
}

interface AlertRulesFile {
  groups: AlertGroup[];
}

// ============================================================================
// Expected alerts
// ============================================================================

const EXPECTED_ALERT_NAMES = [
  'GuardCASConflictStorm',      // A1
  'GuardDBTimeoutSpike',        // A2
  'GuardClockSkewBreach',       // A3
  'GuardAlertFireLatencyBreach', // A4
  'GuardKillSwitchEnabled',     // A5
  'GuardShadowDriftHigh',      // A6 — canary rollout
  'GuardShadowLatencyOverhead', // A7 — canary rollout
];

// ============================================================================
// Helpers
// ============================================================================

function loadGuardAlertRules(): AlertRulesFile {
  // __dirname = guards/__tests__
  // 9 levels up to project root
  const yamlPath = path.resolve(
    __dirname,
    '../../../../../../../../../ops/prometheus/guard-alerts.yml',
  );
  const content = fs.readFileSync(yamlPath, 'utf-8');
  return yaml.load(content) as AlertRulesFile;
}

function extractAllRules(doc: AlertRulesFile): AlertRule[] {
  const rules: AlertRule[] = [];
  for (const group of doc.groups ?? []) {
    for (const rule of group.rules ?? []) {
      rules.push(rule);
    }
  }
  return rules;
}

// ============================================================================
// Tests
// ============================================================================

describe('Guard Alert Rules — YAML Validation (Task 8.3)', () => {
  let doc: AlertRulesFile;
  let rules: AlertRule[];

  beforeAll(() => {
    doc = loadGuardAlertRules();
    rules = extractAllRules(doc);
  });

  it('should parse YAML without errors and contain groups → rules structure', () => {
    expect(doc).toBeDefined();
    expect(doc.groups).toBeDefined();
    expect(Array.isArray(doc.groups)).toBe(true);
    expect(doc.groups.length).toBeGreaterThan(0);

    for (const group of doc.groups) {
      expect(group.rules).toBeDefined();
      expect(Array.isArray(group.rules)).toBe(true);
    }
  });

  it('should contain all 7 expected alert names (A1–A7)', () => {
    const alertNames = rules.map(r => r.alert);
    for (const expected of EXPECTED_ALERT_NAMES) {
      expect(alertNames).toContain(expected);
    }
  });

  it('every alert should have a non-empty expr field', () => {
    for (const rule of rules) {
      expect(rule.expr).toBeDefined();
      expect(typeof rule.expr).toBe('string');
      expect(rule.expr.trim().length).toBeGreaterThan(0);
    }
  });

  it('every alert should have labels with severity and component', () => {
    for (const rule of rules) {
      expect(rule.labels).toBeDefined();
      expect(rule.labels!.severity).toBeDefined();
      expect(rule.labels!.component).toBe('guard');
    }
  });

  it('every alert should have annotations with summary and description', () => {
    for (const rule of rules) {
      expect(rule.annotations).toBeDefined();
      expect(rule.annotations!.summary).toBeDefined();
      expect(rule.annotations!.summary.trim().length).toBeGreaterThan(0);
      expect(rule.annotations!.description).toBeDefined();
      expect(rule.annotations!.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('every alert should have a runbook annotation pointing to guard-ops-runbook.md', () => {
    for (const rule of rules) {
      expect(rule.annotations).toBeDefined();
      expect(rule.annotations!.runbook).toBeDefined();
      expect(rule.annotations!.runbook).toContain('guard-ops-runbook.md');
    }
  });

  it('A4 (AlertFireLatencyBreach) should be critical severity (paging)', () => {
    const a4 = rules.find(r => r.alert === 'GuardAlertFireLatencyBreach');
    expect(a4).toBeDefined();
    expect(a4!.labels!.severity).toBe('critical');
  });

  it('A5 (KillSwitchEnabled) should be info severity', () => {
    const a5 = rules.find(r => r.alert === 'GuardKillSwitchEnabled');
    expect(a5).toBeDefined();
    expect(a5!.labels!.severity).toBe('info');
  });

  it('A6 (ShadowDriftHigh) should be warning severity', () => {
    const a6 = rules.find(r => r.alert === 'GuardShadowDriftHigh');
    expect(a6).toBeDefined();
    expect(a6!.labels!.severity).toBe('warning');
    expect(a6!.expr).toContain('guard_shadow_would_enforce_total');
  });

  it('A7 (ShadowLatencyOverhead) should be warning severity', () => {
    const a7 = rules.find(r => r.alert === 'GuardShadowLatencyOverhead');
    expect(a7).toBeDefined();
    expect(a7!.labels!.severity).toBe('warning');
    expect(a7!.expr).toContain('guard_snapshot_duration_seconds_bucket');
  });
});
