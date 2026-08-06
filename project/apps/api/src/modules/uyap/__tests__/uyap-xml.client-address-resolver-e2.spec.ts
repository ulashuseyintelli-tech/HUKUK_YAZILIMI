/**
 * C2-I08 E2 — uyap-xml alacaklı adresi KANONİK resolver'dan (parity kanıtı).
 * Yapısal ClientAddress (isCurrent=true, primary önce) varsa O kazanır; yoksa
 * legacy flat'a açıkça düşer; ikisi de yoksa adres bloğu üretilmez.
 */
import { UyapXmlService } from '../uyap-xml.service';

const baseClient = {
  id: 'cl1', type: 'INDIVIDUAL', tckn: '11111111110', firstName: 'Ali', lastName: 'Vural',
  displayName: 'Ali Vural', phone: null, email: null, iban: null,
  address: 'Legacy Cad. 3', city: 'Ankara', district: 'Çankaya', region: null, postalCode: null,
};

function build(clientOver: Record<string, unknown>) {
  const caseRecord = {
    id: 'case-1', tenantId: 't1', fileNumber: '2026/7', executionOffice: null,
    caseClients: [{ client: { ...baseClient, ...clientOver } }],
    lawyers: [],
    debtors: [{ debtor: { id: 'd1', type: 'INDIVIDUAL', name: 'Borçlu', tckn: '22222222220', debtorAddresses: [] } }],
    claims: [], dues: [],
  };
  const prisma: any = { case: { findFirst: jest.fn().mockResolvedValue(caseRecord) } };
  return { svc: new UyapXmlService(prisma), prisma };
}

describe('C2-I08 E2 — uyap-xml creditor address parity', () => {
  it('[1] yapısal satır varsa tamAdres STRUCTURED satırdan üretilir (flat kazanamaz)', async () => {
    const { svc } = build({
      addresses: [{ street: 'Yapısal Sok. 9', city: 'İzmir', district: 'Konak', region: null, postalCode: null, isPrimary: true }],
    });
    const xml = await svc.generateFromCase('case-1', 't1');
    expect(xml).toContain('Yapısal Sok. 9');
    expect(xml).not.toContain('Legacy Cad. 3');
  });

  it('[2] yapısal satır yoksa legacy flat fallback ÇALIŞIR (mevcut semantik korunur)', async () => {
    const { svc } = build({ addresses: [] });
    const xml = await svc.generateFromCase('case-1', 't1');
    expect(xml).toContain('Legacy Cad. 3');
  });

  it('[3] sorgu addresses ilişkisini I01/I03 sözleşmesiyle yükler (isCurrent + sıralama)', async () => {
    const { svc, prisma } = build({ addresses: [] });
    await svc.generateFromCase('case-1', 't1');
    const include = prisma.case.findFirst.mock.calls[0][0].include;
    expect(include.caseClients.include.client.include.addresses).toEqual({
      where: { isCurrent: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  });
});
