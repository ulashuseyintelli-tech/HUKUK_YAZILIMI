/**
 * Redrive Ops Artifacts — Alert Yapısal Bütünlük Property Test
 *
 * Phase 13: Ops Doc & Alert Rules — Task 4.1
 *
 * **Property 1: Alert Yapısal Bütünlük (INV-13.1)**
 * For any alert rule in the YAML file, the alert SHALL contain:
 *   - severity label (critical | warning)
 *   - team label (backend)
 *   - component label (redrive)
 *   - summary annotation (non-empty)
 *   - description annotation (non-empty)
 *   - runbook annotation (starts with "docs/redrive-ops-runbook.md#")
 *
 * **Validates: Requirements 5.3, 5.4, 5.5, 6.4, 6.5, 7.3, 7.4, 8.3, 8.4, 9.1, 10.3, 10.4**
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ── Types ────────────────────────────────────────────────────────────────────

interface AlertAnnotations {
  summary?: string;
  description?: string;
  runbook?: string;
  [key: string]: unknown;
}

interface AlertLabels {
  severity?: string;
  team?: string;
  component?: string;
  [key: string]: unknown;
}

interface AlertRule {
  alert?: string;
  expr?: string;
  for?: string;
  labels?: AlertLabels;
  annotations?: AlertAnnotations;
}

interface AlertGroup {
  name?: string;
  rules?: AlertRule[];
}

interface AlertRulesFile {
  groups?: AlertGroup[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_SEVERITIES = ['critical', 'warning'] as const;
const REQUIRED_TEAM = 'backend';
const REQUIRED_COMPONENT = 'redrive';
const RUNBOOK_PREFIX = 'docs/redrive-ops-runbook.md#';

const EXPECTED_ALERT_NAMES = [
  'RedriveRateCheckFailed',
  'RedriveTxDurationHigh',
  'RedriveKillSwitchActive',
  'RedriveDepthExceeded',
  'RedriveScrapeDown',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadAlertRules(): AlertRulesFile {
  // Resolve from project root (HUKUK_YAZILIMI/project)
  // __dirname = apps/api/src/modules/calc-preview/diagnostics/object-store/manifest-retry/__tests__
  // 9 levels up: __tests__ → manifest-retry → object-store → diagnostics → calc-preview → modules → src → api → apps → project root
  const yamlPath = path.resolve(
    __dirname,
    '../../../../../../../../../ops/prometheus/redrive-alerts.yml',
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Phase 13 — Property 1: Alert Yapısal Bütünlük (INV-13.1)', () => {
  let doc: AlertRulesFile;
  let rules: AlertRule[];

  beforeAll(() => {
    doc = loadAlertRules();
    rules = extractAllRules(doc);
  });

  // ── Precondition: YAML parses and contains expected alerts ──────────────

  it('should parse YAML without errors and contain groups → rules structure', () => {
    expect(doc).toBeDefined();
    expect(doc.groups).toBeDefined();
    expect(Array.isArray(doc.groups)).toBe(true);
    expect(doc.groups!.length).toBeGreaterThan(0);

    for (const group of doc.groups!) {
      expect(group.rules).toBeDefined();
      expect(Array.isArray(group.rules)).toBe(true);
    }
  });

  it('should contain all 4 expected alert names', () => {
    const alertNames = rules.map((r) => r.alert);
    for (const expected of EXPECTED_ALERT_NAMES) {
      expect(alertNames).toContain(expected);
    }
  });

  // ── Property 1: Structural integrity for EVERY alert ───────────────────

  /**
   * **Validates: Requirements 5.3, 5.4, 5.5, 6.4, 6.5, 7.3, 7.4, 8.3, 8.4, 9.1, 10.3, 10.4**
   *
   * For any alert rule in the YAML file, the alert SHALL contain:
   *   severity label, team label, component: redrive label,
   *   summary annotation, description annotation, runbook annotation.
   */
  describe('for every alert rule → required labels and annotations present', () => {
    it('every alert has a valid severity label (critical | warning)', () => {
      for (const rule of rules) {
        expect(rule.labels).toBeDefined();
        expect(rule.labels!.severity).toBeDefined();
        expect(VALID_SEVERITIES).toContain(rule.labels!.severity);
      }
    });

    it('every alert has team: backend label', () => {
      for (const rule of rules) {
        expect(rule.labels).toBeDefined();
        expect(rule.labels!.team).toBe(REQUIRED_TEAM);
      }
    });

    it('every alert has component: redrive label', () => {
      for (const rule of rules) {
        expect(rule.labels).toBeDefined();
        expect(rule.labels!.component).toBe(REQUIRED_COMPONENT);
      }
    });

    it('every alert has a non-empty summary annotation', () => {
      for (const rule of rules) {
        expect(rule.annotations).toBeDefined();
        expect(typeof rule.annotations!.summary).toBe('string');
        expect(rule.annotations!.summary!.trim().length).toBeGreaterThan(0);
      }
    });

    it('every alert has a non-empty description annotation', () => {
      for (const rule of rules) {
        expect(rule.annotations).toBeDefined();
        expect(typeof rule.annotations!.description).toBe('string');
        expect(rule.annotations!.description!.trim().length).toBeGreaterThan(0);
      }
    });

    it('every alert has a runbook annotation starting with repo-relative path', () => {
      for (const rule of rules) {
        expect(rule.annotations).toBeDefined();
        expect(typeof rule.annotations!.runbook).toBe('string');
        expect(rule.annotations!.runbook!.startsWith(RUNBOOK_PREFIX)).toBe(
          true,
        );
      }
    });
  });

  // ── Per-alert spot checks (severity correctness) ──────────────────────

  describe('per-alert severity correctness', () => {
    it('RedriveRateCheckFailed should be severity: critical', () => {
      const rule = rules.find((r) => r.alert === 'RedriveRateCheckFailed');
      expect(rule).toBeDefined();
      expect(rule!.labels!.severity).toBe('critical');
    });

    it('RedriveTxDurationHigh should be severity: warning', () => {
      const rule = rules.find((r) => r.alert === 'RedriveTxDurationHigh');
      expect(rule).toBeDefined();
      expect(rule!.labels!.severity).toBe('warning');
    });

    it('RedriveKillSwitchActive should be severity: warning', () => {
      const rule = rules.find((r) => r.alert === 'RedriveKillSwitchActive');
      expect(rule).toBeDefined();
      expect(rule!.labels!.severity).toBe('warning');
    });

    it('RedriveDepthExceeded should be severity: warning', () => {
      const rule = rules.find((r) => r.alert === 'RedriveDepthExceeded');
      expect(rule).toBeDefined();
      expect(rule!.labels!.severity).toBe('warning');
    });

    it('RedriveScrapeDown should be severity: critical', () => {
      const rule = rules.find((r) => r.alert === 'RedriveScrapeDown');
      expect(rule).toBeDefined();
      expect(rule!.labels!.severity).toBe('critical');
    });
  });

  // ── Completeness: no alert is missing any required field ──────────────

  describe('completeness — no alert missing any required field', () => {
    it.each(EXPECTED_ALERT_NAMES)(
      '%s has all required labels and annotations',
      (alertName) => {
        const rule = rules.find((r) => r.alert === alertName);
        expect(rule).toBeDefined();

        // Labels
        expect(rule!.labels).toBeDefined();
        expect(VALID_SEVERITIES).toContain(rule!.labels!.severity);
        expect(rule!.labels!.team).toBe(REQUIRED_TEAM);
        expect(rule!.labels!.component).toBe(REQUIRED_COMPONENT);

        // Annotations
        expect(rule!.annotations).toBeDefined();
        expect(rule!.annotations!.summary!.trim().length).toBeGreaterThan(0);
        expect(rule!.annotations!.description!.trim().length).toBeGreaterThan(0);
        expect(rule!.annotations!.runbook!.startsWith(RUNBOOK_PREFIX)).toBe(
          true,
        );
      },
    );
  });
});


/**
 * Redrive Ops Artifacts — Metrik İsim Tutarlılığı Property Test
 *
 * Phase 13: Ops Doc & Alert Rules — Task 4.2
 *
 * **Property 2: Metrik İsim Tutarlılığı (INV-13.2)**
 * For any metric name referenced in alert rule expressions or ops doc PromQL
 * queries, the metric name SHALL exist in the known metric inventory
 * (Phase 11.3 + 11.4 + 12 LOCKED metrics). No alert or PromQL query may
 * reference a non-existent or renamed metric.
 *
 * Histogram sub-metrics (_bucket, _sum, _count) are valid derivatives of
 * their base histogram metric.
 *
 * **Validates: Requirements 13.2, 13.4**
 */
describe('Phase 13 — Property 2: Metrik İsim Tutarlılığı (INV-13.2)', () => {
  // ── Known Metric Inventory (LOCKED — Phase 11.3, 11.4, 12) ──────────

  const KNOWN_METRICS: ReadonlyArray<{
    name: string;
    type: 'Counter' | 'Gauge' | 'Histogram';
  }> = [
    { name: 'carrier_redrive_tx_duration_seconds', type: 'Histogram' },
    { name: 'carrier_redrive_kill_switch_active', type: 'Gauge' },
    { name: 'carrier_redrive_disabled_total', type: 'Counter' },
    { name: 'carrier_redrive_rate_check_failed_total', type: 'Counter' },
    { name: 'carrier_redrive_rate_limited_total', type: 'Counter' },
    { name: 'carrier_redrive_backoff_seconds', type: 'Histogram' },
    { name: 'carrier_redrive_backoff_applied_total', type: 'Counter' },
    { name: 'carrier_redrive_depth_exceeded_total', type: 'Counter' },
    { name: 'carrier_redrive_success_total', type: 'Counter' },
  ];

  const HISTOGRAM_SUFFIXES = ['_bucket', '_sum', '_count'] as const;

  /** Build the full set of valid metric names (base + histogram derivatives) */
  function buildValidMetricSet(): Set<string> {
    const valid = new Set<string>();
    for (const m of KNOWN_METRICS) {
      valid.add(m.name);
      if (m.type === 'Histogram') {
        for (const suffix of HISTOGRAM_SUFFIXES) {
          valid.add(m.name + suffix);
        }
      }
    }
    return valid;
  }

  /**
   * Extract metric names from a PromQL expression string.
   * Matches `carrier_redrive_*` identifiers — the only metric prefix used.
   */
  function extractMetricNames(text: string): string[] {
    const regex = /\bcarrier_redrive_[a-z_]+\b/g;
    const matches = text.match(regex);
    return matches ? [...new Set(matches)] : [];
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  function loadAlertRulesYaml(): AlertRulesFile {
    const yamlPath = path.resolve(
      __dirname,
      '../../../../../../../../../ops/prometheus/redrive-alerts.yml',
    );
    const content = fs.readFileSync(yamlPath, 'utf-8');
    return yaml.load(content) as AlertRulesFile;
  }

  function loadOpsDoc(): string {
    const docPath = path.resolve(
      __dirname,
      '../../../../../../../../../docs/redrive-ops-runbook.md',
    );
    return fs.readFileSync(docPath, 'utf-8');
  }

  /**
   * Extract all PromQL code blocks from the ops doc markdown.
   * Matches fenced code blocks with ```promql language tag.
   */
  function extractPromqlBlocks(markdown: string): string[] {
    const regex = /```promql\s*\n([\s\S]*?)```/g;
    const blocks: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(markdown)) !== null) {
      blocks.push(match[1]);
    }
    return blocks;
  }

  // ── Shared state ───────────────────────────────────────────────────

  let validMetrics: Set<string>;
  let alertDoc: AlertRulesFile;
  let opsDocContent: string;

  beforeAll(() => {
    validMetrics = buildValidMetricSet();
    alertDoc = loadAlertRulesYaml();
    opsDocContent = loadOpsDoc();
  });

  // ── Alert expr metric names ────────────────────────────────────────

  describe('alert rule expressions — all metric names in known inventory', () => {
    it('should extract at least one metric name from alert expressions', () => {
      const rules = extractAllRules(alertDoc);
      const allMetrics: string[] = [];
      for (const rule of rules) {
        if (rule.expr) {
          allMetrics.push(...extractMetricNames(rule.expr));
        }
      }
      expect(allMetrics.length).toBeGreaterThan(0);
    });

    it('every metric name in alert expressions exists in the known inventory', () => {
      const rules = extractAllRules(alertDoc);
      const unknownMetrics: Array<{ alert: string; metric: string }> = [];

      for (const rule of rules) {
        if (!rule.expr) continue;
        const metrics = extractMetricNames(rule.expr);
        for (const metric of metrics) {
          if (!validMetrics.has(metric)) {
            unknownMetrics.push({
              alert: rule.alert ?? '<unnamed>',
              metric,
            });
          }
        }
      }

      expect(unknownMetrics).toEqual([]);
    });
  });

  // ── Ops doc PromQL metric names ────────────────────────────────────

  describe('ops doc PromQL blocks — all metric names in known inventory', () => {
    it('should extract at least one PromQL block from the ops doc', () => {
      const blocks = extractPromqlBlocks(opsDocContent);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('should extract at least one metric name from ops doc PromQL blocks', () => {
      const blocks = extractPromqlBlocks(opsDocContent);
      const allMetrics: string[] = [];
      for (const block of blocks) {
        allMetrics.push(...extractMetricNames(block));
      }
      expect(allMetrics.length).toBeGreaterThan(0);
    });

    it('every metric name in ops doc PromQL blocks exists in the known inventory', () => {
      const blocks = extractPromqlBlocks(opsDocContent);
      const unknownMetrics: Array<{ block: string; metric: string }> = [];

      for (const block of blocks) {
        const metrics = extractMetricNames(block);
        for (const metric of metrics) {
          if (!validMetrics.has(metric)) {
            unknownMetrics.push({
              block: block.trim().substring(0, 80) + '…',
              metric,
            });
          }
        }
      }

      expect(unknownMetrics).toEqual([]);
    });
  });

  // ── Combined: no unknown metrics anywhere ──────────────────────────

  describe('combined — no unknown metric references in any artifact', () => {
    it('all carrier_redrive_* references across both artifacts are valid', () => {
      const rules = extractAllRules(alertDoc);
      const promqlBlocks = extractPromqlBlocks(opsDocContent);

      // Collect all metric references
      const allReferences = new Set<string>();

      for (const rule of rules) {
        if (rule.expr) {
          for (const m of extractMetricNames(rule.expr)) {
            allReferences.add(m);
          }
        }
      }

      for (const block of promqlBlocks) {
        for (const m of extractMetricNames(block)) {
          allReferences.add(m);
        }
      }

      const unknown = [...allReferences].filter((m) => !validMetrics.has(m));
      expect(unknown).toEqual([]);
    });

    it('every known base metric is referenced in at least one artifact', () => {
      const rules = extractAllRules(alertDoc);
      const promqlBlocks = extractPromqlBlocks(opsDocContent);

      // Collect all metric references (base + derivatives)
      const allReferences = new Set<string>();

      for (const rule of rules) {
        if (rule.expr) {
          for (const m of extractMetricNames(rule.expr)) {
            allReferences.add(m);
          }
        }
      }

      for (const block of promqlBlocks) {
        for (const m of extractMetricNames(block)) {
          allReferences.add(m);
        }
      }

      // For each known base metric, check if it or any of its derivatives is referenced
      const unreferencedMetrics: string[] = [];
      for (const known of KNOWN_METRICS) {
        const derivativeNames = [known.name];
        if (known.type === 'Histogram') {
          for (const suffix of HISTOGRAM_SUFFIXES) {
            derivativeNames.push(known.name + suffix);
          }
        }
        const isReferenced = derivativeNames.some((d) =>
          allReferences.has(d),
        );
        if (!isReferenced) {
          unreferencedMetrics.push(known.name);
        }
      }

      expect(unreferencedMetrics).toEqual([]);
    });
  });
});


/**
 * Redrive Ops Artifacts — Alert ↔ Runbook Çift Yönlü Eşleşme Property Test
 *
 * Phase 13: Ops Doc & Alert Rules — Task 4.3
 *
 * **Property 3: Alert ↔ Runbook Çift Yönlü Eşleşme (INV-13.3)**
 * For any alert in the YAML file, the `runbook` annotation SHALL reference
 * a valid section in the ops doc. Conversely, for any runbook section in the
 * ops doc, at least one alert SHALL reference that section. The mapping is
 * bidirectional — no orphan alerts, no orphan runbook sections.
 *
 * **Validates: Requirements 9.1, 9.2, 9.3**
 */
describe('Phase 13 — Property 3: Alert ↔ Runbook Çift Yönlü Eşleşme (INV-13.3)', () => {
  // ── Constants ────────────────────────────────────────────────────────

  const RUNBOOK_PATH_PREFIX = 'docs/redrive-ops-runbook.md';

  /**
   * The main runbook sections (§1, §2, §3) that must be bidirectionally
   * linked with alerts. §0 (Kritik Uyarılar) is excluded — it is an
   * informational preamble, not a playbook section.
   */
  const EXPECTED_RUNBOOK_SECTIONS = [
    '§1 Kill-Switch Prosedürü',
    '§2 Rate Limiting Operasyonel Rehber',
    '§3 TX Duration İzleme',
    '§5 Scrape Health / RedriveScrapeDown',
  ] as const;

  // ── Helpers ──────────────────────────────────────────────────────────

  function loadAlertRulesYaml(): AlertRulesFile {
    const yamlPath = path.resolve(
      __dirname,
      '../../../../../../../../../ops/prometheus/redrive-alerts.yml',
    );
    const content = fs.readFileSync(yamlPath, 'utf-8');
    return yaml.load(content) as AlertRulesFile;
  }

  function loadOpsDoc(): string {
    const docPath = path.resolve(
      __dirname,
      '../../../../../../../../../docs/redrive-ops-runbook.md',
    );
    return fs.readFileSync(docPath, 'utf-8');
  }

  /**
   * Extract all `## §N ...` section headings from the ops doc.
   * Returns an array of heading texts (e.g. "§1 Kill-Switch Prosedürü").
   */
  function extractRunbookSectionHeadings(markdown: string): string[] {
    const regex = /^## (§\d+\s+.+)$/gm;
    const headings: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(markdown)) !== null) {
      headings.push(match[1].trim());
    }
    return headings;
  }

  /**
   * Convert a markdown heading to a GitHub-style anchor slug.
   * Rules: lowercase, spaces → hyphens, remove special chars except
   * Turkish characters and hyphens, collapse consecutive hyphens.
   *
   * GitHub slugification preserves Unicode letters (İ, ü, ö, etc.)
   * but removes punctuation like §, —, etc.
   */
  function headingToAnchor(heading: string): string {
    return heading
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '') // keep Unicode letters, digits, spaces, hyphens
      .trim()
      .replace(/ /g, '-'); // each space → one hyphen (preserve consecutive hyphens from multiple spaces)
  }

  /**
   * Extract the anchor fragment from a runbook annotation path.
   * E.g. "docs/redrive-ops-runbook.md#2-rate-limiting-operasyonel-rehber"
   *   → "2-rate-limiting-operasyonel-rehber"
   */
  function extractAnchor(runbookPath: string): string | null {
    const hashIndex = runbookPath.indexOf('#');
    if (hashIndex === -1) return null;
    return runbookPath.substring(hashIndex + 1);
  }

  /**
   * Normalize an anchor for comparison. Turkish İ/i dotted/dotless
   * variations and other Unicode quirks can cause mismatches.
   *
   * The YAML anchor for "İzleme" uses U+0069 + U+0307 (i + combining dot above)
   * while the heading "İzleme" lowercases İ (U+0130) to plain "i" (U+0069).
   * We strip combining marks (U+0300–U+036F) after NFKD decomposition so both
   * forms collapse to the same ASCII-ish string.
   */
  function normalizeAnchor(anchor: string): string {
    return anchor
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks
      .toLowerCase();
  }

  /**
   * Check if an alert's runbook anchor matches any ops doc section heading.
   * Uses normalized comparison to handle Turkish character variations.
   */
  function anchorMatchesHeading(
    alertAnchor: string,
    headingAnchors: Map<string, string>,
  ): boolean {
    const normalizedAlertAnchor = normalizeAnchor(alertAnchor);
    for (const [, normalizedHeadingAnchor] of headingAnchors) {
      if (normalizedAlertAnchor === normalizedHeadingAnchor) {
        return true;
      }
    }
    return false;
  }

  /**
   * Extract alert names referenced in "İlgili Alert" subsections of the ops doc.
   * Looks for backtick-wrapped alert names (e.g. `RedriveKillSwitchActive`).
   */
  function extractReferencedAlertsFromOpsDoc(markdown: string): Set<string> {
    // Match alert names in backticks that follow the Redrive* pattern
    const regex = /`(Redrive\w+)`/g;
    const alerts = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = regex.exec(markdown)) !== null) {
      alerts.add(match[1]);
    }
    return alerts;
  }

  // ── Shared state ─────────────────────────────────────────────────────

  let alertDoc: AlertRulesFile;
  let rules: AlertRule[];
  let opsDocContent: string;
  let sectionHeadings: string[];
  /** Map: heading text → normalized anchor */
  let headingAnchorMap: Map<string, string>;

  beforeAll(() => {
    alertDoc = loadAlertRulesYaml();
    rules = extractAllRules(alertDoc);
    opsDocContent = loadOpsDoc();
    sectionHeadings = extractRunbookSectionHeadings(opsDocContent);

    headingAnchorMap = new Map<string, string>();
    for (const heading of sectionHeadings) {
      const anchor = headingToAnchor(heading);
      headingAnchorMap.set(heading, normalizeAnchor(anchor));
    }
  });

  // ── Preconditions ────────────────────────────────────────────────────

  it('should find all 3 expected runbook sections (§1, §2, §3) in the ops doc', () => {
    for (const expected of EXPECTED_RUNBOOK_SECTIONS) {
      const found = sectionHeadings.some((h) => h.includes(expected));
      expect(found).toBe(true);
    }
  });

  it('should have at least one alert with a runbook annotation', () => {
    const alertsWithRunbook = rules.filter(
      (r) =>
        r.annotations?.runbook &&
        r.annotations.runbook.startsWith(RUNBOOK_PATH_PREFIX),
    );
    expect(alertsWithRunbook.length).toBeGreaterThan(0);
  });

  // ── Forward mapping: alert → runbook (no orphan alerts) ──────────────

  describe('forward mapping — every alert runbook annotation points to a valid ops doc section', () => {
    it('every alert has a runbook annotation with a valid anchor', () => {
      const orphanAlerts: Array<{ alert: string; runbook: string; anchor: string | null }> = [];

      for (const rule of rules) {
        const runbook = rule.annotations?.runbook ?? '';
        const anchor = extractAnchor(runbook);

        if (!anchor || !anchorMatchesHeading(anchor, headingAnchorMap)) {
          orphanAlerts.push({
            alert: rule.alert ?? '<unnamed>',
            runbook,
            anchor,
          });
        }
      }

      expect(orphanAlerts).toEqual([]);
    });

    it('every alert runbook path starts with the correct ops doc file path', () => {
      for (const rule of rules) {
        const runbook = rule.annotations?.runbook ?? '';
        expect(runbook.startsWith(RUNBOOK_PATH_PREFIX + '#')).toBe(true);
      }
    });
  });

  // ── Reverse mapping: runbook → alert (no orphan sections) ────────────

  describe('reverse mapping — every runbook section (§1, §2, §3) is referenced by at least one alert', () => {
    it('every main runbook section has at least one alert pointing to it', () => {
      // Collect all anchors referenced by alerts
      const referencedAnchors = new Set<string>();
      for (const rule of rules) {
        const anchor = extractAnchor(rule.annotations?.runbook ?? '');
        if (anchor) {
          referencedAnchors.add(normalizeAnchor(anchor));
        }
      }

      const orphanSections: string[] = [];
      for (const heading of sectionHeadings) {
        // Only check §1, §2, §3 (skip §0 which is informational preamble,
        // skip §4 which is delivery/triage — not an alert playbook section)
        if (!heading.startsWith('§0') && !heading.startsWith('§4')) {
          const headingAnchor = headingAnchorMap.get(heading);
          if (headingAnchor && !referencedAnchors.has(headingAnchor)) {
            orphanSections.push(heading);
          }
        }
      }

      expect(orphanSections).toEqual([]);
    });
  });

  // ── Cross-validation with "İlgili Alert" subsections ─────────────────

  describe('cross-validation — ops doc "İlgili Alert" subsections match alert runbook annotations', () => {
    it('every alert name in the YAML is mentioned in the ops doc', () => {
      const alertNamesInYaml = rules.map((r) => r.alert).filter(Boolean) as string[];
      const alertNamesInDoc = extractReferencedAlertsFromOpsDoc(opsDocContent);

      const unreferencedAlerts: string[] = [];
      for (const alertName of alertNamesInYaml) {
        if (!alertNamesInDoc.has(alertName)) {
          unreferencedAlerts.push(alertName);
        }
      }

      expect(unreferencedAlerts).toEqual([]);
    });
  });

  // ── Per-alert spot checks (design matrix verification) ───────────────

  describe('design matrix — alert ↔ runbook section mapping matches design doc', () => {
    const DESIGN_MATRIX: Array<{ alert: string; sectionFragment: string }> = [
      { alert: 'RedriveRateCheckFailed', sectionFragment: 'rate-limiting' },
      { alert: 'RedriveTxDurationHigh', sectionFragment: 'tx-duration' },
      { alert: 'RedriveKillSwitchActive', sectionFragment: 'kill-switch' },
      { alert: 'RedriveDepthExceeded', sectionFragment: 'rate-limiting' },
      { alert: 'RedriveScrapeDown', sectionFragment: 'scrape-health' },
    ];

    it.each(DESIGN_MATRIX)(
      '$alert runbook annotation contains "$sectionFragment"',
      ({ alert, sectionFragment }) => {
        const rule = rules.find((r) => r.alert === alert);
        expect(rule).toBeDefined();

        const anchor = extractAnchor(rule!.annotations?.runbook ?? '');
        expect(anchor).not.toBeNull();
        expect(normalizeAnchor(anchor!)).toContain(sectionFragment);
      },
    );
  });
});


/**
 * Redrive Ops Artifacts — Ops Doc İçerik Doğrulama Unit Test
 *
 * Phase 13: Ops Doc & Alert Rules — Task 4.4
 *
 * Validates the ops doc content structure:
 * 1. 3 playbook sections present (§1, §2, §3)
 * 2. Each section has a "❌ Yapma Listesi" heading
 * 3. PromQL code blocks present (at least one per section)
 * 4. TOC (İçindekiler) present with links to sections
 * 5. Each section's immediate actions have max 7 numbered steps
 *
 * **Validates: Requirements 11.3, 11.4, 1.6, 2.6, 3.6**
 */
describe('Phase 13 — Task 4.4: Ops Doc İçerik Doğrulama', () => {
  // ── Constants ────────────────────────────────────────────────────────

  const PLAYBOOK_SECTIONS = [
    '§1 Kill-Switch Prosedürü',
    '§2 Rate Limiting Operasyonel Rehber',
    '§3 TX Duration İzleme',
    '§5 Scrape Health / RedriveScrapeDown',
  ] as const;

  const MAX_IMMEDIATE_ACTION_STEPS = 7;

  // ── Helpers ──────────────────────────────────────────────────────────

  function loadOpsDoc(): string {
    const docPath = path.resolve(
      __dirname,
      '../../../../../../../../../docs/redrive-ops-runbook.md',
    );
    return fs.readFileSync(docPath, 'utf-8');
  }

  /**
   * Extract the content of a specific section (from its ## heading to the next ## heading).
   * Uses a split-based approach for reliability with multi-line content.
   */
  function extractSectionContent(
    markdown: string,
    sectionHeading: string,
  ): string | null {
    const lines = markdown.split('\n');
    const headingPrefix = `## ${sectionHeading}`;
    let startIdx = -1;

    // Find the start of the section
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(headingPrefix)) {
        startIdx = i;
        break;
      }
    }

    if (startIdx === -1) return null;

    // Find the end (next ## heading or EOF)
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (/^## /.test(lines[i])) {
        endIdx = i;
        break;
      }
    }

    return lines.slice(startIdx, endIdx).join('\n');
  }

  /**
   * Extract PromQL code blocks from a markdown string.
   */
  function extractPromqlBlocks(markdown: string): string[] {
    const regex = /```promql\s*\n([\s\S]*?)```/g;
    const blocks: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(markdown)) !== null) {
      blocks.push(match[1]);
    }
    return blocks;
  }

  /**
   * Count numbered steps in "Immediate actions" tables within a section.
   * Looks for table rows with numbered steps (| 1 | ... | ... |).
   * Specifically targets the "Immediate actions" subsection.
   */
  function countImmediateActionSteps(sectionContent: string): number {
    // Find the "Immediate actions" subsection (### 3. Immediate actions ...)
    const immediateActionsRegex =
      /### 3\. Immediate actions[\s\S]*?(?=\n### |\n---|\n## |$)/;
    const immediateSection = sectionContent.match(immediateActionsRegex);
    if (!immediateSection) return 0;

    // Count numbered rows in tables: | <number> | ... |
    const stepRegex = /^\|\s*(\d+)\s*\|/gm;
    let count = 0;
    let stepMatch: RegExpExecArray | null;
    while ((stepMatch = stepRegex.exec(immediateSection[0])) !== null) {
      // Only count actual step numbers (not table header separators)
      const num = parseInt(stepMatch[1], 10);
      if (!isNaN(num) && num > 0) {
        count = Math.max(count, num);
      }
    }
    return count;
  }

  // ── Shared state ─────────────────────────────────────────────────────

  let opsDocContent: string;

  beforeAll(() => {
    opsDocContent = loadOpsDoc();
  });

  // ── 1. Three playbook sections present ───────────────────────────────

  describe('playbook sections — all 3 sections present', () => {
    it.each(PLAYBOOK_SECTIONS)(
      'ops doc contains section: %s',
      (section) => {
        const regex = new RegExp(`^## ${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm');
        expect(opsDocContent).toMatch(regex);
      },
    );
  });

  // ── 2. Each section has a "Yapma Listesi" ────────────────────────────

  /**
   * **Validates: Requirements 1.6, 2.6, 3.6**
   *
   * Each playbook section SHALL contain a "❌ Yapma Listesi" heading
   * with at least 1 item.
   */
  describe('yapma listesi — each section has a "❌ Yapma Listesi" heading', () => {
    it.each(PLAYBOOK_SECTIONS)(
      '%s contains "❌ Yapma Listesi" heading',
      (section) => {
        const content = extractSectionContent(opsDocContent, section);
        expect(content).not.toBeNull();
        expect(content).toMatch(/### ❌ Yapma Listesi/);
      },
    );

    it.each(PLAYBOOK_SECTIONS)(
      '%s "Yapma Listesi" has at least 1 numbered item',
      (section) => {
        const content = extractSectionContent(opsDocContent, section);
        expect(content).not.toBeNull();

        // Find the Yapma Listesi subsection
        const yapmaRegex = /### ❌ Yapma Listesi[\s\S]*?(?=\n### |\n---|\n## |$)/;
        const yapmaSection = content!.match(yapmaRegex);
        expect(yapmaSection).not.toBeNull();

        // Count numbered items (1. ..., 2. ..., etc.)
        const itemRegex = /^\d+\.\s+\*\*/gm;
        const items = yapmaSection![0].match(itemRegex);
        expect(items).not.toBeNull();
        expect(items!.length).toBeGreaterThanOrEqual(1);
      },
    );
  });

  // ── 3. PromQL code blocks present ────────────────────────────────────

  /**
   * **Validates: Requirement 11.4**
   *
   * The ops doc SHALL show all PromQL queries in code blocks.
   * Each playbook section should have at least one PromQL code block.
   */
  describe('PromQL code blocks — at least one per section', () => {
    it('ops doc contains PromQL code blocks overall', () => {
      const blocks = extractPromqlBlocks(opsDocContent);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it.each(PLAYBOOK_SECTIONS)(
      '%s contains at least one ```promql code block',
      (section) => {
        const content = extractSectionContent(opsDocContent, section);
        expect(content).not.toBeNull();

        const blocks = extractPromqlBlocks(content!);
        expect(blocks.length).toBeGreaterThanOrEqual(1);
      },
    );
  });

  // ── 4. TOC (İçindekiler) present ─────────────────────────────────────

  /**
   * **Validates: Requirement 11.3**
   *
   * The ops doc SHALL contain a table of contents (İçindekiler).
   */
  describe('TOC — İçindekiler present with section links', () => {
    it('ops doc contains "İçindekiler" heading', () => {
      expect(opsDocContent).toMatch(/^## İçindekiler/m);
    });

    it('TOC contains links to all 3 playbook sections', () => {
      // Extract the TOC section
      const tocRegex = /^## İçindekiler[\s\S]*?(?=\n## )/m;
      const tocSection = opsDocContent.match(tocRegex);
      expect(tocSection).not.toBeNull();

      const tocContent = tocSection![0];

      // Check for markdown links to each section
      // §1 → kill-switch
      expect(tocContent).toMatch(/\[.*Kill-Switch.*\]\(#/i);
      // §2 → rate limiting
      expect(tocContent).toMatch(/\[.*Rate Limiting.*\]\(#/i);
      // §3 → TX Duration
      expect(tocContent).toMatch(/\[.*TX Duration.*\]\(#/i);
    });
  });

  // ── 5. Step count ≤ 7 per section ────────────────────────────────────

  /**
   * **Validates: Requirement 13.3 (NFR)**
   *
   * Each section's "Immediate actions" should have max 7 numbered steps.
   */
  describe('immediate actions — max 7 steps per section', () => {
    it.each(PLAYBOOK_SECTIONS)(
      '%s immediate actions have ≤ %i steps',
      (section) => {
        const content = extractSectionContent(opsDocContent, section);
        expect(content).not.toBeNull();

        const stepCount = countImmediateActionSteps(content!);
        expect(stepCount).toBeGreaterThan(0); // At least 1 step
        expect(stepCount).toBeLessThanOrEqual(MAX_IMMEDIATE_ACTION_STEPS);
      },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 13.1 — Alertmanager Config Validation Tests
// ═══════════════════════════════════════════════════════════════════════════════

// ── Alertmanager Types ───────────────────────────────────────────────────────

interface AlertmanagerConfig {
  global?: { resolve_timeout?: string };
  receivers?: Array<{ name: string; [key: string]: unknown }>;
  route?: AlertmanagerRoute;
  inhibit_rules?: Array<{
    source_matchers?: string[];
    target_matchers?: string[];
    equal?: string[];
  }>;
}

interface AlertmanagerRoute {
  receiver?: string;
  group_by?: string[];
  group_wait?: string;
  group_interval?: string;
  repeat_interval?: string;
  match?: Record<string, string>;
  match_re?: Record<string, string>;
  continue?: boolean;
  routes?: AlertmanagerRoute[];
}

// ── Alertmanager config yolu ─────────────────────────────────────────────────

const alertmanagerYamlPath = path.resolve(
  __dirname,
  '../../../../../../../../../ops/alertmanager/alertmanager.yml',
);

const alertmanagerRaw = fs.readFileSync(alertmanagerYamlPath, 'utf-8');

// ── Route matching helper ────────────────────────────────────────────────────
//
// Alertmanager route ağacını yürüyerek verilen label set'ine
// karşılık gelen receiver'ı döndürür.
//
// Kurallar:
//   1. Root route'tan başla
//   2. Çocuk route'un `match` label'ları alert label'larının alt kümesiyse gir
//   3. Çocuk route'un kendi `routes`'u varsa recursive devam et
//   4. `continue: false` (veya tanımsız) ise ilk eşleşmede dur
//   5. Hiçbir çocuk eşleşmezse mevcut route'un receiver'ı kullanılır
//      (veya parent'tan devralınır)

function resolveReceiver(
  route: AlertmanagerRoute,
  labels: Record<string, string>,
  inheritedReceiver: string,
): string {
  const currentReceiver = route.receiver ?? inheritedReceiver;

  if (route.routes) {
    for (const child of route.routes) {
      // match kontrolü — tüm match label'ları alert'te bulunmalı
      if (child.match) {
        const allMatch = Object.entries(child.match).every(
          ([k, v]) => labels[k] === v,
        );
        if (!allMatch) continue;
      }

      // Eşleşen çocuk route'a gir (recursive)
      const resolved = resolveReceiver(child, labels, currentReceiver);
      if (resolved !== currentReceiver || !child.routes) {
        // Çocuk route'ta eşleşme bulundu veya leaf node
        return resolved;
      }

      // continue: true ise sonraki kardeşe devam et
      if (child.continue !== true) {
        return resolved;
      }
    }
  }

  return currentReceiver;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Task 4.1 — Alertmanager Config Yapısal Bütünlük
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 13.1 — Property 1 & 3: Alertmanager Config Yapısal Bütünlük (INV-13.1.1, INV-13.1.3)', () => {
  let config: AlertmanagerConfig;

  beforeAll(() => {
    config = yaml.load(alertmanagerRaw) as AlertmanagerConfig;
  });

  // ── 1. YAML hatasız parse edilmeli ───────────────────────────────────────

  it('YAML hatasız parse edilmeli', () => {
    expect(() => yaml.load(alertmanagerRaw)).not.toThrow();
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
  });

  // ── 2. receivers bölümü mevcut ve dizi olmalı ───────────────────────────

  it('receivers bölümü mevcut ve dizi olmalı', () => {
    expect(config.receivers).toBeDefined();
    expect(Array.isArray(config.receivers)).toBe(true);
    expect(config.receivers!.length).toBeGreaterThan(0);
  });

  // ── 3. route bölümü mevcut olmalı ───────────────────────────────────────

  it('route bölümü mevcut olmalı', () => {
    expect(config.route).toBeDefined();
    expect(typeof config.route).toBe('object');
  });

  // ── 4. inhibit_rules bölümü mevcut, dizi ve en az 1 kural ──────────────

  it('inhibit_rules bölümü mevcut, dizi ve en az 1 kural içermeli', () => {
    expect(config.inhibit_rules).toBeDefined();
    expect(Array.isArray(config.inhibit_rules)).toBe(true);
    expect(config.inhibit_rules!.length).toBeGreaterThanOrEqual(1);
  });

  // ── 5. Gerekli receiver isimleri mevcut olmalı ──────────────────────────

  it.each(['slack-default', 'pagerduty-critical', 'slack-warning'])(
    'receiver "%s" tanımlı olmalı',
    (receiverName) => {
      const names = config.receivers!.map((r) => r.name);
      expect(names).toContain(receiverName);
    },
  );

  // ── 6. Route tree group_by: ['alertname', 'component'] ─────────────────

  it("root route group_by ['alertname', 'component'] olarak tanımlı olmalı", () => {
    expect(config.route!.group_by).toBeDefined();
    expect(config.route!.group_by).toEqual(
      expect.arrayContaining(['alertname', 'component']),
    );
    expect(config.route!.group_by).toHaveLength(2);
  });

  // ── 7. Route tree'deki her receiver adı receivers listesinde olmalı ─────

  it('route tree içindeki tüm receiver referansları receivers listesinde bulunmalı', () => {
    const receiverNames = new Set(config.receivers!.map((r) => r.name));

    function collectRouteReceivers(route: AlertmanagerRoute): string[] {
      const result: string[] = [];
      if (route.receiver) result.push(route.receiver);
      if (route.routes) {
        for (const child of route.routes) {
          result.push(...collectRouteReceivers(child));
        }
      }
      return result;
    }

    const routeReceivers = collectRouteReceivers(config.route!);
    for (const ref of routeReceivers) {
      expect(receiverNames).toContain(ref);
    }
  });

  // ── 8. Root route catch-all: receiver = 'slack-default' ─────────────────

  it("root route receiver 'slack-default' (catch-all) olmalı", () => {
    expect(config.route!.receiver).toBe('slack-default');
  });

  // ── 9. Timing değerleri tanımlı olmalı ──────────────────────────────────

  it('root route timing değerleri (group_wait, group_interval, repeat_interval) tanımlı olmalı', () => {
    expect(config.route!.group_wait).toBeDefined();
    expect(typeof config.route!.group_wait).toBe('string');

    expect(config.route!.group_interval).toBeDefined();
    expect(typeof config.route!.group_interval).toBe('string');

    expect(config.route!.repeat_interval).toBeDefined();
    expect(typeof config.route!.repeat_interval).toBe('string');
  });

  // ── 10. Inhibition rule yapısı doğru olmalı ─────────────────────────────

  it("inhibition rule source_matchers, target_matchers ve equal: ['component'] içermeli", () => {
    const rule = config.inhibit_rules![0];

    expect(rule.source_matchers).toBeDefined();
    expect(Array.isArray(rule.source_matchers)).toBe(true);
    expect(rule.source_matchers!.length).toBeGreaterThan(0);

    expect(rule.target_matchers).toBeDefined();
    expect(Array.isArray(rule.target_matchers)).toBe(true);
    expect(rule.target_matchers!.length).toBeGreaterThan(0);

    expect(rule.equal).toBeDefined();
    expect(rule.equal).toEqual(['component']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Task 4.2 — Route Determinizm ve Inhibition
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 13.1 — Property 1 & 2: Route Determinizm ve Inhibition (INV-13.1.1, INV-13.1.2)', () => {
  let config: AlertmanagerConfig;

  beforeAll(() => {
    config = yaml.load(alertmanagerRaw) as AlertmanagerConfig;
  });

  // ── Route resolution testleri ──────────────────────────────────────────

  describe('route resolution — deterministik receiver eşleşmesi', () => {
    it("critical redrive alert → 'pagerduty-critical'", () => {
      const labels = {
        team: 'backend',
        component: 'redrive',
        severity: 'critical',
      };
      const receiver = resolveReceiver(
        config.route!,
        labels,
        config.route!.receiver!,
      );
      expect(receiver).toBe('pagerduty-critical');
    });

    it("warning redrive alert → 'slack-warning'", () => {
      const labels = {
        team: 'backend',
        component: 'redrive',
        severity: 'warning',
      };
      const receiver = resolveReceiver(
        config.route!,
        labels,
        config.route!.receiver!,
      );
      expect(receiver).toBe('slack-warning');
    });

    it("severity'siz redrive alert → 'slack-default' (catch-all'a düşer)", () => {
      const labels = {
        team: 'backend',
        component: 'redrive',
      };
      const receiver = resolveReceiver(
        config.route!,
        labels,
        config.route!.receiver!,
      );
      expect(receiver).toBe('slack-default');
    });

    it("yanlış team label → 'slack-default' (catch-all'a düşer)", () => {
      const labels = {
        team: 'frontend',
        component: 'ui',
      };
      const receiver = resolveReceiver(
        config.route!,
        labels,
        config.route!.receiver!,
      );
      expect(receiver).toBe('slack-default');
    });
  });

  // ── Inhibition validation ──────────────────────────────────────────────

  describe('inhibition — critical aktifken warning susturulur', () => {
    it('inhibition rule aynı component üzerinde critical→warning bastırma senaryosunu desteklemeli', () => {
      const rule = config.inhibit_rules![0];

      // source_matchers: severity = "critical" içermeli
      const hasSourceCritical = rule.source_matchers!.some((m) =>
        m.includes('critical'),
      );
      expect(hasSourceCritical).toBe(true);

      // target_matchers: severity = "warning" içermeli
      const hasTargetWarning = rule.target_matchers!.some((m) =>
        m.includes('warning'),
      );
      expect(hasTargetWarning).toBe(true);

      // equal: ['component'] — aynı component'teki alert'ler birbirini etkiler
      expect(rule.equal).toEqual(['component']);

      // Senaryo doğrulaması:
      // critical alert: { component: 'redrive', severity: 'critical' }
      // warning alert:  { component: 'redrive', severity: 'warning' }
      // → component eşleşir, source=critical, target=warning → warning susturulur
      const criticalLabels = { component: 'redrive', severity: 'critical' };
      const warningLabels = { component: 'redrive', severity: 'warning' };

      // equal alanındaki her label her iki alert'te de aynı değere sahip olmalı
      for (const eqLabel of rule.equal!) {
        expect(criticalLabels[eqLabel as keyof typeof criticalLabels]).toBe(
          warningLabels[eqLabel as keyof typeof warningLabels],
        );
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 13.3 — p99 Kalibrasyon Prosedürü Tamlık & Kontrat Testleri
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 13.3 — Property 2: Kalibrasyon Prosedürü Tamlık', () => {
  /**
   * **Property 2: Kalibrasyon Prosedürü Tamlık**
   * Runbook §3 Deep dive altındaki formal kalibrasyon prosedürü,
   * tüm gerekli alt bölümleri ve anahtar ifadeleri içermelidir.
   *
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4**
   */

  let opsDoc: string;
  let section3Content: string | null;

  function loadOpsDocForCalibration(): string {
    const docPath = path.resolve(
      __dirname,
      '../../../../../../../../../docs/redrive-ops-runbook.md',
    );
    return fs.readFileSync(docPath, 'utf-8');
  }

  function extractSection(markdown: string, heading: string): string | null {
    const lines = markdown.split('\n');
    const prefix = `## ${heading}`;
    let startIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(prefix)) {
        startIdx = i;
        break;
      }
    }
    if (startIdx === -1) return null;
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (/^## /.test(lines[i])) {
        endIdx = i;
        break;
      }
    }
    return lines.slice(startIdx, endIdx).join('\n');
  }

  beforeAll(() => {
    opsDoc = loadOpsDocForCalibration();
    section3Content = extractSection(opsDoc, '§3 TX Duration');
  });

  it('§3 bölümü mevcut olmalı', () => {
    expect(section3Content).not.toBeNull();
  });

  it('formal kalibrasyon prosedürü başlığı mevcut olmalı', () => {
    expect(section3Content).toMatch(/Kalibrasyon Prosedürü \(Formal\)/i);
  });

  it('gözlem penceresi tanımı (7 gün) mevcut olmalı', () => {
    expect(section3Content).toMatch(/Gözlem Penceresi/i);
    expect(section3Content).toMatch(/7 gün/i);
  });

  it('baseline çıkarma yöntemi (median-of-daily p99) mevcut olmalı', () => {
    expect(section3Content).toMatch(/Baseline Çıkarma/i);
    expect(section3Content).toMatch(/median/i);
  });

  it('eşik formülü ve çarpan aralığı (1.5–2.0) mevcut olmalı', () => {
    expect(section3Content).toMatch(/Eşik Formülü/i);
    expect(section3Content).toMatch(/1\.5/);
    expect(section3Content).toMatch(/2\.0/);
  });

  it('gürültü bastırma kuralları (deploy sonrası 24-48 saat) mevcut olmalı', () => {
    expect(section3Content).toMatch(/Gürültü Bastırma/i);
    expect(section3Content).toMatch(/24.*48/);
  });

  it('"Ne zaman kalibre edilmeli / edilmemeli" bölümü mevcut olmalı', () => {
    expect(section3Content).toMatch(/Ne Zaman Kalibre Edilmeli/i);
    expect(section3Content).toMatch(/Kalibrasyon yapılmaması/i);
  });

  it('kalibrasyon tetikleyicileri tanımlı olmalı', () => {
    expect(section3Content).toMatch(/trafik pattern/i);
    expect(section3Content).toMatch(/altyapı değişikliği/i);
    expect(section3Content).toMatch(/false positive/i);
  });

  it('min sample guard ayarlama rehberi mevcut olmalı', () => {
    expect(section3Content).toMatch(/Min Sample Guard/i);
    expect(section3Content).toMatch(/0\.1 req\/s/);
  });

  it('en az bir PromQL sorgu bloğu mevcut olmalı', () => {
    const promqlBlocks = section3Content!.match(/```promql/g);
    expect(promqlBlocks).not.toBeNull();
    expect(promqlBlocks!.length).toBeGreaterThanOrEqual(1);
  });

  it('eski "× 3" çarpanı kaldırılmış olmalı', () => {
    // "baseline × 3" veya "Eşik = baseline × 3" ifadesi kalibrasyon prosedüründe olmamalı
    const calibrationSection = section3Content!.match(
      /Kalibrasyon Prosedürü \(Formal\)[\s\S]*?(?=\n---|\n### 5\. Rollback|$)/,
    );
    if (calibrationSection) {
      expect(calibrationSection[0]).not.toMatch(/baseline\s*×\s*3/i);
    }
  });
});

describe('Phase 13.3 — Property 3: Alert Kalibrasyon Yorumları', () => {
  /**
   * **Property 3: Alert Kalibrasyon Yorumları**
   * RedriveTxDurationHigh alert bloğunda kalibrasyon hedefi
   * YAML yorumları mevcut olmalıdır.
   *
   * **Validates: Requirements 4.1, 4.2, 4.4**
   */

  let alertRulesRaw: string;

  beforeAll(() => {
    const yamlPath = path.resolve(
      __dirname,
      '../../../../../../../../../ops/prometheus/redrive-alerts.yml',
    );
    alertRulesRaw = fs.readFileSync(yamlPath, 'utf-8');
  });

  // Extract the comment block above RedriveTxDurationHigh
  function extractTxDurationCommentBlock(): string {
    const lines = alertRulesRaw.split('\n');
    const alertLineIdx = lines.findIndex((l) =>
      l.includes('- alert: RedriveTxDurationHigh'),
    );
    if (alertLineIdx === -1) return '';
    // Walk backwards from the alert line to collect comment lines
    let startIdx = alertLineIdx - 1;
    while (startIdx >= 0 && lines[startIdx].trim().startsWith('#')) {
      startIdx--;
    }
    return lines.slice(startIdx + 1, alertLineIdx).join('\n');
  }

  it('RedriveTxDurationHigh alert bloğu mevcut olmalı', () => {
    expect(alertRulesRaw).toContain('- alert: RedriveTxDurationHigh');
  });

  it('p99_threshold kalibrasyon hedefi yorumu mevcut olmalı', () => {
    const commentBlock = extractTxDurationCommentBlock();
    expect(commentBlock).toMatch(/p99_threshold/);
    expect(commentBlock).toMatch(/LOCKED/i);
  });

  it('min_sample_guard kalibrasyon hedefi yorumu mevcut olmalı', () => {
    const commentBlock = extractTxDurationCommentBlock();
    expect(commentBlock).toMatch(/min_sample_guard/);
    expect(commentBlock).toMatch(/LOCKED/i);
  });

  it('runbook §3 kalibrasyon prosedürüne referans mevcut olmalı', () => {
    const commentBlock = extractTxDurationCommentBlock();
    expect(commentBlock).toMatch(/redrive-ops-runbook\.md/i);
  });
});

describe('Phase 13.3 — Property 4: Post-Kalibrasyon Checklist Tamlık', () => {
  /**
   * **Property 4: Post-Kalibrasyon Checklist Tamlık**
   * Runbook §3'teki post-kalibrasyon güncelleme checklist'i
   * tüm gerekli adımları içermelidir.
   *
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
   */

  let opsDoc: string;
  let section3Content: string | null;

  function loadOpsDocForChecklist(): string {
    const docPath = path.resolve(
      __dirname,
      '../../../../../../../../../docs/redrive-ops-runbook.md',
    );
    return fs.readFileSync(docPath, 'utf-8');
  }

  function extractSection(markdown: string, heading: string): string | null {
    const lines = markdown.split('\n');
    const prefix = `## ${heading}`;
    let startIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(prefix)) {
        startIdx = i;
        break;
      }
    }
    if (startIdx === -1) return null;
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (/^## /.test(lines[i])) {
        endIdx = i;
        break;
      }
    }
    return lines.slice(startIdx, endIdx).join('\n');
  }

  beforeAll(() => {
    opsDoc = loadOpsDocForChecklist();
    section3Content = extractSection(opsDoc, '§3 TX Duration');
  });

  it('post-kalibrasyon checklist başlığı mevcut olmalı', () => {
    expect(section3Content).toMatch(/Post-Kalibrasyon/i);
    expect(section3Content).toMatch(/Checklist/i);
  });

  it('alert kuralı güncelleme adımı ve dosya yolu mevcut olmalı', () => {
    expect(section3Content).toMatch(/redrive-alerts\.yml/);
  });

  it('test güncelleme adımı ve dosya yolu mevcut olmalı', () => {
    expect(section3Content).toMatch(/redrive-ops-artifacts\.spec\.ts/);
  });

  it('CI doğrulama adımı mevcut olmalı', () => {
    expect(section3Content).toMatch(/jest.*redrive-ops-artifacts/i);
  });

  it('rollback prosedürü mevcut olmalı', () => {
    expect(section3Content).toMatch(/[Rr]ollback/);
    // Rollback bölümünde eski eşik değerine geri dönme ifadesi olmalı
    expect(section3Content).toMatch(/eski.*eşik|eşik.*geri/i);
  });

  it('checklist en az 8 adım içermeli', () => {
    // Checklist tablosundaki numaralı satırları say
    const checklistSection = section3Content!.match(
      /Post-Kalibrasyon[\s\S]*?(?=\n##### |\n### |\n---|\n## |$)/i,
    );
    expect(checklistSection).not.toBeNull();
    const numberedRows = checklistSection![0].match(/^\|\s*\d+\s*\|/gm);
    expect(numberedRows).not.toBeNull();
    expect(numberedRows!.length).toBeGreaterThanOrEqual(8);
  });
});
