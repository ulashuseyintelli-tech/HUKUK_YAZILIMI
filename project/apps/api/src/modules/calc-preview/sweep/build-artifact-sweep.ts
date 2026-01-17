/**
 * Phase 5.7 - Build Artifact Sweep
 * 
 * Prod build'in temiz olduğunu doğrular:
 * - chaos/regression modülleri dahil değil
 * - source map'ler kapalı (prod'da)
 * - tree-shaking çalışıyor
 * - test util'ler dahil değil
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 5.7
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

export interface BuildArtifactViolation {
  file: string;
  rule: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface BuildArtifactSweepResult {
  violations: BuildArtifactViolation[];
  stats: {
    totalFiles: number;
    totalSize: number;
    jsFiles: number;
    mapFiles: number;
  };
  passed: boolean;
}

// ============================================================================
// FORBIDDEN PATTERNS IN PROD BUILD
// ============================================================================

const FORBIDDEN_PATTERNS = [
  {
    pattern: /\/chaos\//,
    rule: 'NO_CHAOS_IN_PROD',
    message: 'Chaos module found in production build',
    severity: 'ERROR' as const,
  },
  {
    pattern: /\/regression\//,
    rule: 'NO_REGRESSION_IN_PROD',
    message: 'Regression module found in production build',
    severity: 'ERROR' as const,
  },
  {
    pattern: /\/load-test\//,
    rule: 'NO_LOAD_TEST_IN_PROD',
    message: 'Load test module found in production build',
    severity: 'ERROR' as const,
  },
  {
    pattern: /\/__test__\//,
    rule: 'NO_TEST_UTILS_IN_PROD',
    message: 'Test utilities found in production build',
    severity: 'ERROR' as const,
  },
  {
    pattern: /\.spec\.js$/,
    rule: 'NO_SPEC_FILES_IN_PROD',
    message: 'Spec files found in production build',
    severity: 'ERROR' as const,
  },
  {
    pattern: /\.test\.js$/,
    rule: 'NO_TEST_FILES_IN_PROD',
    message: 'Test files found in production build',
    severity: 'ERROR' as const,
  },
];

const FORBIDDEN_CONTENT_PATTERNS = [
  {
    pattern: /ENABLE_CHAOS_ENDPOINTS/,
    rule: 'NO_CHAOS_FLAG_REFERENCE',
    message: 'Reference to ENABLE_CHAOS_ENDPOINTS found in production build',
    severity: 'WARNING' as const,
  },
  {
    pattern: /FaultInjectorService/,
    rule: 'NO_FAULT_INJECTOR',
    message: 'FaultInjectorService found in production build',
    severity: 'ERROR' as const,
  },
  {
    pattern: /ChaosController/,
    rule: 'NO_CHAOS_CONTROLLER',
    message: 'ChaosController found in production build',
    severity: 'ERROR' as const,
  },
  {
    pattern: /RegressionRunner/,
    rule: 'NO_REGRESSION_RUNNER',
    message: 'RegressionRunner found in production build',
    severity: 'ERROR' as const,
  },
];

// ============================================================================
// SCANNER
// ============================================================================

function walkDir(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    return fileList;
  }

  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      walkDir(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

function checkFilePath(filePath: string): BuildArtifactViolation[] {
  const violations: BuildArtifactViolation[] = [];
  
  for (const forbidden of FORBIDDEN_PATTERNS) {
    if (forbidden.pattern.test(filePath)) {
      violations.push({
        file: filePath,
        rule: forbidden.rule,
        message: forbidden.message,
        severity: forbidden.severity,
      });
    }
  }
  
  return violations;
}

function checkFileContent(filePath: string): BuildArtifactViolation[] {
  const violations: BuildArtifactViolation[] = [];
  
  // Only check JS files
  if (!filePath.endsWith('.js')) {
    return violations;
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    for (const forbidden of FORBIDDEN_CONTENT_PATTERNS) {
      if (forbidden.pattern.test(content)) {
        violations.push({
          file: filePath,
          rule: forbidden.rule,
          message: forbidden.message,
          severity: forbidden.severity,
        });
      }
    }
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
  }
  
  return violations;
}

// ============================================================================
// MAIN
// ============================================================================

export function runBuildArtifactSweep(distDir: string): BuildArtifactSweepResult {
  const files = walkDir(distDir);
  const allViolations: BuildArtifactViolation[] = [];
  
  let totalSize = 0;
  let jsFiles = 0;
  let mapFiles = 0;
  
  for (const file of files) {
    // Check file path
    const pathViolations = checkFilePath(file);
    allViolations.push(...pathViolations);
    
    // Check file content
    const contentViolations = checkFileContent(file);
    allViolations.push(...contentViolations);
    
    // Collect stats
    try {
      const stat = fs.statSync(file);
      totalSize += stat.size;
      
      if (file.endsWith('.js')) jsFiles++;
      if (file.endsWith('.map')) mapFiles++;
    } catch {
      // Ignore stat errors
    }
  }
  
  // Check for source maps in production
  if (mapFiles > 0 && process.env.NODE_ENV === 'production') {
    allViolations.push({
      file: distDir,
      rule: 'NO_SOURCE_MAPS_IN_PROD',
      message: `Found ${mapFiles} source map files in production build`,
      severity: 'WARNING',
    });
  }
  
  const hasErrors = allViolations.some(v => v.severity === 'ERROR');
  
  return {
    violations: allViolations,
    stats: {
      totalFiles: files.length,
      totalSize,
      jsFiles,
      mapFiles,
    },
    passed: !hasErrors,
  };
}

export function formatBuildSweepResult(result: BuildArtifactSweepResult): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════════════════════',
    '  BUILD ARTIFACT SWEEP REPORT',
    '═══════════════════════════════════════════════════════════════════════════════',
    '',
    'STATS:',
    `  Total files: ${result.stats.totalFiles}`,
    `  Total size: ${(result.stats.totalSize / 1024 / 1024).toFixed(2)} MB`,
    `  JS files: ${result.stats.jsFiles}`,
    `  Map files: ${result.stats.mapFiles}`,
    '',
    `Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`,
    '',
  ];
  
  if (result.violations.length > 0) {
    const errors = result.violations.filter(v => v.severity === 'ERROR');
    const warnings = result.violations.filter(v => v.severity === 'WARNING');
    
    if (errors.length > 0) {
      lines.push('ERRORS:');
      lines.push('───────────────────────────────────────────────────────────────────────────────');
      for (const v of errors) {
        lines.push(`  ❌ ${v.rule}`);
        lines.push(`     File: ${v.file}`);
        lines.push(`     Message: ${v.message}`);
        lines.push('');
      }
    }
    
    if (warnings.length > 0) {
      lines.push('WARNINGS:');
      lines.push('───────────────────────────────────────────────────────────────────────────────');
      for (const v of warnings) {
        lines.push(`  ⚠️ ${v.rule}`);
        lines.push(`     File: ${v.file}`);
        lines.push(`     Message: ${v.message}`);
        lines.push('');
      }
    }
  }
  
  return lines.join('\n');
}

// CLI entry point
if (require.main === module) {
  const distDir = process.argv[2] || path.join(__dirname, '../../../../dist');
  console.log(`Scanning: ${distDir}\n`);
  
  const result = runBuildArtifactSweep(distDir);
  console.log(formatBuildSweepResult(result));
  
  process.exit(result.passed ? 0 : 1);
}
