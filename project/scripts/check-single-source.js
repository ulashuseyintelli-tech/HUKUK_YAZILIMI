#!/usr/bin/env node
/**
 * Single Source of Truth Check Script
 * 
 * CI/CD pipeline'da çalıştırılır.
 * Frontend'de lokal para hesaplaması yapan kod varsa build fail eder.
 * 
 * Kullanım:
 *   pnpm check:single-source
 *   node scripts/check-single-source.js
 * 
 * @see docs/single-source-of-truth-architecture.md
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const WEB_SRC_PATH = 'apps/web/src';

/**
 * Yasak pattern'ler - bunlar frontend'de olmamalı
 */
const FORBIDDEN_PATTERNS = [
  // Hardcoded oran tabloları
  { pattern: 'TCMB_AVANS_ORANLARI', description: 'Hardcoded TCMB rate table' },
  { pattern: 'YASAL_FAIZ_ORANLARI', description: 'Hardcoded legal interest rate table' },
  { pattern: 'TCMB_ORAN', description: 'TCMB rate reference' },
  
  // Lokal hesaplama fonksiyonları (stub dışında)
  // Not: Stub'lar "assertNoMockInProduction" içermeli
  
  // Tahmini hesaplama pattern'leri
  { pattern: 'principal\\s*\\*\\s*0\\.\\d+\\s*\\*', description: 'Local interest calculation' },
  { pattern: 'tutar\\s*\\*\\s*\\d+\\.\\d+\\s*/', description: 'Local amount calculation' },
  { pattern: 'amount\\s*\\*\\s*dailyRate', description: 'Local daily rate calculation' },
  
  // Mock data pattern'leri (production'da yasak)
  { pattern: 'setMockData|useMockData', description: 'Mock data usage' },
];

/**
 * İzin verilen istisnalar (dosya:satır formatında)
 */
const ALLOWED_EXCEPTIONS = [
  // Test dosyaları
  '**/__tests__/**',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  
  // Stub dosyaları (assertNoMockInProduction içermeli)
  // Bu dosyalar manuel olarak kontrol edilmeli
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recursively find all .ts and .tsx files in a directory
 */
function findFiles(dir, extensions = ['.ts', '.tsx']) {
  const results = [];
  
  if (!fs.existsSync(dir)) {
    return results;
  }
  
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Skip node_modules and hidden directories
      if (item !== 'node_modules' && !item.startsWith('.')) {
        results.push(...findFiles(fullPath, extensions));
      }
    } else if (extensions.some(ext => item.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  
  return results;
}

/**
 * Search for pattern in files
 */
function searchInFiles(pattern, files) {
  const results = [];
  const regex = new RegExp(pattern, 'gi');
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        if (regex.test(line)) {
          results.push({
            file: file.replace(/\\/g, '/'),
            line: index + 1,
            content: line.trim(),
          });
        }
        // Reset regex lastIndex for global flag
        regex.lastIndex = 0;
      });
    } catch (err) {
      // Skip files that can't be read
    }
  }
  
  return results;
}

function isExcluded(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return ALLOWED_EXCEPTIONS.some(exception => {
    if (exception.includes('**')) {
      const regex = new RegExp(exception.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
      return regex.test(normalizedPath);
    }
    return normalizedPath.includes(exception);
  });
}

function checkPatterns() {
  const violations = [];
  
  console.log('🔍 Checking for Single Source of Truth violations...\n');
  
  // Find all TypeScript files in web src
  const srcPath = path.join(process.cwd(), WEB_SRC_PATH);
  const files = findFiles(srcPath);
  
  console.log(`   Found ${files.length} TypeScript files to check\n`);
  
  for (const { pattern, description } of FORBIDDEN_PATTERNS) {
    const matches = searchInFiles(pattern, files);
    
    for (const match of matches) {
      // İstisnaları atla
      if (isExcluded(match.file)) {
        continue;
      }
      
      // assertNoMockInProduction içeren satırları atla (stub'lar)
      if (match.content.includes('assertNoMockInProduction')) {
        continue;
      }
      
      // Boş array tanımlarını atla (stub'lar)
      if (match.content.includes('= []') || match.content.includes('= [];')) {
        continue;
      }
      
      // Import satırlarını atla
      if (match.content.includes('import ') || match.content.includes('from ')) {
        continue;
      }
      
      violations.push({
        pattern,
        description,
        file: match.file,
        line: match.line,
        content: match.content.substring(0, 100) + (match.content.length > 100 ? '...' : ''),
      });
    }
  }
  
  return violations;
}

function checkFeatureFlags() {
  // Production build'de ALLOW_MOCK_CALCULATIONS true olmamalı
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_ALLOW_MOCK_CALCULATIONS === 'true') {
    console.error('❌ CRITICAL: ALLOW_MOCK_CALCULATIONS is true in production build!');
    return false;
  }
  return true;
}

function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('       SINGLE SOURCE OF TRUTH CHECK');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  let hasErrors = false;
  
  // 1. Pattern check
  const violations = checkPatterns();
  
  if (violations.length > 0) {
    hasErrors = true;
    console.error('❌ Found Single Source of Truth violations:\n');
    
    for (const v of violations) {
      console.error(`  📍 ${v.file}:${v.line}`);
      console.error(`     Pattern: ${v.pattern}`);
      console.error(`     Issue: ${v.description}`);
      console.error(`     Content: ${v.content}\n`);
    }
    
    console.error(`\n❌ Total violations: ${violations.length}`);
    console.error('\nTo fix:');
    console.error('  1. Remove local calculations from frontend');
    console.error('  2. Use backend API (interest-engine, fee-engine) instead');
    console.error('  3. See docs/single-source-of-truth-architecture.md\n');
  } else {
    console.log('✅ No forbidden patterns found in frontend code\n');
  }
  
  // 2. Feature flag check
  if (!checkFeatureFlags()) {
    hasErrors = true;
  } else {
    console.log('✅ Feature flags are correctly configured\n');
  }
  
  // 3. Summary
  console.log('═══════════════════════════════════════════════════════════════');
  
  if (hasErrors) {
    console.error('❌ SINGLE SOURCE CHECK FAILED\n');
    process.exit(1);
  } else {
    console.log('✅ SINGLE SOURCE CHECK PASSED\n');
    process.exit(0);
  }
}

main();
