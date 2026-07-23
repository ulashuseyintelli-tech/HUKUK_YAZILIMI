import * as fs from 'node:fs';
import * as path from 'node:path';

const API_ROOT = path.resolve(__dirname, '../../../..');
const FINALIZER = path.join(
  API_ROOT,
  'src/modules/claim-item/formation-finalizer/transactional-claim-item-formation-finalizer.service.ts',
);

function productionTypeScriptFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'test' || entry.name === 'node_modules') return [];
      return productionTypeScriptFiles(full);
    }
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [full]
      : [];
  });
}

describe('RCV-CLAIM-FORM-P02-S08-I03 dormant finalizer boundary', () => {
  const source = fs.readFileSync(FINALIZER, 'utf8');

  it('keeps the transaction boundary and every authoritative write together', () => {
    expect(source).toContain('this.prisma.$transaction');
    expect(source).toContain('claimItem.create');
    expect(source).toContain('claimFormationSnapshot.create');
    expect(source).toContain('officeApprovalRequest.updateMany');
    expect(source).toContain('appendClaimItemContinuity');
    expect(source).toContain('audit.logInTransaction');
    expect(source).toContain('pg_advisory_xact_lock');
  });

  it('contains no current/latest fallback, production provider or route wiring', () => {
    expect(source).not.toMatch(/\bcurrent\b|\blatest\b/i);
    expect(source).not.toContain('@Injectable');
    expect(source).not.toContain('@Controller');

    const moduleSource = fs.readFileSync(
      path.join(API_ROOT, 'src/modules/claim-item/claim-item.module.ts'),
      'utf8',
    );
    expect(moduleSource).not.toContain('TransactionalClaimItemFormationFinalizerService');

    const importers = productionTypeScriptFiles(path.join(API_ROOT, 'src'))
      .filter((file) => path.resolve(file) !== path.resolve(FINALIZER))
      .filter((file) =>
        fs.readFileSync(file, 'utf8').includes('TransactionalClaimItemFormationFinalizerService'),
      )
      .map((file) => path.relative(API_ROOT, file));
    expect(importers).toEqual([]);
  });

  it('does not mutate the immutable intent or enable APPROVED_WITH_CHANGES', () => {
    expect(source).not.toMatch(/claimItemFormationIntent\.(?:update|updateMany|delete|deleteMany)/);
    expect(source).not.toContain('APPROVED_WITH_CHANGES');
    expect(source).not.toMatch(/\bupsert\s*\(/);
  });
});
