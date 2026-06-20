/**
 * G1 KÖPRÜSÜ — CaseService.createClaimItemsFromDues() karakterizasyon testi (T2).
 *
 * Dosya açılışında dues'tan kanonik ClaimItem üretimi:
 *  - non-NAFAKA dues → ClaimItem üretir (itemType doğru, tenantId/caseId set)
 *  - NAFAKA → ClaimItem üretMEZ (Due-only takvim)
 *
 * Helper saf olarak tx üzerinde çalışır (mapper + tx.claimItem.create); diğer
 * dependency'lere dokunmaz → stub yeterli.
 */

import { ClaimItemType } from '@prisma/client';
import { CaseService } from '../case.service';
import { DueType } from '../dto/case.dto';

describe('CaseService.createClaimItemsFromDues (G1)', () => {
  const stub = {} as any;
  // RFA-016: constructor 10 dep (… + clientService, lawyerService, debtorService).
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);

  function mockTx() {
    const created: any[] = [];
    const tx = {
      claimItem: {
        create: jest.fn(async ({ data }: any) => {
          created.push(data);
          return data;
        }),
      },
    } as any;
    return { tx, created };
  }

  it('non-NAFAKA persisted dues → markerlı ClaimItem üretir; itemType eşlenir; tenantId/caseId set', async () => {
    const { tx, created } = mockTx();
    const dues = [
      { id: 'due-1', type: DueType.PRINCIPAL, amount: 1000, dueDate: '2026-01-01' },
      { id: 'due-2', type: DueType.INTEREST, amount: 200, dueDate: '2026-01-01' },
      { id: 'due-3', type: DueType.EXPENSE, amount: 50, dueDate: '2026-01-01' },
    ];

    await (service as any).createClaimItemsFromDues(tx, 'tenant-1', 'case-1', dues);

    expect(created).toHaveLength(3);
    expect(created.map((c) => c.itemType)).toEqual([
      ClaimItemType.PRINCIPAL,
      ClaimItemType.INTEREST,
      ClaimItemType.EXPENSE,
    ]);
    expect(created.every((c) => c.tenantId === 'tenant-1')).toBe(true);
    expect(created.every((c) => c.caseId === 'case-1')).toBe(true);
    expect(created[0].demandedAmount).toBe(1000);
    expect(created[0].originalAmount).toBe(1000);
    expect(created[0].metadata).toEqual({
      dueSync: {
        sourceDueId: 'due-1',
        mappedFrom: 'Due',
      },
    });
  });

  it('NAFAKA → ClaimItem üretilmez (Due-only takvim)', async () => {
    const { tx, created } = mockTx();
    const dues = [{ id: 'due-nafaka', type: DueType.NAFAKA, amount: 500, dueDate: '2026-01-01' }];

    await (service as any).createClaimItemsFromDues(tx, 'tenant-1', 'case-1', dues);

    expect(created).toHaveLength(0);
    expect(tx.claimItem.create).not.toHaveBeenCalled();
  });

  it('karışık: NAFAKA atlanır, diğerleri üretilir', async () => {
    const { tx, created } = mockTx();
    const dues = [
      { id: 'due-1', type: DueType.PRINCIPAL, amount: 1000, dueDate: '2026-01-01' },
      { id: 'due-nafaka', type: DueType.NAFAKA, amount: 500, dueDate: '2026-01-01' },
      { id: 'due-2', type: DueType.HARC, amount: 100, dueDate: '2026-01-01' },
    ];

    await (service as any).createClaimItemsFromDues(tx, 'tenant-1', 'case-1', dues);

    expect(created).toHaveLength(2);
    expect(created.map((c) => c.itemType)).toEqual([
      ClaimItemType.PRINCIPAL,
      ClaimItemType.FEE,
    ]);
    expect(created.map((c) => c.metadata?.dueSync?.sourceDueId)).toEqual(['due-1', 'due-2']);
  });
});
