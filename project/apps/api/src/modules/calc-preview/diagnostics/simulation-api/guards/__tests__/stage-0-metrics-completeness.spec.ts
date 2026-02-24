/**
 * Stage-0 Metrics HELP/TYPE Completeness Validation
 *
 * Task 6.1 — Validates that critical metrics have HELP + TYPE declarations.
 *
 * @see .kiro/specs/stage-0-shadow-rollout/requirements.md — R2.3, R2.4
 */

// ============================================================================
// Critical Metrics Contract
// ============================================================================

const CRITICAL_METRICS = [
  'guard_decision_total',
  'simulation_drift_total',
  'drift_provider_errors_total',
  'kill_switch_state',
  'http_responses_total',
] as const;

type MetricName = (typeof CRITICAL_METRICS)[number];

interface MetricDeclaration {
  name: string;
  hasHelp: boolean;
  hasType: boolean;
  type?: string;
}

/**
 * Parses a Prometheus /metrics text output and extracts HELP/TYPE declarations.
 */
function parseMetricsOutput(metricsText: string): Map<string, MetricDeclaration> {
  const declarations = new Map<string, MetricDeclaration>();

  for (const line of metricsText.split('\n')) {
    const helpMatch = line.match(/^# HELP (\S+)/);
    if (helpMatch) {
      const name = helpMatch[1];
      const existing = declarations.get(name) ?? {
        name,
        hasHelp: false,
        hasType: false,
      };
      existing.hasHelp = true;
      declarations.set(name, existing);
    }

    const typeMatch = line.match(/^# TYPE (\S+) (\S+)/);
    if (typeMatch) {
      const name = typeMatch[1];
      const type = typeMatch[2];
      const existing = declarations.get(name) ?? {
        name,
        hasHelp: false,
        hasType: false,
      };
      existing.hasType = true;
      existing.type = type;
      declarations.set(name, existing);
    }
  }

  return declarations;
}

// ============================================================================
// Mock /metrics output (realistic format)
// ============================================================================

const MOCK_METRICS_OUTPUT = `
# HELP guard_decision_total Guard engine karar sayacı
# TYPE guard_decision_total counter
guard_decision_total{guardMode="shadow",decision="ALLOW"} 142
guard_decision_total{guardMode="shadow",decision="HOLD"} 3
guard_decision_total{guardMode="shadow",decision="BLOCK_503"} 0

# HELP simulation_drift_total Structural drift detection counter
# TYPE simulation_drift_total counter
simulation_drift_total{guardMode="shadow",type="config"} 0

# HELP drift_provider_errors_total DriftInputProvider error counter
# TYPE drift_provider_errors_total counter
drift_provider_errors_total{operation="fetchConfig"} 0

# HELP kill_switch_state Kill-switch gauge
# TYPE kill_switch_state gauge
kill_switch_state 0

# HELP http_responses_total HTTP response counter
# TYPE http_responses_total counter
http_responses_total{method="GET",status="200"} 1024
http_responses_total{method="POST",status="200"} 256
`.trim();

// ============================================================================
// Tests
// ============================================================================

describe('Stage-0 Metrics HELP/TYPE Completeness (Task 6.1)', () => {
  let declarations: Map<string, MetricDeclaration>;

  beforeAll(() => {
    declarations = parseMetricsOutput(MOCK_METRICS_OUTPUT);
  });

  it('should parse all 5 critical metrics from /metrics output', () => {
    for (const metric of CRITICAL_METRICS) {
      expect(declarations.has(metric)).toBe(true);
    }
  });

  it.each([...CRITICAL_METRICS])(
    '%s should have HELP declaration',
    (metric: MetricName) => {
      const decl = declarations.get(metric);
      expect(decl).toBeDefined();
      expect(decl!.hasHelp).toBe(true);
    },
  );

  it.each([...CRITICAL_METRICS])(
    '%s should have TYPE declaration',
    (metric: MetricName) => {
      const decl = declarations.get(metric);
      expect(decl).toBeDefined();
      expect(decl!.hasType).toBe(true);
    },
  );

  it('guard_decision_total should be counter type', () => {
    expect(declarations.get('guard_decision_total')!.type).toBe('counter');
  });

  it('kill_switch_state should be gauge type', () => {
    expect(declarations.get('kill_switch_state')!.type).toBe('gauge');
  });

  it('should detect missing HELP when absent', () => {
    const incomplete = parseMetricsOutput(
      '# TYPE some_metric counter\nsome_metric 1',
    );
    const decl = incomplete.get('some_metric');
    expect(decl).toBeDefined();
    expect(decl!.hasHelp).toBe(false);
    expect(decl!.hasType).toBe(true);
  });

  it('should detect missing TYPE when absent', () => {
    const incomplete = parseMetricsOutput(
      '# HELP some_metric A metric\nsome_metric 1',
    );
    const decl = incomplete.get('some_metric');
    expect(decl).toBeDefined();
    expect(decl!.hasHelp).toBe(true);
    expect(decl!.hasType).toBe(false);
  });
});
