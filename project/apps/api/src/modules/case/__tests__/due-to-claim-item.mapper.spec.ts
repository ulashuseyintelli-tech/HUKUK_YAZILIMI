/**
 * G1 KÖPRÜSÜ — DueType → ClaimItemType mapper birim testi (T1).
 *
 * Hukuki kararlar: tbk100-legal-decisions-ledger R1/R2.
 * EXHAUSTIVE eşleme + silent default yasağı doğrulanır.
 */

import { ClaimItemType } from '@prisma/client';
import { mapDueTypeToClaimItemType, buildClaimItemData } from '../due-to-claim-item.mapper';
import { DueType, DueDto } from '../dto/case.dto';

describe('mapDueTypeToClaimItemType (G1)', () => {
  const expected: Array<[DueType, ClaimItemType | null]> = [
    [DueType.PRINCIPAL, ClaimItemType.PRINCIPAL],
    [DueType.INTEREST, ClaimItemType.INTEREST],
    [DueType.EXPENSE, ClaimItemType.EXPENSE],
    [DueType.VEKALET_UCRETI, ClaimItemType.ATTORNEY_FEE],
    [DueType.HARC, ClaimItemType.FEE],
    [DueType.TAZMINAT, ClaimItemType.PENALTY],
    [DueType.CEZAI_SART, ClaimItemType.CONTRACTUAL_PENALTY],
    [DueType.KIRA, ClaimItemType.PRINCIPAL],
    [DueType.AIDAT, ClaimItemType.PRINCIPAL],
    [DueType.KOMISYON, ClaimItemType.EXPENSE],
    [DueType.PRIM, ClaimItemType.PRINCIPAL],
    [DueType.OTHER, ClaimItemType.OTHER],
    [DueType.NAFAKA, null],
  ];

  it.each(expected)('%s → %s', (dueType, claimItemType) => {
    expect(mapDueTypeToClaimItemType(dueType)).toBe(claimItemType);
  });

  it('tüm DueType değerleri eşlemede tanımlı (exhaustive)', () => {
    for (const dt of Object.values(DueType)) {
      expect(() => mapDueTypeToClaimItemType(dt as DueType)).not.toThrow();
    }
    expect(expected).toHaveLength(Object.values(DueType).length);
  });

  it('NAFAKA → null (Due-only takvim, ClaimItem üretilmez)', () => {
    expect(mapDueTypeToClaimItemType(DueType.NAFAKA)).toBeNull();
  });

  it('bilinmeyen DueType → throw (silent default yasak)', () => {
    expect(() => mapDueTypeToClaimItemType('___UNKNOWN___' as DueType)).toThrow();
  });
});

describe('buildClaimItemData (G1)', () => {
  const due: DueDto = {
    type: DueType.PRINCIPAL,
    description: 'Asıl Alacak',
    amount: 1000,
    dueDate: '2026-01-01',
  };

  it('üç-tutar açılışta eşitlenir + tenantId/caseId/itemType set', () => {
    const data = buildClaimItemData('tenant-1', 'case-1', due, ClaimItemType.PRINCIPAL);
    expect(data.tenantId).toBe('tenant-1');
    expect(data.caseId).toBe('case-1');
    expect(data.itemType).toBe(ClaimItemType.PRINCIPAL);
    expect(data.originalAmount).toBe(1000);
    expect(data.demandedAmount).toBe(1000);
    expect(data.amount).toBe(1000);
    expect(data.currency).toBe('TRY');
    expect(data.description).toBe('Asıl Alacak');
    expect(data.dueDate).toEqual(new Date('2026-01-01'));
  });
});
