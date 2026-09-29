/**
 * K3-L Faz 2 (owner GO 2026-09-29 §5) — şablon seçimi TAKİP YOLU + BELGE TÜRÜ ile; kalem filtresi/toplamlar; çok borçlu;
 * rol etiketi ve 'Av.' unvanı; üretim kaydı (DocumentArtifact + denetim); istemci verisiyle önizleme TASLAK.
 * Yeniden üretilen kusurlar: (1) DB'deki çek dosyası ilamsız şablona düşüyordu ('CEK' anahtarı CaseType/SubCategory
 * enum'unda yok); (2) iptal/sanal kalemler belgeye giriyor, CHECK_PENALTY satırda var toplamda yoktu; (3) {{debtor.*}}
 * yalnız ilk borçluyu yazıyordu; (4) 'Av.Av.'; (5) hiçbir üretim kaydı yoktu.
 */
import { TemplateEngineService, type TemplateData } from '../template-engine.service';
import {
  computeTemplateTotals,
  normalizeClientTemplateData,
  resolveProceedingKind,
  resolveProceedingKindFromLabels,
} from '../template-case-classification';

const debtor = (name: string, role: string, extra: Record<string, unknown> = {}) => ({
  id: `cd-${name}`,
  role,
  selectedAddress: null,
  debtor: { type: 'INDIVIDUAL', name, displayName: name, tckn: '11111111111', debtorAddresses: [], ...extra },
});

function buildService(caseOverrides: Record<string, unknown> = {}, extra: { instruments?: any[]; artifact?: any; audit?: any } = {}) {
  const caseRecord = {
    id: 'case-1',
    fileNumber: '2026/1',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    type: 'GENERAL_EXECUTION',
    subCategory: 'GENEL',
    executionPath: 'HACIZ',
    hasCollateral: false,
    currency: 'TRY',
    principalAmount: 0,
    executionOffice: null,
    caseClients: [],
    lawyers: [],
    debtors: [debtor('Keşideci Ali', 'KESIDECI')],
    dues: [],
    claimItems: [],
    ...caseOverrides,
  };
  const prisma: any = {
    case: { findFirst: jest.fn(async () => caseRecord) },
    caseInstrument: { findMany: jest.fn(async () => extra.instruments ?? []) },
    caseJudgment: { findFirst: jest.fn(async () => null) },
    caseLease: { findFirst: jest.fn(async () => null) },
    ...(extra.artifact ? { documentArtifact: extra.artifact } : {}),
  };
  const feeEngine: any = { getInterestRate: jest.fn().mockReturnValue(0) };
  const service = new TemplateEngineService(prisma, feeEngine, extra.audit);
  return { service, prisma };
}

describe('takip yolu çözümü (kanonik alanlar → şablon)', () => {
  it.each([
    [{ proceedingType: 'CAMBIO' }, ['CEK'], 'KAMBIYO_CEK'],
    [{ proceedingType: 'CAMBIO' }, ['SENET'], 'KAMBIYO_SENET'],
    [{ proceedingType: 'JUDGMENT_ENFORCEMENT' }, [], 'ILAMLI'],
    [{ proceedingType: 'RENT' }, [], 'KIRA'],
    [{ proceedingType: 'GENERAL_EXECUTION' }, [], 'ILAMSIZ'],
    [{ formType: { procedureType: 'KAMBIYO', isKambiyo: true }, type: 'BOND' }, [], 'KAMBIYO_SENET'],
    [{ formType: { procedureType: 'ILAMLI', hasJudgment: true } }, [], 'ILAMLI'],
    [{ formType: { procedureType: 'KIRA_ALACAK', isRental: true } }, [], 'KIRA'],
    [{ type: 'CHECK' }, [], 'KAMBIYO_CEK'],
    [{ type: 'BOND' }, [], 'KAMBIYO_SENET'],
    [{ type: 'RENTAL' }, [], 'KIRA'],
    [{ type: 'GENERAL_EXECUTION', subCategory: 'NAFAKA', proceedingType: 'JUDGMENT_ENFORCEMENT' }, [], 'NAFAKA'],
    [{ type: 'MORTGAGE' }, [], 'ILAMSIZ'],
  ])('%j + enstrüman %j → %s', (source, instruments, expected) => {
    expect(resolveProceedingKind(source as any, instruments as string[])).toBe(expected);
  });

  it('eski/istemci etiketleri de çözülür; bilinmeyen ILAMSIZ', () => {
    expect(resolveProceedingKindFromLabels('CHECK', 'CEK')).toBe('KAMBIYO_CEK');
    expect(resolveProceedingKindFromLabels('KAMBIYO_SENET', 'GENEL')).toBe('KAMBIYO_SENET');
    expect(resolveProceedingKindFromLabels('ILAMLI', 'ILAMLI_GENEL')).toBe('ILAMLI');
    expect(resolveProceedingKindFromLabels('X', 'Y')).toBe('ILAMSIZ');
  });

  it('DB çek dosyası (type=CHECK, subCategory=GENEL): takip talebi kambiyo çek şablonu, ödeme emri Örnek 10', async () => {
    const { service } = buildService({ type: 'CHECK', subCategory: 'GENEL' }, {
      instruments: [{ id: 'i1', instrumentType: 'CEK', amount: 1000, currency: 'TRY', endorsers: [] }],
    });
    const data = await service.getCaseData('case-1', 't1');
    expect(data.proceedingKind).toBe('KAMBIYO_CEK');
    expect(service.generateTakipTalebi(data).templateCode).toBe('ORNEK_1_KAMBIYO_CEK');
    const odeme = service.generateOdemeEmri(data);
    expect(odeme.templateCode).toBe('ORNEK_7_KAMBIYO');
    expect(odeme.title).toContain('ORNEK 10');
  });

  it('ilamsız genel dosya: Örnek 1 ilamsız / Örnek 7', async () => {
    const { service } = buildService();
    const data = await service.getCaseData('case-1', 't1');
    expect(service.generateTakipTalebi(data).templateCode).toBe('ORNEK_1_ILAMSIZ');
    expect(service.generateOdemeEmri(data)).toMatchObject({ templateCode: 'ORNEK_7_ILAMSIZ', title: 'ODEME EMRI (ORNEK 7)' });
  });
});

describe('alacak kalemleri ve toplamlar', () => {
  it('yalnız ACTIVE + sanal olmayan kalem; kanonik tutar demandedAmount; tazminat toplama girer; satırlar = toplam', async () => {
    const { service } = buildService({
      type: 'CHECK',
      claimItems: [
        { itemType: 'PRINCIPAL', amount: 9000, demandedAmount: 10000, status: 'ACTIVE', isVirtual: false, description: 'Çek Bedeli' },
        { itemType: 'CHECK_PENALTY', amount: 1000, demandedAmount: 1000, status: 'ACTIVE', isVirtual: false, isAllDebtorsLiable: false, liableDebtorIds: ['d-kesideci'] },
        { itemType: 'INTEREST', amount: 500, demandedAmount: 500, status: 'ACTIVE', isVirtual: false },
        { itemType: 'EXPENSE', amount: 200, demandedAmount: 200, status: 'CANCELLED', isVirtual: false },
        { itemType: 'EXPENSE', amount: 300, demandedAmount: 300, status: 'ACTIVE', isVirtual: true },
      ],
    });
    const data = await service.getCaseData('case-1', 't1');
    expect(data.claimItems.map((i) => [i.type, i.amount])).toEqual([['PRINCIPAL', 10000], ['CHECK_PENALTY', 1000], ['INTEREST', 500]]);
    expect(data.claimItems[1]).toMatchObject({ description: 'Çek Tazminatı', isAllDebtorsLiable: false, liableDebtorIds: ['d-kesideci'] });
    expect(data.totals).toEqual({ principal: 10000, interest: 500, fees: 1000, total: 11500, currency: 'TRY' });
    const listed = data.claimItems.reduce((s, i) => s + i.amount, 0);
    expect(listed).toBe(data.totals.total);
  });

  it('computeTemplateTotals: tüm türler üç kovadan birine girer (PRE_INTEREST faiz; vekalet/vergi/diğer fer\'i)', () => {
    const totals = computeTemplateTotals(
      [
        { type: 'PRINCIPAL', amount: 100 },
        { type: 'PRE_INTEREST', amount: 10 },
        { type: 'POST_INTEREST', amount: 5 },
        { type: 'ATTORNEY_FEE', amount: 20 },
        { type: 'TAX_KDV', amount: 3.5 },
        { type: 'OTHER', amount: 1.5 },
      ],
      'TRY',
    );
    expect(totals).toEqual({ principal: 100, interest: 15, fees: 25, total: 140, currency: 'TRY' });
  });

  it('kalem yokken eski davranış: principalAmount tek satır', async () => {
    const { service } = buildService({ principalAmount: 750 });
    const data = await service.getCaseData('case-1', 't1');
    expect(data.claimItems).toHaveLength(1);
    expect(data.totals.total).toBe(750);
  });
});

describe('çok borçlu, rol etiketi, unvan', () => {
  it('ilamsız ödeme emri her borçluyu rolüyle yazar; rol DebtorRole enum etiketi; ham kod basılmaz', async () => {
    const { service } = buildService({
      debtors: [debtor('Keşideci Ali', 'KESIDECI'), debtor('Ciranta Ayşe', 'CIRANTA', { tckn: null, vkn: '1234567890', type: 'COMPANY' })],
      lawyers: [{ hasSignatureAuthority: false, isResponsible: false, lawyer: { name: 'Av. Deniz', surname: 'Yılmaz' } }, { hasSignatureAuthority: true, isResponsible: false, lawyer: { name: 'Ece', surname: 'Kaya' } }],
    });
    const data = await service.getCaseData('case-1', 't1');
    expect(data.debtors.map((d) => d.role)).toEqual(['Keşideci', 'Ciranta']);
    // İmzacı önce; unvan veride yok (şablon tek kez ekler)
    expect(data.lawyers.map((l) => l.name)).toEqual(['Ece Kaya', 'Deniz Yılmaz']);
    const odeme = service.generateOdemeEmri(data).content;
    expect(odeme).toContain('1. Keşideci Ali (Keşideci)');
    expect(odeme).toContain('2. Ciranta Ayşe (Ciranta)');
    expect(odeme).toContain('Vergi No: 1234567890');
    expect(odeme).not.toContain('{{debtor.');
    const takip = service.generateTakipTalebi(data).content;
    expect(takip).toContain('Av.Ece Kaya');
    expect(takip).not.toContain('Av.Av.');
    expect(takip).not.toContain('Av. Av.');
  });

  it('nafaka takip talebi ve ilamlı icra emri de tüm borçluları yazar', async () => {
    const { service } = buildService({ subCategory: 'NAFAKA', debtors: [debtor('Borçlu Bir', 'ASIL_BORCLU'), debtor('Borçlu İki', 'MUSETEREK_BORCLU')] });
    const data = await service.getCaseData('case-1', 't1');
    expect(data.proceedingKind).toBe('NAFAKA');
    const takip = service.generateTakipTalebi(data).content;
    expect(takip).toContain('Borçlu Bir');
    expect(takip).toContain('Borçlu İki');
    const icra = service.generateIcraEmri(data).content;
    expect(icra).toContain('Borçlu İki (Müşterek Borçlu)');
  });
});

describe('üretim kaydı ve istemci önizlemesi', () => {
  it('generateDocumentFromCase: DocumentArtifact (contentHash, dataHash, READY) + DOCUMENT_GENERATED denetimi; tekrar üretim yeni satır AÇMAZ', async () => {
    const artifact = {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({ id: 'art-1', ...data })),
    };
    const audit = { log: jest.fn(async () => undefined) };
    const { service } = buildService({ type: 'CHECK', claimItems: [{ itemType: 'PRINCIPAL', demandedAmount: 100, amount: 100, status: 'ACTIVE', isVirtual: false }] }, { artifact, audit });
    const result = await service.generateDocumentFromCase('case-1', 'XML', 'takip-talebi', 'v1', 't1', 'user-1');
    expect(result.fromCache).toBe(false);
    expect(artifact.create).toHaveBeenCalledTimes(1);
    const data = artifact.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: 't1', caseId: 'case-1', documentType: 'TAKIP_TALEBI', format: 'XML', templateVersion: 'v1', status: 'READY', createdById: 'user-1' });
    expect(data.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(data.dataHash).toMatch(/^[a-f0-9]{16}$/);
    expect(data.filePath).toBeUndefined();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 't1', action: 'DOCUMENT_GENERATED', entityType: 'DocumentArtifact', entityId: 'art-1', userId: 'user-1',
      metadata: expect.objectContaining({ documentType: 'TAKIP_TALEBI', format: 'XML', proceedingKind: 'KAMBIYO_CEK' }),
    }));

    // Aynı veri/şablon: mevcut satır bulunur (önbellek satırı filePath taşımadığından belge yeniden üretilir ama
    // KAYIT güncellenmez/çoğaltılmaz); denetim yine yazılır
    artifact.findFirst.mockResolvedValue({ id: 'art-1' } as any);
    await service.generateDocumentFromCase('case-1', 'XML', 'takip-talebi', 'v1', 't1', 'user-1');
    expect(artifact.create).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledTimes(2);
  });

  it('normalizeClientTemplateData: COMPENSATION→CHECK_PENALTY, toplamlar sunucuda kalemlerden, unvan soyulur, TASLAK', () => {
    const input = {
      claimItems: [
        { type: 'PRINCIPAL', description: 'Çek bedeli', amount: 10000, currency: 'TRY' },
        { type: 'COMPENSATION', description: '', amount: 1000, currency: 'TRY' },
        { type: 'INTEREST', description: 'İşlemiş Faiz', amount: 400, currency: 'TRY' },
      ],
      totals: { principal: 1, interest: 1, fees: 1, total: 3, currency: 'TRY' },
      lawyers: [{ name: 'Av. Deniz Yılmaz' }],
      caseType: 'CEK',
      subCategory: 'CEK',
    };
    const out = normalizeClientTemplateData(input as any);
    expect(out.claimItems[1]).toMatchObject({ type: 'CHECK_PENALTY', description: 'Çek Tazminatı' });
    expect(out.totals).toEqual({ principal: 10000, interest: 400, fees: 1000, total: 11400, currency: 'TRY' });
    expect(out.lawyers[0].name).toBe('Deniz Yılmaz');
    expect(out.proceedingKind).toBe('KAMBIYO_CEK');
    expect(out.isDraft).toBe(true);
  });

  it('istemci yolu normalize edilmiş TASLAK veriyle üretir; dosya-bazlı yol TASLAK değildir', async () => {
    const { service } = buildService();
    const spy = jest.spyOn(service as any, 'generateTakipTalebiWordFormatted').mockResolvedValue(Buffer.from('docx'));
    const base = {
      fileNumber: '2026/1', filingDate: '2026-01-01', executionOffice: { name: 'Ankara', city: 'Ankara' },
      creditors: [{ type: 'INDIVIDUAL', name: 'Alacaklı', address: 'Adres' }], lawyers: [{ name: 'Av. Deniz Yılmaz' }],
      debtors: [{ type: 'INDIVIDUAL', name: 'Borçlu', address: 'A' }],
      claimItems: [{ type: 'PRINCIPAL', description: 'Asıl', amount: 100, currency: 'TRY' }, { type: 'COMPENSATION', description: '', amount: 10, currency: 'TRY' }],
      totals: { principal: 1, interest: 0, fees: 0, total: 1, currency: 'TRY' },
      interestInfo: { type: 'YASAL', description: '', variableRate: true }, caseType: 'CEK', subCategory: 'CEK', executionPath: 'HACIZ',
    } as unknown as TemplateData;
    await service.generateTakipTalebiWord(base);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      isDraft: true,
      proceedingKind: 'KAMBIYO_CEK',
      totals: { principal: 100, interest: 0, fees: 10, total: 110, currency: 'TRY' },
      claimItems: [expect.objectContaining({ type: 'PRINCIPAL' }), expect.objectContaining({ type: 'CHECK_PENALTY', description: 'Çek Tazminatı' })],
      lawyers: [{ name: 'Deniz Yılmaz' }],
    }));
    spy.mockClear();
    await service.generateWordFromCase('case-1', 'takip-talebi', 't1');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).not.toHaveProperty('isDraft');
  });
});
