import { readFileSync } from 'fs';
import { resolve } from 'path';

function source(relativePath: string): string {
  return readFileSync(resolve(__dirname, '..', '..', relativePath), 'utf8');
}

function methodSlice(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
}

describe('RCV-P2-WS03-P01 production receipt routing static guard', () => {
  it('bilinen production receipt ingress yüzeyleri canonical Collection create kullanır', () => {
    const callers = [
      ['bank/bank.service.ts', 'async matchTransaction(', '// ==================== OTOMATİK EŞLEŞTİRME'],
      ['debtor/third-party.service.ts', 'async addExternalCaseCollection(', 'async deleteExternalCase('],
      ['case/case.service.ts', 'async createCollection(', '/// <remarks>'],
    ] as const;

    for (const [path, start, end] of callers) {
      const method = methodSlice(source(path), start, end);
      expect(method).toContain('collectionService.create');
      expect(method).not.toMatch(/ledgerEntry\.(create|update|upsert)/);
      expect(method).not.toMatch(/ledgerAllocation\.(create|update|upsert)/);
      expect(method).not.toMatch(/claimItem\.(create|update|upsert)/);
    }
  });

  it('legacy Summary payment endpoint secondary transaction açmadan fail-closed kalır', () => {
    const method = methodSlice(
      source('summary-engine/summary-engine.service.ts'),
      'async recordPayment(',
      'async allocatePaymentToLedgerInTx(',
    );

    expect(method).toContain('SECONDARY_ALLOCATION_PATH_CLOSED');
    expect(method).not.toMatch(/\.\$transaction\s*\(/);
    expect(method).not.toMatch(/ledgerEntry\.(create|update|upsert)/);
    expect(method).not.toMatch(/claimItem\.(create|update|upsert)/);
  });

  it('bank auto-match Collection oluşmadan receipt eşleşmesi persist etmez', () => {
    const method = methodSlice(
      source('bank/bank.service.ts'),
      'private async tryAutoMatch(',
      '// ==================== TRANSFER',
    );

    expect(method).not.toContain('bankTransaction.update');
    expect(method).not.toContain('isMatched: true');
  });

  it('external receipt projection canonical Collection create sonrasında yazılır', () => {
    const method = methodSlice(
      source('debtor/third-party.service.ts'),
      'async addExternalCaseCollection(',
      'async deleteExternalCase(',
    );

    expect(method.indexOf('collectionService.create')).toBeGreaterThanOrEqual(0);
    expect(method.indexOf('externalCase.update')).toBeGreaterThan(method.indexOf('collectionService.create'));
    expect(method).not.toContain('syncToMainCase !== false');
  });
});
