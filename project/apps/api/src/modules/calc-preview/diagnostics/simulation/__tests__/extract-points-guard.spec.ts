/**
 * extractPoints Guard Test
 * 
 * Phase 9B.6-LOCK - Single Source of Truth Enforcement
 * 
 * This test ensures that direct .points access is not used in production code.
 * calcResult is the SINGLE SOURCE OF TRUTH - use extractPoints() to get points.
 * 
 * RULE: No direct .points access outside of:
 * - extractPoints() in calc-result-projection.ts
 * - Test files (*.spec.ts)
 * - snapshot-ordering.ts (for sorting)
 * 
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 */

import * as fs from 'fs';
import * as path from 'path';

describe('extractPoints Guard (Phase 9B.6-LOCK)', () => {
  const diagnosticsDir = path.join(__dirname, '..', '..');
  
  // Files that are allowed to access .points directly
  const allowlist = [
    'calc-result-projection.ts', // The single source of truth
    'snapshot-ordering.ts',      // Sorting utilities
    '.spec.ts',                  // Test files
    '.test.ts',                  // Test files
    'mock-',                     // Mock files
  ];

  /**
   * Check if a file is in the allowlist
   */
  function isAllowed(filePath: string): boolean {
    const fileName = path.basename(filePath);
    return allowlist.some(pattern => fileName.includes(pattern));
  }

  /**
   * Recursively get all TypeScript files
   */
  function getTypeScriptFiles(dir: string): string[] {
    const files: string[] = [];
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip node_modules and __tests__ directories for non-test files
          if (entry.name !== 'node_modules') {
            files.push(...getTypeScriptFiles(fullPath));
          }
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
    
    return files;
  }

  /**
   * Check file for direct .points access
   */
  function checkFileForDirectPointsAccess(filePath: string): string[] {
    const violations: string[] = [];
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      
      // Patterns that indicate direct .points access
      // Excludes: extractPoints, .points.length (common in tests), comments
      const patterns = [
        /\.points\[/,           // Direct array access: .points[0]
        /\.points\s*=/,         // Assignment: .points =
        /const\s*{\s*points\s*}/, // Destructuring: const { points }
        /let\s*{\s*points\s*}/,   // Destructuring: let { points }
      ];
      
      lines.forEach((line, index) => {
        // Skip comments
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
          return;
        }
        
        // Skip lines that use extractPoints
        if (line.includes('extractPoints')) {
          return;
        }
        
        // Skip lines that are clearly test assertions
        if (line.includes('expect(') || line.includes('toBe(') || line.includes('toEqual(')) {
          return;
        }
        
        for (const pattern of patterns) {
          if (pattern.test(line)) {
            violations.push(`${filePath}:${index + 1}: ${line.trim()}`);
          }
        }
      });
    } catch {
      // File can't be read
    }
    
    return violations;
  }

  it('should not have direct .points access in production code', () => {
    const files = getTypeScriptFiles(diagnosticsDir);
    const productionFiles = files.filter(f => !isAllowed(f));
    
    const allViolations: string[] = [];
    
    for (const file of productionFiles) {
      const violations = checkFileForDirectPointsAccess(file);
      allViolations.push(...violations);
    }
    
    if (allViolations.length > 0) {
      const message = [
        'Direct .points access detected in production code!',
        'Use extractPoints(calcResult) from calc-result-projection.ts instead.',
        '',
        'Violations:',
        ...allViolations.map(v => `  - ${v}`),
      ].join('\n');
      
      fail(message);
    }
    
    // If we get here, no violations found
    expect(allViolations.length).toBe(0);
  });

  it('should have extractPoints function exported from calc-result-projection.ts', () => {
    const projectionPath = path.join(diagnosticsDir, 'simulation', 'calc-result-projection.ts');
    
    expect(fs.existsSync(projectionPath)).toBe(true);
    
    const content = fs.readFileSync(projectionPath, 'utf-8');
    expect(content).toContain('export function extractPoints');
  });

  it('should document single source of truth in snapshot-store.interface.ts', () => {
    const interfacePath = path.join(diagnosticsDir, 'persistence', 'snapshot-store.interface.ts');
    
    expect(fs.existsSync(interfacePath)).toBe(true);
    
    const content = fs.readFileSync(interfacePath, 'utf-8');
    expect(content).toContain('SINGLE SOURCE OF TRUTH');
    expect(content).toContain('extractPoints');
  });
});
