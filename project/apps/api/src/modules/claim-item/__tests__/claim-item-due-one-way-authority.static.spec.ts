import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const API_SRC = join(process.cwd(), 'src', 'modules');
const DIRECT_DUE_WRITE = /\.due\.(?:create|update|updateMany|upsert|delete|deleteMany)\s*\(/;
const CASE_SERVICE_REVERSE_WRITE = /(?:this\.)?caseService\.updateDue\s*\(/;

function productionTypeScriptFiles(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const fullPath = join(path, entry);
    if (entry === '__tests__') return [];
    if (statSync(fullPath).isDirectory()) return productionTypeScriptFiles(fullPath);
    return entry.endsWith('.ts') ? [fullPath] : [];
  });
}

describe('VER-05 PR-1B ClaimItem -> Due one-way authority', () => {
  it('forbids Due writes from ClaimItem, ClaimItem approval executor and summary demanded surfaces', () => {
    const files = [
      ...productionTypeScriptFiles(join(API_SRC, 'claim-item')),
      join(API_SRC, 'office-approval', 'office-approval-domain-sync.service.ts'),
      join(API_SRC, 'summary-engine', 'summary-engine.service.ts'),
      join(API_SRC, 'summary-engine', 'summary-engine.controller.ts'),
    ];

    const violations = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      const reasons = [
        DIRECT_DUE_WRITE.test(source) ? 'direct Due write' : null,
        CASE_SERVICE_REVERSE_WRITE.test(source) ? 'CaseService.updateDue call' : null,
      ].filter(Boolean);
      return reasons.map((reason) => `${file}: ${reason}`);
    });

    expect(violations).toEqual([]);
  });
});
