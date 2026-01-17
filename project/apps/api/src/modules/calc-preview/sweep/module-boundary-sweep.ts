/**
 * Phase 5.7 - Module Boundary Sweep
 * 
 * Import grafiğini analiz eder ve mimari ihlalleri tespit eder:
 * - calc-preview tek giriş noktası mı?
 * - metrics/cache/breaker/trace → yukarı doğru import ediyor mu? (yasak)
 * - provider adapter'ları → birbirini görüyor mu? (yasak)
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 5.7
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

export interface ModuleBoundaryViolation {
  file: string;
  line: number;
  importPath: string;
  rule: string;
  message: string;
}

export interface ModuleBoundarySweepResult {
  violations: ModuleBoundaryViolation[];
  scannedFiles: number;
  passed: boolean;
}

// ============================================================================
// BOUNDARY RULES
// ============================================================================

const BOUNDARY_RULES = {
  // Internal modules cannot import from parent calc-preview
  NO_UPWARD_IMPORTS: {
    name: 'NO_UPWARD_IMPORTS',
    description: 'Internal modules cannot import from parent calc-preview module',
    check: (fromFile: string, importPath: string): boolean => {
      const internalModules = ['metrics', 'cache', 'breaker', 'trace', 'chaos', 'regression'];
      const isInInternal = internalModules.some(m => fromFile.includes(`/${m}/`));
      const importsParent = importPath.includes('../calc-preview') || 
                           importPath.includes('calc-preview.service') ||
                           importPath.includes('calc-preview.controller');
      return isInInternal && importsParent;
    },
  },

  // Provider adapters cannot import each other
  NO_CROSS_PROVIDER_IMPORTS: {
    name: 'NO_CROSS_PROVIDER_IMPORTS',
    description: 'Provider adapters cannot import each other',
    check: (fromFile: string, importPath: string): boolean => {
      const providers = ['rate-provider', 'tariff-provider', 'policy-engine'];
      const fromProvider = providers.find(p => fromFile.includes(`/${p}/`));
      const toProvider = providers.find(p => importPath.includes(p));
      return !!fromProvider && !!toProvider && fromProvider !== toProvider;
    },
  },

  // Chaos module cannot be imported in production code
  NO_CHAOS_IN_PROD: {
    name: 'NO_CHAOS_IN_PROD',
    description: 'Chaos module cannot be imported in production code',
    check: (fromFile: string, importPath: string): boolean => {
      const isTestFile = fromFile.includes('.spec.') || 
                        fromFile.includes('.test.') ||
                        fromFile.includes('__test__') ||
                        fromFile.includes('/chaos/') ||
                        fromFile.includes('/regression/') ||
                        fromFile.includes('/load-test/') ||
                        fromFile.includes('/contracts/');
      const importsChaos = importPath.includes('/chaos/') || importPath.includes('chaos.');
      return !isTestFile && importsChaos;
    },
  },

  // Regression module cannot be imported in production code
  NO_REGRESSION_IN_PROD: {
    name: 'NO_REGRESSION_IN_PROD',
    description: 'Regression module cannot be imported in production code',
    check: (fromFile: string, importPath: string): boolean => {
      const isTestFile = fromFile.includes('.spec.') || 
                        fromFile.includes('.test.') ||
                        fromFile.includes('__test__') ||
                        fromFile.includes('/chaos/') ||
                        fromFile.includes('/regression/') ||
                        fromFile.includes('/load-test/') ||
                        fromFile.includes('/contracts/');
      const importsRegression = importPath.includes('/regression/') || importPath.includes('regression.');
      return !isTestFile && importsRegression;
    },
  },
};

// ============================================================================
// SCANNER
// ============================================================================

const IMPORT_REGEX = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;

function extractImports(content: string): Array<{ line: number; path: string }> {
  const imports: Array<{ line: number; path: string }> = [];
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    const matches = line.matchAll(IMPORT_REGEX);
    for (const match of matches) {
      imports.push({
        line: index + 1,
        path: match[1],
      });
    }
  });
  
  return imports;
}

function scanFile(filePath: string): ModuleBoundaryViolation[] {
  const violations: ModuleBoundaryViolation[] = [];
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const imports = extractImports(content);
    
    for (const imp of imports) {
      for (const rule of Object.values(BOUNDARY_RULES)) {
        if (rule.check(filePath, imp.path)) {
          violations.push({
            file: filePath,
            line: imp.line,
            importPath: imp.path,
            rule: rule.name,
            message: rule.description,
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning ${filePath}:`, error);
  }
  
  return violations;
}

function walkDir(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules and dist
      if (file !== 'node_modules' && file !== 'dist') {
        walkDir(filePath, fileList);
      }
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

// ============================================================================
// MAIN
// ============================================================================

export function runModuleBoundarySweep(rootDir: string): ModuleBoundarySweepResult {
  const files = walkDir(rootDir);
  const allViolations: ModuleBoundaryViolation[] = [];
  
  for (const file of files) {
    const violations = scanFile(file);
    allViolations.push(...violations);
  }
  
  return {
    violations: allViolations,
    scannedFiles: files.length,
    passed: allViolations.length === 0,
  };
}

export function formatViolations(result: ModuleBoundarySweepResult): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════════════════════',
    '  MODULE BOUNDARY SWEEP REPORT',
    '═══════════════════════════════════════════════════════════════════════════════',
    '',
    `Scanned files: ${result.scannedFiles}`,
    `Violations: ${result.violations.length}`,
    `Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`,
    '',
  ];
  
  if (result.violations.length > 0) {
    lines.push('VIOLATIONS:');
    lines.push('───────────────────────────────────────────────────────────────────────────────');
    
    for (const v of result.violations) {
      lines.push(`  ${v.file}:${v.line}`);
      lines.push(`    Import: ${v.importPath}`);
      lines.push(`    Rule: ${v.rule}`);
      lines.push(`    Message: ${v.message}`);
      lines.push('');
    }
  }
  
  return lines.join('\n');
}

// CLI entry point
if (require.main === module) {
  const rootDir = process.argv[2] || path.join(__dirname, '..');
  console.log(`Scanning: ${rootDir}\n`);
  
  const result = runModuleBoundarySweep(rootDir);
  console.log(formatViolations(result));
  
  process.exit(result.passed ? 0 : 1);
}
