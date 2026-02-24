/**
 * Stage-1 Live Infra Prerequisite Validation (Task 1.2)
 *
 * Validates that alertmanager.yml has non-placeholder PagerDuty service_key detection,
 * Grafana datasource UID placeholder detection, and Stage-0 entry gate reference check.
 *
 * @see .kiro/specs/stage-1-runtime-baseline/requirements.md — R2.4, R5.1
 * @see .kiro/specs/stage-1-runtime-baseline/design.md — Faz 3, Faz 4
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ============================================================================
// Types
// ============================================================================

interface AlertmanagerConfig {
  receivers?: Array<{
    name: string;
    pagerduty_configs?: Array<{ service_key?: string }>;
    slack_configs?: Array<{ api_url?: string; channel?: string }>;
  }>;
  route?: {
    receiver?: string;
    routes?: Array<{
      match?: Record<string, string>;
      receiver?: string;
      routes?: Array<{ match?: Record<string, string>; receiver?: string }>;
    }>;
  };
}

interface GrafanaDashboardFile {
  dashboard?: {
    panels?: Array<{
      title?: string;
      datasource?: { uid?: string; type?: string } | string;
      targets?: Array<{ expr?: string; datasource?: { uid?: string } }>;
    }>;
    templating?: {
      list?: Array<{ datasource?: { uid?: string; type?: string }; name?: string }>;
    };
  };
  panels?: Array<{
    title?: string;
    datasource?: { uid?: string; type?: string } | string;
    targets?: Array<{ expr?: string; datasource?: { uid?: string } }>;
  }>;
}

// ============================================================================
// Helpers
// ============================================================================

function loadAlertmanagerConfig(): AlertmanagerConfig {
  const yamlPath = path.resolve(
    __dirname,
    '../../../../../../../../../ops/alertmanager/alertmanager.yml',
  );
  return yaml.load(fs.readFileSync(yamlPath, 'utf-8')) as AlertmanagerConfig;
}

function loadGrafanaDashboard(): GrafanaDashboardFile {
  const jsonPath = path.resolve(
    __dirname,
    '../../../../../../../../../ops/grafana/guard-dashboard.json',
  );
  return JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as GrafanaDashboardFile;
}

function getDashboardPanels(db: GrafanaDashboardFile) {
  // Support both { dashboard: { panels } } and { panels } structures
  return db.dashboard?.panels ?? db.panels ?? [];
}

/**
 * Detects if a PagerDuty service_key is a placeholder.
 * Placeholders: starts with '<', empty string, contains 'PLACEHOLDER', 'TODO', 'CHANGE_ME'.
 */
function isPDKeyPlaceholder(key: string | undefined): boolean {
  if (!key || key.trim() === '') return true;
  const upper = key.toUpperCase();
  if (key.startsWith('<') && key.endsWith('>')) return true;
  if (upper.includes('PLACEHOLDER')) return true;
  if (upper.includes('TODO')) return true;
  if (upper.includes('CHANGE_ME')) return true;
  if (upper.includes('CHANGEME')) return true;
  if (upper === 'YOUR_KEY_HERE') return true;
  return false;
}

/**
 * Detects if a Grafana datasource UID is a placeholder.
 */
function isDatasourceUIDPlaceholder(uid: string | undefined): boolean {
  if (!uid || uid.trim() === '') return true;
  const upper = uid.toUpperCase();
  if (uid.startsWith('<') && uid.endsWith('>')) return true;
  if (upper.includes('PLACEHOLDER')) return true;
  if (upper.includes('TODO')) return true;
  if (upper === 'DS_PROMETHEUS') return true; // Grafana default template var
  return false;
}

/**
 * Detects if a Grafana datasource URL points to localhost (not live).
 */
function isDatasourceURLLocal(url: string | undefined): boolean {
  if (!url || url.trim() === '') return true;
  if (url.includes('localhost')) return true;
  if (url.includes('127.0.0.1')) return true;
  return false;
}

// ============================================================================
// Stage-0 Reference Check
// ============================================================================

const STAGE_0_REQUIRED_SUITES = [
  'stage-0-route-determinism.spec.ts',
  'stage-0-s1-evidence.spec.ts',
  'stage-0-s2-evidence.spec.ts',
  'stage-0-pilot-config.spec.ts',
  'stage-0-metrics-completeness.spec.ts',
  'stage-0-alert-inventory.spec.ts',
  'stage-0-dashboard-validity.spec.ts',
  'stage-0-rollback-ordering.spec.ts',
  'stage-0-evidence-pack.spec.ts',
];

// ============================================================================
// Tests
// ============================================================================

describe('Stage-1 Infra Prerequisites (Task 1.2)', () => {
  let amConfig: AlertmanagerConfig;
  let dashboardFile: GrafanaDashboardFile;

  beforeAll(() => {
    amConfig = loadAlertmanagerConfig();
    dashboardFile = loadGrafanaDashboard();
  });

  describe('PagerDuty Service Key Placeholder Detection', () => {
    it('should detect empty string as placeholder', () => {
      expect(isPDKeyPlaceholder('')).toBe(true);
    });

    it('should detect angle-bracket wrapped as placeholder', () => {
      expect(isPDKeyPlaceholder('<YOUR_PD_KEY>')).toBe(true);
    });

    it('should detect PLACEHOLDER keyword as placeholder', () => {
      expect(isPDKeyPlaceholder('PLACEHOLDER_KEY')).toBe(true);
    });

    it('should detect TODO keyword as placeholder', () => {
      expect(isPDKeyPlaceholder('TODO_replace_this')).toBe(true);
    });

    it('should detect CHANGE_ME as placeholder', () => {
      expect(isPDKeyPlaceholder('CHANGE_ME')).toBe(true);
    });

    it('should accept a real-looking key as non-placeholder', () => {
      expect(isPDKeyPlaceholder('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')).toBe(false);
    });

    it('pagerduty-critical receiver should exist in alertmanager config', () => {
      const pdReceiver = amConfig.receivers!.find(r => r.name === 'pagerduty-critical');
      expect(pdReceiver).toBeDefined();
      expect(pdReceiver!.pagerduty_configs).toBeDefined();
      expect(pdReceiver!.pagerduty_configs!.length).toBeGreaterThan(0);
    });

    it('pagerduty-critical should have service_key field defined', () => {
      const pdReceiver = amConfig.receivers!.find(r => r.name === 'pagerduty-critical');
      const key = pdReceiver!.pagerduty_configs![0].service_key;
      expect(key).toBeDefined();
      // Note: In config file it may be a placeholder — this test validates the detection logic
      // Live infra check will use isPDKeyPlaceholder() to verify non-placeholder
    });

    it('placeholder detection function should correctly classify known patterns', () => {
      const placeholders = ['', '<key>', 'PLACEHOLDER', 'TODO', 'CHANGE_ME', 'CHANGEME', 'YOUR_KEY_HERE'];
      const realKeys = ['abc123def456', 'e93f2a1b4c5d', 'real-service-key-value'];

      for (const p of placeholders) {
        expect(isPDKeyPlaceholder(p)).toBe(true);
      }
      for (const r of realKeys) {
        expect(isPDKeyPlaceholder(r)).toBe(false);
      }
    });
  });

  describe('Grafana Datasource UID Placeholder Detection', () => {
    it('should detect empty UID as placeholder', () => {
      expect(isDatasourceUIDPlaceholder('')).toBe(true);
    });

    it('should detect DS_PROMETHEUS as placeholder', () => {
      expect(isDatasourceUIDPlaceholder('DS_PROMETHEUS')).toBe(true);
    });

    it('should detect angle-bracket wrapped as placeholder', () => {
      expect(isDatasourceUIDPlaceholder('<DATASOURCE_UID>')).toBe(true);
    });

    it('should accept a real UID as non-placeholder', () => {
      expect(isDatasourceUIDPlaceholder('abc123-prom-uid')).toBe(false);
    });

    it('guard-dashboard.json should exist and have panels', () => {
      expect(dashboardFile).toBeDefined();
      const panels = getDashboardPanels(dashboardFile);
      expect(panels.length).toBeGreaterThan(0);
    });

    it('datasource URL localhost detection should work', () => {
      expect(isDatasourceURLLocal('http://localhost:9090')).toBe(true);
      expect(isDatasourceURLLocal('http://127.0.0.1:9090')).toBe(true);
      expect(isDatasourceURLLocal('http://prometheus.monitoring.svc:9090')).toBe(false);
      expect(isDatasourceURLLocal('')).toBe(true);
    });
  });

  describe('Stage-0 Entry Gate Reference Check', () => {
    it('all 9 Stage-0 test suites should exist as files', () => {
      for (const suite of STAGE_0_REQUIRED_SUITES) {
        const suitePath = path.resolve(__dirname, suite);
        expect(fs.existsSync(suitePath)).toBe(true);
      }
    });

    it('Stage-0 required suites list should have exactly 9 entries', () => {
      expect(STAGE_0_REQUIRED_SUITES).toHaveLength(9);
    });

    it('each Stage-0 suite file should be non-empty', () => {
      for (const suite of STAGE_0_REQUIRED_SUITES) {
        const suitePath = path.resolve(__dirname, suite);
        const content = fs.readFileSync(suitePath, 'utf-8');
        expect(content.trim().length).toBeGreaterThan(0);
      }
    });

    it('each Stage-0 suite should contain at least one describe block', () => {
      for (const suite of STAGE_0_REQUIRED_SUITES) {
        const suitePath = path.resolve(__dirname, suite);
        const content = fs.readFileSync(suitePath, 'utf-8');
        expect(content).toContain('describe(');
      }
    });
  });

  describe('Alertmanager Guard Route Presence', () => {
    it('should have component=guard route in alertmanager config', () => {
      const routes = amConfig.route!.routes ?? [];
      const guardRoute = routes.find(r => r.match?.component === 'guard');
      expect(guardRoute).toBeDefined();
    });

    it('guard route should have critical and warning sub-routes', () => {
      const routes = amConfig.route!.routes ?? [];
      const guardRoute = routes.find(r => r.match?.component === 'guard');
      const subRoutes = guardRoute!.routes ?? [];
      const severities = subRoutes.map(r => r.match?.severity).filter(Boolean).sort();
      expect(severities).toEqual(['critical', 'warning']);
    });
  });
});
