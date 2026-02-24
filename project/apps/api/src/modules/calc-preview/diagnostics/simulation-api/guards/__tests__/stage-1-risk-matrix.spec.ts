/**
 * Stage-1 Enforce-Readiness Risk Matrix (Task 5.1)
 *
 * Validates 4 risk dimensions, GO/NO-GO conjunction logic,
 * remediation step generation, HALT vs rollback semantics,
 * and extended operational risk matrix schema.
 *
 * @see .kiro/specs/stage-1-runtime-baseline/requirements.md — R11.1–R11.3
 * @see .kiro/specs/stage-1-runtime-baseline/design.md — Risk Matrix (Task 3)
 */

// ============================================================================
// Types
// ============================================================================

type Verdict = 'GO' | 'NO_GO' | 'HALT';
type SmokeGate = 'PASS' | 'FAIL';

interface RiskDimension {
  name: string;
  measured: number;
  threshold: number;
  unit: string;
  passed: boolean;
  remediation?: string;
}

interface RiskRow {
  risk: string;
  trigger: string;
  impact: string;
  detection: string;
  mitigation: string;
  residualRisk: string;
}

interface RiskMatrixInput {
  runtimeSmokeExitGate: SmokeGate;
  falsePositiveRate: number;
  blastRadius: number;
  killSwitchP99Seconds: number;
  rollbackStepsVerified: number;
  alertNoiseRatio: number;
  alertFiresPerHour: number;
  scrapeUpStable: boolean;
  dedupOk: boolean;
}

interface RiskMatrixOutput {
  dimensions: RiskDimension[];
  rows: RiskRow[];
  verdict: Verdict;
  remediation: string[];
}

// ============================================================================
// Computation Functions
// ============================================================================

const OPERATIONAL_RISK_ROWS: RiskRow[] = [
  {
    risk: 'PD routing mismatch',
    trigger: 'S1 fires but lands in slack-default',
    impact: 'No paging signal in prod',
    detection: 'AM route trace + PD incident absence',
    mitigation: 'Fix matchers/route order',
    residualRisk: 'Low',
  },
  {
    risk: 'Dedup failure',
    trigger: 'Same S1 test opens multiple incidents',
    impact: 'Noise / on-call fatigue',
    detection: 'PD incident clustering (incidents_created > 1 in 10m)',
    mitigation: 'group_by / dedup_key adjust',
    residualRisk: 'Medium',
  },
  {
    risk: 'Inhibition misfire',
    trigger: 'S2 target not suppressed',
    impact: 'Alert storm risk',
    detection: 'AM "suppressed" field missing',
    mitigation: 'Fix inhibition equal labels',
    residualRisk: 'Medium',
  },
  {
    risk: 'Datasource UID drift',
    trigger: 'Grafana panels "No data"',
    impact: 'Blind ops',
    detection: 'Grafana query errors',
    mitigation: 'Rebind datasource UID',
    residualRisk: 'Low',
  },
  {
    risk: 'Scrape instability',
    trigger: 'up{} flaps',
    impact: 'False negatives',
    detection: 'targets API + logs',
    mitigation: 'scrape interval/timing fixes',
    residualRisk: 'Medium',
  },
  {
    risk: 'Alert storm',
    trigger: 'noise_ratio > 5% OR fires/hour > 10',
    impact: 'Baseline data unreliable',
    detection: 'Noise ratio computation',
    mitigation: 'HALT + threshold tuning',
    residualRisk: 'High',
  },
];

function validateRiskMatrixSchema(rows: RiskRow[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const requiredFields: Array<keyof RiskRow> = ['risk', 'trigger', 'impact', 'detection', 'mitigation', 'residualRisk'];

  if (rows.length < 6) {
    errors.push(`Expected at least 6 risk rows, got ${rows.length}`);
  }

  for (let i = 0; i < rows.length; i++) {
    for (const field of requiredFields) {
      if (!rows[i][field] || rows[i][field].trim().length === 0) {
        errors.push(`Row ${i} missing or empty field: ${field}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function buildOperationalRiskMatrix(input: RiskMatrixInput): RiskMatrixOutput {
  const remediation: string[] = [];
  const dimensions: RiskDimension[] = [];

  // Pre-gate: runtime smoke must pass
  if (input.runtimeSmokeExitGate === 'FAIL') {
    return {
      dimensions: [],
      rows: OPERATIONAL_RISK_ROWS,
      verdict: 'HALT',
      remediation: ['HALT — Runtime smoke exit gate FAIL. Fix failing runtime smoke phases before risk matrix evaluation.'],
    };
  }

  // Alert storm check (HALT, not rollback)
  const stormDetected = input.alertNoiseRatio > 0.05 || input.alertFiresPerHour > 10;
  if (stormDetected) {
    return {
      dimensions: [],
      rows: OPERATIONAL_RISK_ROWS,
      verdict: 'HALT',
      remediation: [
        'HALT — Alert storm detected.',
        `Noise ratio: ${(input.alertNoiseRatio * 100).toFixed(1)}% (threshold 5%), fires/hour: ${input.alertFiresPerHour} (threshold 10).`,
        'Action: Pause observation window. Tune alert thresholds. Re-observe baseline after tuning.',
        'This is NOT an immediate rollback condition. Storm HALT = pause + tune + re-observe.',
      ],
    };
  }

  // Scrape instability check (NO_GO with quick-cut rollback)
  if (!input.scrapeUpStable) {
    return {
      dimensions: [],
      rows: OPERATIONAL_RISK_ROWS,
      verdict: 'NO_GO',
      remediation: [
        'NO_GO — Scrape instability detected (up{} flapping).',
        'Quick-cut rollback chain: 1. Kill-switch ON → 2. Guard mode → shadow → 3. Alertmanager silence → 4. Verify bypass active.',
        'Fix scrape interval/timing, then re-run runtime smoke.',
      ],
    };
  }

  // Dedup check
  if (!input.dedupOk) {
    return {
      dimensions: [],
      rows: OPERATIONAL_RISK_ROWS,
      verdict: 'NO_GO',
      remediation: [
        'NO_GO — Dedup failure detected (incidents_created > 1 for same fingerprint in 10m).',
        'Fix group_by / dedup_key configuration. Verify PD fingerprint derivation.',
      ],
    };
  }

  // Dimension 1: False Positive Tolerance
  const fpPassed = input.falsePositiveRate < 1;
  const fpDim: RiskDimension = {
    name: 'False Positive Tolerance',
    measured: input.falsePositiveRate,
    threshold: 1,
    unit: '%',
    passed: fpPassed,
  };
  if (!fpPassed) {
    fpDim.remediation = 'Threshold tuning: reduce HOLD/BLOCK_503 false positive rate below 1%';
    remediation.push('NO_GO — False positive rate >= 1%. Tune guard decision thresholds.');
  }
  dimensions.push(fpDim);

  // Dimension 2: Blast Radius
  const blastPassed = input.blastRadius < 5;
  const blastDim: RiskDimension = {
    name: 'Blast Radius',
    measured: input.blastRadius,
    threshold: 5,
    unit: '%',
    passed: blastPassed,
  };
  if (!blastPassed) {
    blastDim.remediation = 'Scope narrowing: reduce would-enforce rate below 5% of total traffic';
    remediation.push('NO_GO — Blast radius >= 5%. Narrow enforcement scope.');
  }
  dimensions.push(blastDim);

  // Dimension 3: Kill-Switch Latency
  const ksPassed = input.killSwitchP99Seconds < 5;
  const ksDim: RiskDimension = {
    name: 'Kill-Switch Latency (p99)',
    measured: input.killSwitchP99Seconds,
    threshold: 5,
    unit: 's',
    passed: ksPassed,
  };
  if (!ksPassed) {
    ksDim.remediation = 'Performance fix: reduce kill-switch activation → bypass latency below 5s p99';
    remediation.push('NO_GO — Kill-switch p99 >= 5s. Fix kill-switch performance.');
  }
  dimensions.push(ksDim);

  // Dimension 4: Rollback Path
  const rbPassed = input.rollbackStepsVerified >= 4;
  const rbDim: RiskDimension = {
    name: 'Rollback Path',
    measured: input.rollbackStepsVerified,
    threshold: 4,
    unit: 'steps',
    passed: rbPassed,
  };
  if (!rbPassed) {
    rbDim.remediation = 'Procedure fix: verify all 4 rollback steps (kill-switch → shadow → silence → verify)';
    remediation.push('NO_GO — Rollback path incomplete. Verify all 4 steps.');
  }
  dimensions.push(rbDim);

  const allPassed = dimensions.every(d => d.passed);

  return {
    dimensions,
    rows: OPERATIONAL_RISK_ROWS,
    verdict: allPassed ? 'GO' : 'NO_GO',
    remediation: allPassed ? ['GO — All dimensions pass. Proceed to enforce mode.'] : remediation,
  };
}


// ============================================================================
// Helper: default passing input
// ============================================================================

function makePassingInput(overrides: Partial<RiskMatrixInput> = {}): RiskMatrixInput {
  return {
    runtimeSmokeExitGate: 'PASS',
    falsePositiveRate: 0.5,
    blastRadius: 2,
    killSwitchP99Seconds: 1.5,
    rollbackStepsVerified: 4,
    alertNoiseRatio: 0.02,
    alertFiresPerHour: 3,
    scrapeUpStable: true,
    dedupOk: true,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Stage-1 Risk Matrix (Task 5.1)', () => {
  describe('Conjunction Logic — GO/NO-GO', () => {
    it('all dimensions PASS → GO', () => {
      const out = buildOperationalRiskMatrix(makePassingInput());
      expect(out.verdict).toBe('GO');
      expect(out.dimensions).toHaveLength(4);
      expect(out.dimensions.every(d => d.passed)).toBe(true);
    });

    it('any single dimension FAIL → NO_GO', () => {
      const failCases: Array<Partial<RiskMatrixInput>> = [
        { falsePositiveRate: 1.5 },
        { blastRadius: 6 },
        { killSwitchP99Seconds: 7 },
        { rollbackStepsVerified: 3 },
      ];
      for (const override of failCases) {
        const out = buildOperationalRiskMatrix(makePassingInput(override));
        expect(out.verdict).toBe('NO_GO');
      }
    });

    it('multiple dimensions FAIL → NO_GO with multiple remediation steps', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({
        falsePositiveRate: 2,
        blastRadius: 8,
      }));
      expect(out.verdict).toBe('NO_GO');
      expect(out.remediation.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Threshold Evaluation', () => {
    it('false positive < 1% → PASS', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({ falsePositiveRate: 0.99 }));
      const fp = out.dimensions.find(d => d.name === 'False Positive Tolerance')!;
      expect(fp.passed).toBe(true);
    });

    it('false positive >= 1% → FAIL', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({ falsePositiveRate: 1.0 }));
      const fp = out.dimensions.find(d => d.name === 'False Positive Tolerance')!;
      expect(fp.passed).toBe(false);
      expect(fp.remediation!.toLowerCase()).toContain('threshold tuning');
    });

    it('blast radius < 5% → PASS', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({ blastRadius: 4.99 }));
      const br = out.dimensions.find(d => d.name === 'Blast Radius')!;
      expect(br.passed).toBe(true);
    });

    it('blast radius >= 5% → FAIL', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({ blastRadius: 5.0 }));
      const br = out.dimensions.find(d => d.name === 'Blast Radius')!;
      expect(br.passed).toBe(false);
      expect(br.remediation).toContain('Scope narrowing');
    });

    it('kill-switch p99 < 5s → PASS', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({ killSwitchP99Seconds: 4.99 }));
      const ks = out.dimensions.find(d => d.name === 'Kill-Switch Latency (p99)')!;
      expect(ks.passed).toBe(true);
    });

    it('kill-switch p99 >= 5s → FAIL', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({ killSwitchP99Seconds: 5.0 }));
      const ks = out.dimensions.find(d => d.name === 'Kill-Switch Latency (p99)')!;
      expect(ks.passed).toBe(false);
      expect(ks.remediation).toContain('Performance fix');
    });

    it('rollback 4/4 → PASS', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({ rollbackStepsVerified: 4 }));
      const rb = out.dimensions.find(d => d.name === 'Rollback Path')!;
      expect(rb.passed).toBe(true);
    });

    it('rollback < 4/4 → FAIL', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({ rollbackStepsVerified: 3 }));
      const rb = out.dimensions.find(d => d.name === 'Rollback Path')!;
      expect(rb.passed).toBe(false);
      expect(rb.remediation).toContain('Procedure fix');
    });
  });

  describe('Runtime Smoke Exit Gate Pre-condition', () => {
    it('runtime smoke FAIL → HALT (cannot evaluate risk matrix)', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({
        runtimeSmokeExitGate: 'FAIL',
      }));
      expect(out.verdict).toBe('HALT');
      expect(out.dimensions).toHaveLength(0);
      expect(out.remediation.join('\n').toLowerCase()).toMatch(/runtime smoke/);
    });

    it('runtime smoke FAIL overrides all other passing dimensions', () => {
      const out = buildOperationalRiskMatrix({
        runtimeSmokeExitGate: 'FAIL',
        falsePositiveRate: 0.1,
        blastRadius: 0.5,
        killSwitchP99Seconds: 0.5,
        rollbackStepsVerified: 4,
        alertNoiseRatio: 0.01,
        alertFiresPerHour: 1,
        scrapeUpStable: true,
        dedupOk: true,
      });
      expect(out.verdict).not.toBe('GO');
    });
  });

  describe('Alert Storm — HALT semantics (NOT rollback)', () => {
    it('noise_ratio > 5% → HALT with pause+tune+re-observe', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({
        alertNoiseRatio: 0.06,
      }));
      expect(out.verdict).toBe('HALT');
      const text = out.remediation.join('\n').toLowerCase();
      expect(text).toMatch(/pause/);
      expect(text).toMatch(/tune|threshold/);
      expect(text).toMatch(/re-?observe/);
      // Storm HALT must NOT mandate immediate rollback
      expect(text).not.toMatch(/kill-?switch.*immediate/);
    });

    it('fires/hour > 10 → HALT', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({
        alertFiresPerHour: 11,
      }));
      expect(out.verdict).toBe('HALT');
    });

    it('noise_ratio <= 5% AND fires/hour <= 10 → no storm', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({
        alertNoiseRatio: 0.04,
        alertFiresPerHour: 9,
      }));
      expect(out.verdict).not.toBe('HALT');
    });

    it('storm HALT remediation explicitly says NOT immediate rollback', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({
        alertNoiseRatio: 0.10,
        alertFiresPerHour: 15,
      }));
      const text = out.remediation.join('\n').toLowerCase();
      expect(text).toMatch(/not.*immediate.*rollback|not.*rollback.*immediate/);
    });
  });

  describe('Scrape Instability — NO_GO with quick-cut rollback', () => {
    it('scrape instability → NO_GO', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({
        scrapeUpStable: false,
      }));
      expect(['NO_GO', 'HALT']).toContain(out.verdict);
    });

    it('scrape instability remediation includes quick-cut rollback chain', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({
        scrapeUpStable: false,
      }));
      const text = out.remediation.join('\n').toLowerCase();
      expect(text).toMatch(/kill-?switch/);
      expect(text).toMatch(/shadow/);
      expect(text).toMatch(/silence/);
      expect(text).toMatch(/verify/);
    });
  });

  describe('Dedup Failure — NO_GO', () => {
    it('dedup failure → NO_GO', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({
        dedupOk: false,
      }));
      expect(out.verdict).not.toBe('GO');
    });

    it('dedup failure remediation mentions group_by/fingerprint', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({
        dedupOk: false,
      }));
      const text = out.remediation.join('\n').toLowerCase();
      expect(text).toMatch(/dedup/);
      expect(text).toMatch(/group_by|fingerprint|key/);
    });
  });

  describe('Extended Operational Risk Matrix Schema', () => {
    it('should have at least 6 risk rows', () => {
      const out = buildOperationalRiskMatrix(makePassingInput());
      expect(out.rows.length).toBeGreaterThanOrEqual(6);
    });

    it('all rows should have required columns', () => {
      const out = buildOperationalRiskMatrix(makePassingInput());
      const validation = validateRiskMatrixSchema(out.rows);
      expect(validation.ok).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('rows should cover known risk categories', () => {
      const out = buildOperationalRiskMatrix(makePassingInput());
      const riskNames = out.rows.map(r => r.risk.toLowerCase());
      expect(riskNames.some(r => r.includes('routing'))).toBe(true);
      expect(riskNames.some(r => r.includes('dedup'))).toBe(true);
      expect(riskNames.some(r => r.includes('inhibition'))).toBe(true);
      expect(riskNames.some(r => r.includes('datasource'))).toBe(true);
      expect(riskNames.some(r => r.includes('scrape'))).toBe(true);
      expect(riskNames.some(r => r.includes('storm'))).toBe(true);
    });

    it('schema validation should reject incomplete rows', () => {
      const badRows: RiskRow[] = [
        { risk: '', trigger: 'x', impact: 'x', detection: 'x', mitigation: 'x', residualRisk: 'x' },
      ];
      const validation = validateRiskMatrixSchema(badRows);
      expect(validation.ok).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Remediation Step Generation', () => {
    it('GO verdict should have single positive remediation', () => {
      const out = buildOperationalRiskMatrix(makePassingInput());
      expect(out.remediation).toHaveLength(1);
      expect(out.remediation[0].toLowerCase()).toContain('go');
    });

    it('each failing dimension should produce a remediation step', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({
        falsePositiveRate: 2,
        blastRadius: 8,
        killSwitchP99Seconds: 10,
        rollbackStepsVerified: 2,
      }));
      expect(out.verdict).toBe('NO_GO');
      expect(out.remediation.length).toBe(4);
    });

    it('remediation steps should be specific to failing dimension', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({ falsePositiveRate: 2 }));
      expect(out.remediation.some(r => r.toLowerCase().includes('false positive'))).toBe(true);
    });
  });

  describe('Dimension Metadata', () => {
    it('each dimension should have name, measured, threshold, unit', () => {
      const out = buildOperationalRiskMatrix(makePassingInput());
      for (const dim of out.dimensions) {
        expect(dim.name).toBeDefined();
        expect(dim.name.length).toBeGreaterThan(0);
        expect(typeof dim.measured).toBe('number');
        expect(typeof dim.threshold).toBe('number');
        expect(dim.unit).toBeDefined();
        expect(typeof dim.passed).toBe('boolean');
      }
    });

    it('passing dimensions should not have remediation', () => {
      const out = buildOperationalRiskMatrix(makePassingInput());
      for (const dim of out.dimensions) {
        expect(dim.passed).toBe(true);
        expect(dim.remediation).toBeUndefined();
      }
    });

    it('failing dimensions should have remediation', () => {
      const out = buildOperationalRiskMatrix(makePassingInput({ falsePositiveRate: 2 }));
      const fp = out.dimensions.find(d => d.name === 'False Positive Tolerance')!;
      expect(fp.passed).toBe(false);
      expect(fp.remediation).toBeDefined();
      expect(fp.remediation!.length).toBeGreaterThan(0);
    });
  });
});
