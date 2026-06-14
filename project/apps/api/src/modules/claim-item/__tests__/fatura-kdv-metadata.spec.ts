/**
 * D (vergi) K1 — FATURA autoGenerate KDV kalemi metadata.taxParentCategory='PRINCIPAL'.
 */

import { ClaimItemService } from '../claim-item.service';
import { DocumentSourceType } from '../dto/claim-item.dto';

describe('D K1 — FATURA KDV metadata', () => {
  it('fatura KDV kalemi metadata.taxParentCategory=PRINCIPAL ile üretilir', async () => {
    const created: any[] = [];
    const prisma: any = {
      claimItem: { create: jest.fn(async ({ data }: any) => { created.push(data); return data; }) },
    };
    const svc = new ClaimItemService(prisma);

    await svc.autoGenerateFromDocument('t1', {
      documentType: DocumentSourceType.FATURA,
      caseId: 'c1',
      totalAmount: 1180,
      kdvAmount: 180,
      currency: 'TRY',
    } as any);

    const kdv = created.find((i) => i.itemType === 'TAX_KDV');
    expect(kdv).toBeDefined();
    expect(kdv.amount).toBe(180);
    expect(kdv.metadata).toEqual({ taxParentCategory: 'PRINCIPAL' });

    // net anapara da üretildi (KDV hariç)
    const principal = created.find((i) => i.itemType === 'PRINCIPAL');
    expect(principal).toBeDefined();
    expect(principal.amount).toBe(1000);
  });
});
