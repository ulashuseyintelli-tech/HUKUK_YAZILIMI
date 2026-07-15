import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function methodSlice(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('RCV-P2-WS01-P03 static ClaimItem direct-write absence', () => {
  const claimItemService = readFileSync(join(__dirname, '..', 'claim-item.service.ts'), 'utf8');
  const caseService = readFileSync(join(__dirname, '..', '..', 'case', 'case.service.ts'), 'utf8');
  const precautionaryService = readFileSync(
    join(__dirname, '..', '..', 'precautionary-order', 'precautionary-order.service.ts'),
    'utf8',
  );
  const backfillCore = readFileSync(
    join(__dirname, '..', '..', 'case', 'backfill', 'due-to-claimitem-backfill.core.ts'),
    'utf8',
  );

  it('CaseService Due and instrument production paths contain no direct ClaimItem mutation', () => {
    expect(caseService).not.toMatch(/claimItem\.(create|update|delete)\s*\(/);
    expect(caseService).toContain("route: \"DUE_BRIDGE\"");
    expect(caseService).toContain("route: \"CASE_INSTRUMENT_GENERATOR\"");
  });

  it.each([
    ['autoGenerateFromDocument', 'async autoGenerateFromDocument(', 'async calculateInterest('],
    ['generateFromRuleEngine', 'async generateFromRuleEngine(', 'async validateWithRuleEngine('],
  ])('%s contains routed writes and no direct create', (_name, start, end) => {
    const source = methodSlice(claimItemService, start, end);
    expect(source).toContain('createSystemClaimItem');
    expect(source).not.toMatch(/claimItem\.create\s*\(/);
  });

  it('precautionary cost create and P04 retained-tombstone cancel are routed', () => {
    const source = methodSlice(
      precautionaryService,
      'private async createClaimItemFromCost(',
      'private mapCostTypeToClaimItemType(',
    );
    expect(source).toContain("route: 'PRECAUTIONARY_COST_WRITER'");
    expect(source).not.toMatch(/claimItem\.create\s*\(/);
    expect(precautionaryService).toContain('cancelSystemClaimItem');
    expect(precautionaryService).not.toMatch(/claimItem\.delete\s*\(/);
  });

  it('authorized backfill prepares every create through the shared source-integrity guard', () => {
    const source = methodSlice(backfillCore, 'export async function runBackfill(', 'export interface RollbackReport');
    expect(source).toContain('sourceIntegrity.prepareBackfillCreate');
    expect(source.indexOf('sourceIntegrity.prepareBackfillCreate'))
      .toBeLessThan(source.indexOf('tx.claimItem.create'));
    expect(backfillCore).not.toContain("route: 'DUE_BACKFILL'");
  });

  it('P04 generic hard delete is fail-closed and physical delete stays inside verified backfill rollback', () => {
    expect(claimItemService).toContain('assertClaimItemHardDeleteForbidden()');
    expect(claimItemService).not.toMatch(/claimItem\.delete\s*\(/);
    expect(precautionaryService).not.toMatch(/claimItem\.delete\s*\(/);

    const rollbackStart = backfillCore.indexOf('export async function runRollback(');
    expect(rollbackStart).toBeGreaterThanOrEqual(0);
    const rollback = backfillCore.slice(rollbackStart);
    expect(rollback).toContain('assertBackfillRollbackCandidate');
    expect(rollback).toContain('tx.claimItem.delete');
  });
});
