import { describe, expect, it } from 'vitest';
import { buildCreateCaseDuesPayload } from '../lib/case-due-payload';

describe('buildCreateCaseDuesPayload', () => {
  it('create-case payload alacak faiz alanlarini dusurmez', () => {
    expect(
      buildCreateCaseDuesPayload([
        {
          type: 'PRINCIPAL',
          description: 'Ana alacak',
          amount: '1000',
          dueDate: '2026-01-01',
          interestType: 'YASAL',
          interestRate: 24,
          interestStartDate: '2026-01-02',
          interestEndDate: '2026-02-02',
          interestAmount: 123.45,
        },
      ]),
    ).toEqual([
      {
        type: 'PRINCIPAL',
        description: 'Ana alacak',
        amount: 1000,
        dueDate: '2026-01-01',
        interestType: 'YASAL',
        interestRate: 24,
        interestStartDate: '2026-01-02',
        interestEndDate: '2026-02-02',
        interestAmount: 123.45,
      },
    ]);
  });

  it('amount bos veya sifirsa kalemi gondermez', () => {
    expect(
      buildCreateCaseDuesPayload([
        { type: 'PRINCIPAL', amount: '', dueDate: '2026-01-01' },
        { type: 'INTEREST', amount: '0', dueDate: '2026-01-01' },
        { type: 'EXPENSE', amount: '50', dueDate: '2026-01-01' },
      ]),
    ).toHaveLength(1);
  });

  it('interestAmount yoksa metadata izi icin guvenli undefined kalir', () => {
    const [payload] = buildCreateCaseDuesPayload([
      {
        type: 'PRINCIPAL',
        amount: '1000',
        dueDate: '2026-01-01',
        interestType: 'YASAL',
      },
    ]);

    expect(payload.interestAmount).toBeUndefined();
  });
});
