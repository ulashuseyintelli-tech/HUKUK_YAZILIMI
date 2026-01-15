#!/usr/bin/env ts-node
/**
 * CI Para Hesabı Sızıntı Kontrolü
 * 
 * Çekirdek dışı para hesabı arayan script.
 * CI'da çalışır - leak bulunursa exit 1.
 * 
 * Kullanım:
 *   npx ts-node scripts/check-money-leaks.ts
 *   pnpm check:money-leaks
 * 
 * @see ARCHITECTURE.md - Source of Truth Matrix
 */

import { execSync } from 'child_process';
import * as path from 'path';

// ==================== YASAKLI PATTERN'LER ====================
const FORBIDDEN_PATTERNS = [
  // Faiz formülleri
  { pattern: 'principal\\s*\\*\\s*rate', description: 'Faiz hesabı (principal * rate)' },
  { pattern: '\\*\\s*days\\s*/\\s*365', description: 'Faiz formülü (* days / 365)' },
  { pattern: '/\\s*36500', description: 'Faiz formülü (/ 36500)' },
  { pattern: 'Math\\.round\\(.*\\*.*rate', description: 'Faiz yuvarlaması' },
  
  // Para yuvarlaması
  { pattern: '\\.toFixed\\(2\\)', description: 'Para yuvarlaması (toFixed)' },
  
  // Mahsup hesabı
  { pattern: 'remaining\\s*-=', description: 'Manuel mahsup hesabı' },
  
  // Oran hesabı
  { pattern: 'interestRate\\s*/\\s*100', description: 'Oran dönüşümü' },
];

// ==================== İZİN VERİLEN YOLLAR ====================
const ALLOWED_PATHS = [
  'interest-engine/',
  'fee-engine/',
  'allocation/',
  '__tests__/',
  '.spec.ts',
  '.test.ts',
  'check-money-leaks.ts', // Bu script
];

// ==================== TARAMA YAPILACAK YOLLAR ====================
const SCAN_PATHS = [
  'apps/api/src/modules',
  'apps/web/src',
  'packages',
];

interface LeakResult {
  file: string;
  line: number;
  pattern: string;
  description: string;
  content: string;
}

function isAllowedPath(filePath: string): boolean {
  return ALLOWED_PATHS.some(allowed => filePath.includes(allowed));
}

function searchPattern(pattern: string, scanPath: string): string[] {
  try {
    const result = execSync(
      `grep -rn -E "${pattern}" ${scanPath} --include="*.ts" --include="*.tsx" 2>/dev/null || true`,
      { encoding: 'utf-8', cwd: path.join(__dirname, '..') }
    );
    return result.split('\n').filter(line => line.trim());
  } catch {
    return [];
  }
}

function main() {
  console.log('🔍 Para Hesabı Sızıntı Kontrolü');
  console.log('================================\n');

  const leaks: LeakResult[] = [];

  for (const scanPath of SCAN_PATHS) {
    console.log(`📂 Taranıyor: ${scanPath}`);
    
    for (const { pattern, description } of FORBIDDEN_PATTERNS) {
      const matches = searchPattern(pattern, scanPath);
      
      for (const match of matches) {
        const [filePath, ...rest] = match.split(':');
        const lineNum = parseInt(rest[0], 10);
        const content = rest.slice(1).join(':').trim();
        
        // İzin verilen yolları atla
        if (isAllowedPath(filePath)) {
          continue;
        }
        
        leaks.push({
          file: filePath,
          line: lineNum,
          pattern,
          description,
          content: content.substring(0, 100),
        });
      }
    }
  }

  console.log('\n');

  if (leaks.length === 0) {
    console.log('✅ Çekirdek dışı para hesabı bulunamadı!');
    console.log('   Tüm hesaplamalar interest-engine/fee-engine içinde.\n');
    process.exit(0);
  }

  console.log(`❌ ${leaks.length} adet çekirdek dışı hesap bulundu!\n`);
  console.log('Bulunan sızıntılar:');
  console.log('-------------------\n');

  for (const leak of leaks) {
    console.log(`📍 ${leak.file}:${leak.line}`);
    console.log(`   Pattern: ${leak.description}`);
    console.log(`   Kod: ${leak.content}`);
    console.log('');
  }

  console.log('\n🚫 CI BAŞARISIZ');
  console.log('   Para hesabı sadece çekirdek modüllerde yapılmalı:');
  console.log('   - interest-engine (faiz)');
  console.log('   - fee-engine (masraf/harç)');
  console.log('   - allocation (TBK 100 mahsup)');
  console.log('\n   @see ARCHITECTURE.md - Source of Truth Matrix\n');

  process.exit(1);
}

main();
