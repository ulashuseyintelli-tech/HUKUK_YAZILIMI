/**
 * PR-5b — claim-item.service.update tahsilat guard'ları.
 *   G-A: amount < collectedAmount → 400 (eşitleme/artırma serbest; muhasebe/tahsilat invariant'ı).
 *   G-B: collectedAmount > 0 iken itemType değişemez (TBK100 dağıtım kategorisi bozulmasın).
 *   G-C: status kapsam dışı (dokunulmaz).
 * Mevcut spec deseni: new ClaimItemService(prisma) + minimal mock (fatura-kdv-metadata.spec).
 */

import { ClaimItemService } from '../claim-item.service';

function makeSvc(existing: any) {
  const updated: any[] = [];
  const prisma: any = {
    claimItem: {
      findFirst: jest.fn(async () => existing),
      update: jest.fn(async ({ data }: any) => {
        updated.push(data);
        return data;
      }),
    },
  };
  return { svc: new ClaimItemService(prisma), prisma, updated };
}

describe('ClaimItemService.update — PR-5b tahsilat guard', () => {
  const base = { id: 'i1', tenantId: 't1', amount: 1000, itemType: 'PRINCIPAL' };

  it('G-A: collected>0 + amount tahsil-altı → throw', async () => {
    const { svc } = makeSvc({ ...base, collectedAmount: 500 });
    await expect(svc.update('t1', 'i1', { amount: 300 } as any)).rejects.toThrow(/düşük olamaz/);
  });

  it('G-A: collected>0 + amount eşit/üstü → OK', async () => {
    const { svc, prisma } = makeSvc({ ...base, collectedAmount: 500 });
    await expect(svc.update('t1', 'i1', { amount: 500 } as any)).resolves.toBeDefined();
    await expect(svc.update('t1', 'i1', { amount: 1200 } as any)).resolves.toBeDefined();
    expect(prisma.claimItem.update).toHaveBeenCalled();
  });

  it('G-B: collected>0 + itemType değişimi → throw', async () => {
    const { svc } = makeSvc({ ...base, collectedAmount: 500 });
    await expect(svc.update('t1', 'i1', { itemType: 'EXPENSE' } as any)).rejects.toThrow(/kalem tipi/);
  });

  it('G-B: collected>0 + aynı itemType → OK', async () => {
    const { svc } = makeSvc({ ...base, collectedAmount: 500 });
    await expect(svc.update('t1', 'i1', { itemType: 'PRINCIPAL' } as any)).resolves.toBeDefined();
  });

  it('metadata-only edit (description) + collected>0 → OK', async () => {
    const { svc, updated } = makeSvc({ ...base, collectedAmount: 500 });
    await svc.update('t1', 'i1', { description: 'yeni açıklama' } as any);
    expect(updated[0]).toMatchObject({ description: 'yeni açıklama' });
  });

  it('collected=0 + amount editi → OK (invariant tetiklenmez)', async () => {
    const { svc } = makeSvc({ ...base, collectedAmount: 0 });
    await expect(svc.update('t1', 'i1', { amount: 300 } as any)).resolves.toBeDefined();
  });
});
