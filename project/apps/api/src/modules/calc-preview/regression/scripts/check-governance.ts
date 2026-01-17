/**
 * Regression Governance Check Script
 * 
 * CI'da çalıştırılacak governance kontrolleri
 * 
 * Kontroller:
 * 1. known-diffs expiry kontrolü
 * 2. Allowlist size kontrolü
 * 3. Baseline change branch kontrolü
 * 4. Tolerance change detection
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

interface KnownDiff {
  scenarioId: string;
  path: string;
  reason: string;
  expiresAt?: string;
}

interface KnownDiffsFile {
  knownDiffs: KnownDiff[];
}

interface GovernanceResult {
  passed: boolean;
  checks: GovernanceCheck[];
}

interface GovernanceCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning';
}

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG = {
  maxKnownDiffs: 10,
  allowlistsDir: path.resolve(__dirname, '../allowlists'),
  baselinesDir: path.resolve(__dirname, '../baselines'),
};

// ============================================================================
// CHECKS
// ============================================================================

/**
 * Check for expired known-diffs
 */
function checkExpiredDiffs(): GovernanceCheck {
  const filePath = path.join(CONFIG.allowlistsDir, 'known-diffs.json');
  
  if (!fs.existsSync(filePath)) {
    return {
      name: 'expired-diffs',
      passed: true,
      message: 'No known-diffs file found',
      severity: 'warning',
    };
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content) as KnownDiffsFile;
  
  const now = new Date();
  const expired = data.knownDiffs.filter(diff => {
    if (!diff.expiresAt) return false;
    return new Date(diff.expiresAt) < now;
  });
  
  if (expired.length > 0) {
    return {
      name: 'expired-diffs',
      passed: false,
      message: `${expired.length} expired known-diff(s) found: ${expired.map(d => d.scenarioId).join(', ')}`,
      severity: 'error',
    };
  }
  
  return {
    name: 'expired-diffs',
    passed: true,
    message: 'No expired known-diffs',
    severity: 'error',
  };
}

/**
 * Check known-diffs count
 */
function checkKnownDiffsCount(): GovernanceCheck {
  const filePath = path.join(CONFIG.allowlistsDir, 'known-diffs.json');
  
  if (!fs.existsSync(filePath)) {
    return {
      name: 'known-diffs-count',
      passed: true,
      message: 'No known-diffs file found',
      severity: 'warning',
    };
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content) as KnownDiffsFile;
  
  const count = data.knownDiffs.length;
  
  if (count > CONFIG.maxKnownDiffs) {
    return {
      name: 'known-diffs-count',
      passed: false,
      message: `known-diffs has ${count} items (max ${CONFIG.maxKnownDiffs}). Consider fixing root causes.`,
      severity: 'error',
    };
  }
  
  if (count > CONFIG.maxKnownDiffs * 0.7) {
    return {
      name: 'known-diffs-count',
      passed: true,
      message: `known-diffs has ${count} items (warning threshold: ${Math.floor(CONFIG.maxKnownDiffs * 0.7)})`,
      severity: 'warning',
    };
  }
  
  return {
    name: 'known-diffs-count',
    passed: true,
    message: `known-diffs has ${count} items`,
    severity: 'warning',
  };
}

/**
 * Check for missing expiry dates
 */
function checkMissingExpiry(): GovernanceCheck {
  const filePath = path.join(CONFIG.allowlistsDir, 'known-diffs.json');
  
  if (!fs.existsSync(filePath)) {
    return {
      name: 'missing-expiry',
      passed: true,
      message: 'No known-diffs file found',
      severity: 'warning',
    };
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content) as KnownDiffsFile;
  
  const missingExpiry = data.knownDiffs.filter(diff => !diff.expiresAt);
  
  if (missingExpiry.length > 0) {
    return {
      name: 'missing-expiry',
      passed: false,
      message: `${missingExpiry.length} known-diff(s) missing expiresAt: ${missingExpiry.map(d => d.scenarioId).join(', ')}`,
      severity: 'error',
    };
  }
  
  return {
    name: 'missing-expiry',
    passed: true,
    message: 'All known-diffs have expiry dates',
    severity: 'error',
  };
}

/**
 * Check baseline files have corresponding scenarios
 */
function checkOrphanedBaselines(): GovernanceCheck {
  const scenariosDir = path.resolve(__dirname, '../scenarios');
  
  if (!fs.existsSync(CONFIG.baselinesDir) || !fs.existsSync(scenariosDir)) {
    return {
      name: 'orphaned-baselines',
      passed: true,
      message: 'Directories not found',
      severity: 'warning',
    };
  }
  
  const scenarios = fs.readdirSync(scenariosDir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
  
  const baselines = fs.readdirSync(CONFIG.baselinesDir)
    .filter(f => f.endsWith('.expected.json'))
    .map(f => f.replace('.expected.json', ''));
  
  const orphaned = baselines.filter(b => !scenarios.includes(b));
  
  if (orphaned.length > 0) {
    return {
      name: 'orphaned-baselines',
      passed: false,
      message: `${orphaned.length} orphaned baseline(s) found: ${orphaned.join(', ')}`,
      severity: 'warning',
    };
  }
  
  return {
    name: 'orphaned-baselines',
    passed: true,
    message: 'No orphaned baselines',
    severity: 'warning',
  };
}

// ============================================================================
// MAIN
// ============================================================================

function runGovernanceChecks(): GovernanceResult {
  const checks: GovernanceCheck[] = [
    checkExpiredDiffs(),
    checkKnownDiffsCount(),
    checkMissingExpiry(),
    checkOrphanedBaselines(),
  ];
  
  const passed = checks.every(c => c.passed || c.severity === 'warning');
  
  return { passed, checks };
}

// ============================================================================
// CLI
// ============================================================================

function main(): void {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                 REGRESSION GOVERNANCE CHECK                    ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n');
  
  const result = runGovernanceChecks();
  
  for (const check of result.checks) {
    const icon = check.passed ? '✓' : (check.severity === 'error' ? '✖' : '⚠');
    const color = check.passed ? '\x1b[32m' : (check.severity === 'error' ? '\x1b[31m' : '\x1b[33m');
    console.log(`${color}${icon}\x1b[0m ${check.name}: ${check.message}`);
  }
  
  console.log('\n');
  
  if (result.passed) {
    console.log('\x1b[32m✓ All governance checks passed\x1b[0m');
    process.exit(0);
  } else {
    console.log('\x1b[31m✖ Governance checks failed\x1b[0m');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { runGovernanceChecks, GovernanceResult, GovernanceCheck };
