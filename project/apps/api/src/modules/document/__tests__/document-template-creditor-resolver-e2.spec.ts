/**
 * C2-I08 E2 — document-template alacaklı adresi KANONİK resolver'dan (parity kanıtı).
 */
import { DocumentTemplateService } from '../document-template.service';

function build(clientOver: Record<string, unknown>) {
  const caseRecord: any = {
    id: 'case-1', fileNumber: '2026/9', principalAmount: 100, interestRate: 0,
    createdAt: new Date('2026-01-01'), startDate: new Date('2026-01-01'),
    client: {
      name: 'Alacaklı', identityNo: '123',
      address: 'Legacy Cad. 5', city: 'Bursa', district: 'Nilüfer', region: null, postalCode: null,
      ...clientOver,
    },
    debtors: [{ debtor: { name: 'Borçlu', identityNo: '22222222220', addresses: null } }],
    lawyers: [], executionOffice: null, collections: [], dues: [], notes: null,
  };
  const prisma: any = { case: { findFirst: jest.fn().mockResolvedValue(caseRecord) } };
  return { svc: new DocumentTemplateService(prisma), prisma };
}

describe('C2-I08 E2 — document-template creditor address parity', () => {
  it('[1] yapısal satır varsa creditor.address STRUCTURED satırdan üretilir', async () => {
    const { svc } = build({
      addresses: [{ street: 'Yapısal Cad. 12', city: 'İzmir', district: 'Konak', region: null, postalCode: null, isPrimary: true }],
    });
    const vars = await svc.prepareVariablesFromCase('case-1', 't1');
    expect(vars.creditor?.address).toContain('Yapısal Cad. 12');
    expect(vars.creditor?.address).not.toContain('Legacy Cad. 5');
  });

  it('[2] yapısal satır yoksa legacy flat fallback ÇALIŞIR', async () => {
    const { svc } = build({ addresses: [] });
    const vars = await svc.prepareVariablesFromCase('case-1', 't1');
    expect(vars.creditor?.address).toContain('Legacy Cad. 5');
  });

  it('[3] sorgu addresses ilişkisini I01/I03 sözleşmesiyle yükler', async () => {
    const { svc, prisma } = build({ addresses: [] });
    await svc.prepareVariablesFromCase('case-1', 't1');
    const include = prisma.case.findFirst.mock.calls[0][0].include;
    expect(include.client.include.addresses).toEqual({
      where: { isCurrent: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  });
});
