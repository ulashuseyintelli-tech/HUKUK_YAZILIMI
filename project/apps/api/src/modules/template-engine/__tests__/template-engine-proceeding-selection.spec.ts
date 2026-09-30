/**
 * K3-L Faz 2a (owner GO 2026-09-29 §5 + owner kararı 2026-09-30) — şablon seçimi AÇIKÇA SEÇİLMİŞ takip yolu + belge
 * türüne dayanır; "çek dosyası → kambiyo" OTOMATİK VARSAYIMI YOKTUR. Ayrıca: kalem filtresi/toplamlar; çok borçlu;
 * rol etiketi ve 'Av.' unvanı; üretim kaydı (DocumentArtifact + denetim); istemci verisiyle önizleme TASLAK.
 *
 * Sentetik testlerdir: şablon biçimi gerçek örnek belge / UYAP şemasıyla DOĞRULANMADI; adliye/UYAP kabulü iddiası yok.
 */
import { BadRequestException } from '@nestjs/common';
import { TemplateEngineService, type TemplateData } from '../template-engine.service';
import {
  computeTemplateTotals,
  formatLawyerTitled,
  isTemplateEligibleClaimItem,
  normalizeClientTemplateData,
  resolveProceedingSelection,
  resolveProceedingSelectionFromLabels,
  stripLawyerTitle,
} from '../template-case-classification';

const debtor = (name: string, role: string, extra: Record<string, unknown> = {}) => ({
  id: `cd-${name}`,
  role,
  selectedAddress: null,
  debtor: { type: 'INDIVIDUAL', name, displayName: name, tckn: '11111111111', debtorAddresses: [], ...extra },
});

const CEK_INSTRUMENT = { id: 'i1', instrumentType: 'CEK', amount: 1000, currency: 'TRY', endorsers: [] };

function buildService(
  caseOverrides: Record<string, unknown> = {},
  extra: { instruments?: any[]; artifact?: any; audit?: any; formTypes?: Record<string, any> } = {},
) {
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
    formType: { findUnique: jest.fn(async ({ where }: any) => extra.formTypes?.[where.code] ?? null) },
    ...(extra.artifact ? { documentArtifact: extra.artifact } : {}),
  };
  const feeEngine: any = { getInterestRate: jest.fn().mockReturnValue(0) };
  const service = new TemplateEngineService(prisma, feeEngine, extra.audit);
  jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
  const getCaseData = (): Promise<TemplateData> => (service as any).getCaseData('case-1', 't1');
  return { service, prisma, getCaseData };
}

describe('takip yolu seçimi — yalnız AÇIK seçimden (owner kararı 2026-09-30)', () => {
  it.each([
    // [kaynak, enstrümanlar, beklenen tür, dayanak]
    [{ proceedingType: 'CAMBIO' }, ['CEK'], 'KAMBIYO_CEK', 'PROCEEDING_TYPE'],
    [{ proceedingType: 'CAMBIO' }, ['BONO'], 'KAMBIYO_SENET', 'PROCEEDING_TYPE'],
    [{ proceedingType: 'CAMBIO', type: 'CHECK' }, [], 'KAMBIYO_CEK', 'PROCEEDING_TYPE'],
    [{ proceedingType: 'JUDGMENT_ENFORCEMENT' }, [], 'ILAMLI', 'PROCEEDING_TYPE'],
    [{ proceedingType: 'JUDGMENT_ENFORCEMENT', subCategory: 'NAFAKA' }, [], 'NAFAKA', 'PROCEEDING_TYPE'],
    [{ proceedingType: 'RENT' }, [], 'KIRA', 'PROCEEDING_TYPE'],
    [{ proceedingType: 'GENERAL_EXECUTION', type: 'CHECK' }, ['CEK'], 'ILAMSIZ', 'PROCEEDING_TYPE'],
    [{ takipTuruCode: 'KAMBIYO_CEK' }, [], 'KAMBIYO_CEK', 'TAKIP_TURU'],
    [{ takipTuruCode: 'KAMBIYO_SENET' }, [], 'KAMBIYO_SENET', 'TAKIP_TURU'],
    [{ takipTuruCode: 'ILAMSIZ_GENEL', type: 'CHECK' }, ['CEK'], 'ILAMSIZ', 'TAKIP_TURU'],
    [{ takipTuruCode: 'ILAMLI' }, [], 'ILAMLI', 'TAKIP_TURU'],
    [{ takipTuruCode: 'NAFAKA' }, [], 'NAFAKA', 'TAKIP_TURU'],
    [{ takipTuruCode: 'ILAMSIZ_KIRA' }, [], 'KIRA', 'TAKIP_TURU'],
    [{ formType: { procedureType: 'KAMBIYO', isKambiyo: true }, type: 'BOND' }, [], 'KAMBIYO_SENET', 'FORM_TYPE'],
    [{ formType: { procedureType: 'ILAMSIZ' }, type: 'CHECK' }, ['CEK'], 'ILAMSIZ', 'FORM_TYPE'],
    [{ formType: { procedureType: 'ILAMLI', hasJudgment: true } }, [], 'ILAMLI', 'FORM_TYPE'],
    [{ subType: 'KAMBIYO' }, ['CEK'], 'KAMBIYO_CEK', 'SUB_TYPE_LABEL'],
    [{ subCategory: 'NAFAKA' }, [], 'NAFAKA', 'LEGACY_SUBCATEGORY'],
    [{ subCategory: 'KIRA' }, [], 'KIRA', 'LEGACY_SUBCATEGORY'],
  ])('%j + enstrüman %j → %s (%s)', (source, instruments, kind, basis) => {
    const selection = resolveProceedingSelection(source as any, instruments as string[]);
    expect(selection).toMatchObject({ kind, basis, explicit: true });
  });

  it.each([
    [{ type: 'CHECK' }, ['CEK']],
    [{ type: 'CHECK' }, []],
    [{ type: 'BOND' }, ['SENET']],
    [{ type: 'GENERAL_EXECUTION' }, ['CEK']],
  ])('AÇIK SEÇİM YOK: %j + enstrüman %j → kambiyo SEÇİLMEZ; ilamsız + explicit=false + uyarı', (source, instruments) => {
    const selection = resolveProceedingSelection(source as any, instruments as string[]);
    expect(selection).toEqual({
      kind: 'ILAMSIZ',
      basis: 'NOT_SELECTED',
      explicit: false,
      warnings: ['TAKIP_YOLU_ACIKCA_SECILMEMIS', 'KAMBIYO_SENEDI_VAR_TAKIP_YOLU_SECILMEDI'],
    });
  });

  it('açık seçim yok ve kambiyo senedi de yok → yalnız "seçilmemiş" uyarısı', () => {
    expect(resolveProceedingSelection({ type: 'GENERAL_EXECUTION' }, [])).toEqual({
      kind: 'ILAMSIZ', basis: 'NOT_SELECTED', explicit: false, warnings: ['TAKIP_YOLU_ACIKCA_SECILMEMIS'],
    });
  });

  it('kambiyo açıkça seçilmiş ama belge türü belirsiz / karışık → şablon TAHMİN EDİLMEZ', () => {
    expect(resolveProceedingSelection({ proceedingType: 'CAMBIO' }, [])).toMatchObject({
      kind: 'KAMBIYO_BELGE_TURU_BELIRSIZ', explicit: true, warnings: ['KAMBIYO_BELGE_TURU_BELIRSIZ'],
    });
    expect(resolveProceedingSelection({ formType: { isKambiyo: true } }, ['CEK', 'SENET'])).toMatchObject({
      kind: 'KAMBIYO_BELGE_TURU_BELIRSIZ', warnings: ['KAMBIYO_BELGE_TURU_KARISIK'],
    });
  });

  it('özel şablonu olmayan açık seçim (rehin/ipotek/iflas) → önceki davranış ilamsız, uyarıyla', () => {
    expect(resolveProceedingSelection({ takipTuruCode: 'REHIN_TASINMAZ' }, [])).toEqual({
      kind: 'ILAMSIZ', basis: 'TAKIP_TURU', explicit: true, warnings: ['TAKIP_YOLU_ICIN_OZEL_SABLON_YOK'],
    });
    expect(resolveProceedingSelection({ takipTuruCode: 'IFLAS_KAMBIYO', type: 'CHECK' }, ['CEK']).kind).toBe('ILAMSIZ');
  });

  it('haciz yolu DIŞINDA seçilmiş yol (iflas / rehin / ipotek, FORM_12): haciz kambiyo şablonu (Örnek 10) SEÇİLMEZ', () => {
    expect(resolveProceedingSelection({ takipTuruCode: 'KAMBIYO_CEK', executionPath: 'IFLAS' }, ['CEK'])).toEqual({
      kind: 'ILAMSIZ', basis: 'TAKIP_TURU', explicit: true, warnings: ['TAKIP_YOLU_ICIN_OZEL_SABLON_YOK'],
    });
    expect(
      resolveProceedingSelection({ formType: { code: 'FORM_12', procedureType: 'KAMBIYO', isKambiyo: true }, type: 'CHECK' }, ['CEK']),
    ).toMatchObject({ kind: 'ILAMSIZ', basis: 'FORM_TYPE', warnings: ['TAKIP_YOLU_ICIN_OZEL_SABLON_YOK'] });
    expect(resolveProceedingSelection({ subType: 'FORM_12', formType: { procedureType: 'KAMBIYO', isKambiyo: true } }, ['SENET']).kind).toBe('ILAMSIZ');
    expect(resolveProceedingSelection({ proceedingType: 'CAMBIO', executionPath: 'REHIN' }, []).kind).toBe('ILAMSIZ');
    // haciz yolu: kambiyo seçimi korunur; nafaka / ilamlı seçimine yol dokunmaz
    expect(resolveProceedingSelection({ takipTuruCode: 'KAMBIYO_CEK', executionPath: 'HACIZ' }, []).kind).toBe('KAMBIYO_CEK');
    expect(resolveProceedingSelection({ takipTuruCode: 'ILAMLI', executionPath: 'IFLAS' }, []).kind).toBe('ILAMLI');
  });

  it('istemci etiketleri: kalem/belge türü etiketi tek başına kambiyo seçtirmez; form kategorisi KAMBIYO seçtirir', () => {
    expect(resolveProceedingSelectionFromLabels('GENEL_ICRA', 'CEK')).toMatchObject({ kind: 'ILAMSIZ', explicit: true, basis: 'CLIENT_LABEL' });
    expect(resolveProceedingSelectionFromLabels('CHECK', 'CEK')).toMatchObject({ kind: 'ILAMSIZ', explicit: false, basis: 'NOT_SELECTED' });
    expect(resolveProceedingSelectionFromLabels(undefined, 'SENET')).toMatchObject({ kind: 'ILAMSIZ', explicit: false });
    expect(resolveProceedingSelectionFromLabels('KAMBIYO', 'CEK')).toMatchObject({ kind: 'KAMBIYO_CEK', explicit: true });
    expect(resolveProceedingSelectionFromLabels('KAMBIYO', 'SENET')).toMatchObject({ kind: 'KAMBIYO_SENET', explicit: true });
    expect(resolveProceedingSelectionFromLabels('X', 'KAMBIYO_CEK')).toMatchObject({ kind: 'KAMBIYO_CEK', explicit: true });
    expect(resolveProceedingSelectionFromLabels('ILAMLI', 'ILAMLI_GENEL').kind).toBe('ILAMLI');
    expect(resolveProceedingSelectionFromLabels('GENEL_ICRA', 'KIRA').kind).toBe('KIRA');
    expect(resolveProceedingSelectionFromLabels('X', 'Y')).toMatchObject({ kind: 'ILAMSIZ', explicit: false });
  });

  it('DB çek dosyası, takip yolu SEÇİLMEMİŞ: ilamsız şablon + Örnek 7; seçim açık değil diye işaretlenir (kambiyo varsayılmaz)', async () => {
    const { service, getCaseData } = buildService({ type: 'CHECK', subCategory: 'GENEL' }, { instruments: [CEK_INSTRUMENT] });
    const data = await getCaseData();
    expect(data.proceedingSelection).toMatchObject({ kind: 'ILAMSIZ', basis: 'NOT_SELECTED', explicit: false });
    // Kambiyo senedi kaydı yine yüklenir (madde 8 metni); yükleme takip yolu seçimi değildir
    expect(data.instrumentInfos).toHaveLength(1);
    const takip = service.generateTakipTalebi(data);
    expect(takip.templateCode).toBe('ORNEK_1_ILAMSIZ');
    expect(takip.selection).toMatchObject({ explicit: false });
    expect(service.generateOdemeEmri(data)).toMatchObject({ templateCode: 'ORNEK_7_ILAMSIZ', title: 'ODEME EMRI (ORNEK 7)' });
  });

  it('DB çek dosyası, takip türü AÇIKÇA "Kambiyo - Çek": kambiyo takip talebi + kambiyo ödeme emri', async () => {
    const { service, getCaseData } = buildService(
      { type: 'CHECK', subCategory: 'GENEL', takipTuru: { code: 'KAMBIYO_CEK' } },
      { instruments: [CEK_INSTRUMENT] },
    );
    const data = await getCaseData();
    expect(data.proceedingSelection).toEqual({ kind: 'KAMBIYO_CEK', basis: 'TAKIP_TURU', explicit: true, warnings: [] });
    expect(service.generateTakipTalebi(data).templateCode).toBe('ORNEK_1_KAMBIYO_CEK');
    const odeme = service.generateOdemeEmri(data);
    expect(odeme.templateCode).toBe('ORNEK_7_KAMBIYO');
    expect(odeme.title).toContain('ORNEK 10');
  });

  it('DB çek dosyası, takip türü AÇIKÇA "İlamsız Genel Haciz": çek olsa da ilamsız (alacaklının seçimi)', async () => {
    const { service, getCaseData } = buildService(
      { type: 'CHECK', takipTuru: { code: 'ILAMSIZ_GENEL' } },
      { instruments: [CEK_INSTRUMENT] },
    );
    const data = await getCaseData();
    expect(data.proceedingSelection).toMatchObject({ kind: 'ILAMSIZ', basis: 'TAKIP_TURU', explicit: true, warnings: [] });
    expect(service.generateOdemeEmri(data).templateCode).toBe('ORNEK_7_ILAMSIZ');
  });

  it('seçilen form Case.subType form kodundan çözülür (sihirbaz form kodunu subType\'a yazar)', async () => {
    const { service, prisma, getCaseData } = buildService(
      { type: 'CHECK', subType: 'FORM_10' },
      { instruments: [CEK_INSTRUMENT], formTypes: { FORM_10: { code: 'FORM_10', procedureType: 'KAMBIYO', isKambiyo: true } } },
    );
    const data = await getCaseData();
    expect(prisma.formType.findUnique).toHaveBeenCalledWith({ where: { code: 'FORM_10' } });
    expect(data.proceedingSelection).toMatchObject({ kind: 'KAMBIYO_CEK', basis: 'FORM_TYPE', explicit: true });
    expect(service.generateOdemeEmri(data).templateCode).toBe('ORNEK_7_KAMBIYO');
  });

  it('kambiyo açıkça seçili ama belge türü belirsiz: takip talebi açık hata verir (şablon tahmin edilmez)', async () => {
    const { service, getCaseData } = buildService({ proceedingType: 'CAMBIO' });
    const data = await getCaseData();
    expect(data.proceedingKind).toBe('KAMBIYO_BELGE_TURU_BELIRSIZ');
    expect(() => service.generateTakipTalebi(data)).toThrow(BadRequestException);
    try {
      service.generateTakipTalebi(data);
    } catch (err) {
      expect((err as BadRequestException).getResponse()).toMatchObject({ code: 'BELGE_TURU_BELIRSIZ' });
    }
  });

  it('ilamsız genel dosya (açık seçim yok): Örnek 1 ilamsız / Örnek 7 — önceki davranış', async () => {
    const { service, getCaseData } = buildService();
    const data = await getCaseData();
    expect(service.generateTakipTalebi(data).templateCode).toBe('ORNEK_1_ILAMSIZ');
    expect(service.generateOdemeEmri(data)).toMatchObject({ templateCode: 'ORNEK_7_ILAMSIZ', title: 'ODEME EMRI (ORNEK 7)' });
  });
});

describe('alacak kalemleri ve toplamlar', () => {
  it('yalnız ACTIVE + sanal olmayan kalem; kanonik tutar demandedAmount; tazminat toplama girer; satırlar = toplam', async () => {
    const { getCaseData } = buildService({
      type: 'CHECK',
      claimItems: [
        { itemType: 'PRINCIPAL', amount: 9000, demandedAmount: 10000, status: 'ACTIVE', isVirtual: false, description: 'Çek Bedeli' },
        { itemType: 'CHECK_PENALTY', amount: 1000, demandedAmount: 1000, status: 'ACTIVE', isVirtual: false, isAllDebtorsLiable: false, liableDebtorIds: ['d-kesideci'] },
        { itemType: 'INTEREST', amount: 500, demandedAmount: 500, status: 'ACTIVE', isVirtual: false },
        { itemType: 'EXPENSE', amount: 200, demandedAmount: 200, status: 'CANCELLED', isVirtual: false },
        { itemType: 'EXPENSE', amount: 300, demandedAmount: 300, status: 'ACTIVE', isVirtual: true },
      ],
    });
    const data = await getCaseData();
    expect(data.claimItems.map((i) => [i.type, i.amount])).toEqual([['PRINCIPAL', 10000], ['CHECK_PENALTY', 1000], ['INTEREST', 500]]);
    expect(data.claimItems[1]).toMatchObject({ description: 'Çek Tazminatı' });
    // İç (ofis) sorumluluk / durum alanları DIŞ belge verisine taşınmaz (UDF/XML ve hash'e sızmaz)
    for (const item of data.claimItems) {
      expect(item).not.toHaveProperty('liableDebtorIds');
      expect(item).not.toHaveProperty('isAllDebtorsLiable');
      expect(item).not.toHaveProperty('status');
    }
    expect(data.totals).toEqual({ principal: 10000, interest: 500, fees: 1000, total: 11500, currency: 'TRY' });
    const listed = data.claimItems.reduce((s, i) => s + i.amount, 0);
    expect(listed).toBe(data.totals.total);
  });

  it('talep edilen kalem: tahsil edilmiş (COLLECTED) kalem talep tutarıyla KALIR; iptal / feragat / sanal çıkar', async () => {
    expect(isTemplateEligibleClaimItem({ status: 'ACTIVE' })).toBe(true);
    expect(isTemplateEligibleClaimItem({ status: 'COLLECTED' })).toBe(true);
    expect(isTemplateEligibleClaimItem({ status: 'CANCELLED' })).toBe(false);
    expect(isTemplateEligibleClaimItem({ status: 'WAIVED' })).toBe(false);
    expect(isTemplateEligibleClaimItem({ status: 'ACTIVE', isVirtual: true })).toBe(false);
    expect(isTemplateEligibleClaimItem({})).toBe(true);
    const { getCaseData } = buildService({
      claimItems: [
        { itemType: 'PRINCIPAL', amount: 0, demandedAmount: 10000, collectedAmount: 10000, status: 'COLLECTED', isVirtual: false },
        { itemType: 'EXPENSE', amount: 250, demandedAmount: 250, status: 'WAIVED', isVirtual: false },
      ],
    });
    const data = await getCaseData();
    expect(data.claimItems.map((i) => [i.type, i.amount])).toEqual([['PRINCIPAL', 10000]]);
    expect(data.totals.total).toBe(10000);
  });

  it('kalem, eski alacak ve taraf sorguları kararlı sırayla okunur (belge satır sırası ve veri hash\'i kararlı)', async () => {
    const { prisma, getCaseData } = buildService();
    await getCaseData();
    const include = (prisma.case.findFirst.mock.calls[0] as any[])[0].include;
    expect(include.claimItems).toEqual({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
    expect(include.dues).toEqual({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    expect(include.caseClients.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
    expect(include.debtors.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
    expect(include.lawyers.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
    expect(include.takipTuru).toEqual({ select: { code: true } });
  });

  it('eski Due türleri (nafaka / kira / aidat) asıl alacak kovasına girer ve kendi etiketini alır', async () => {
    const { getCaseData } = buildService({ subCategory: 'NAFAKA', dues: [{ type: 'NAFAKA', amount: 3000 }, { type: 'HARC', amount: 100 }] });
    const data = await getCaseData();
    expect(data.claimItems.map((i) => [i.type, i.description, i.amount])).toEqual([
      ['NAFAKA', 'Nafaka', 3000],
      ['HARC', 'Harç', 100],
    ]);
    expect(data.totals).toEqual({ principal: 3000, interest: 0, fees: 100, total: 3100, currency: 'TRY' });
  });

  it('borçlu sorumluluğu belgede borçlu başına FARKLI TUTAR üretmez: toplam dosya düzeyinde tektir', async () => {
    const { service, getCaseData } = buildService({
      debtors: [debtor('Keşideci Ali', 'KESIDECI'), debtor('Ciranta Ayşe', 'CIRANTA')],
      claimItems: [
        { itemType: 'PRINCIPAL', amount: 10000, demandedAmount: 10000, status: 'ACTIVE', isVirtual: false },
        { itemType: 'CHECK_PENALTY', amount: 1000, demandedAmount: 1000, status: 'ACTIVE', isVirtual: false, isAllDebtorsLiable: false, liableDebtorIds: ['d-kesideci'] },
      ],
    });
    const data = await getCaseData();
    expect(data.totals.total).toBe(11000);
    const odeme = service.generateOdemeEmri(data);
    // Tek belge, iki borçlu, tek toplam; borçlu başına ayrı belge/tutar yok
    expect(odeme.content).toContain('1. Keşideci Ali');
    expect(odeme.content).toContain('2. Ciranta Ayşe');
    expect((odeme.content.match(/ODEME EMRI/g) ?? []).length).toBe(1);
  });

  it('dosyada ClaimItem var ama hiçbiri uygun değilse eski Due kayıtlarına DÜŞÜLMEZ (iptal edilen alacak geri gelmez)', async () => {
    const { getCaseData } = buildService({
      principalAmount: 5000,
      dues: [{ type: 'PRINCIPAL', amount: 5000, description: 'Eski due' }],
      claimItems: [{ itemType: 'PRINCIPAL', amount: 5000, demandedAmount: 5000, status: 'CANCELLED', isVirtual: false }],
    });
    const data = await getCaseData();
    expect(data.claimItems).toEqual([]);
    expect(data.totals.total).toBe(0);
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

  it('dosyada hiç ClaimItem yokken eski davranış: Due, o da yoksa principalAmount tek satır', async () => {
    const onlyPrincipal = buildService({ principalAmount: 750 });
    const a = await onlyPrincipal.getCaseData();
    expect(a.claimItems).toHaveLength(1);
    expect(a.totals.total).toBe(750);
    const withDue = buildService({ dues: [{ type: 'PRINCIPAL', amount: 400, description: 'Asıl' }] });
    const b = await withDue.getCaseData();
    expect(b.totals.total).toBe(400);
  });
});

describe('çok borçlu, rol etiketi, unvan', () => {
  it('ilamsız ödeme emri her borçluyu rolüyle yazar; rol DebtorRole enum etiketi; ham kod basılmaz', async () => {
    const { service, getCaseData } = buildService({
      debtors: [debtor('Keşideci Ali', 'KESIDECI'), debtor('Ciranta Ayşe', 'CIRANTA', { tckn: null, vkn: '1234567890', type: 'COMPANY' })],
      lawyers: [
        { hasSignatureAuthority: false, isResponsible: false, lawyer: { name: 'Av. Deniz', surname: 'Yılmaz' } },
        { hasSignatureAuthority: true, isResponsible: false, lawyer: { name: 'Ece', surname: 'Kaya' } },
      ],
    });
    const data = await getCaseData();
    expect(data.debtors.map((d) => d.role)).toEqual(['Keşideci', 'Ciranta']);
    // İmzacı önce; veri önceki biçimde (Av.Ad Soyad) ve kayıttaki unvan ikilenmez
    expect(data.lawyers.map((l) => l.name)).toEqual(['Av.Ece Kaya', 'Av.Deniz Yılmaz']);
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

  it('unvan: yalnız ayrık "Av." / "Av " / "Avukat " soyulur; "Avni", "Avşar", "Ava" gibi adlara dokunulmaz; tek unvan üretilir', () => {
    expect(stripLawyerTitle('Av. Deniz Yılmaz')).toBe('Deniz Yılmaz');
    expect(stripLawyerTitle('av.Deniz Yılmaz')).toBe('Deniz Yılmaz');
    expect(stripLawyerTitle('AV Deniz Yılmaz')).toBe('Deniz Yılmaz');
    expect(stripLawyerTitle('Avukat Deniz Yılmaz')).toBe('Deniz Yılmaz');
    expect(stripLawyerTitle('Avni Kaya')).toBe('Avni Kaya');
    expect(stripLawyerTitle('AVŞAR Demir')).toBe('AVŞAR Demir');
    expect(stripLawyerTitle('Ava Yıldız')).toBe('Ava Yıldız');
    expect(formatLawyerTitled('Av.Deniz Yılmaz')).toBe('Av.Deniz Yılmaz');
    expect(formatLawyerTitled('Deniz Yılmaz', ' ')).toBe('Av. Deniz Yılmaz');
    expect(formatLawyerTitled('Avni Kaya')).toBe('Av.Avni Kaya');
    expect(formatLawyerTitled('')).toBe('');
  });

  it('unvanı veriden bekleyen yerler (imza satırı) ve kendisi ekleyen yerler (vekil satırı) tek unvan basar', async () => {
    const { service, getCaseData } = buildService({
      lawyers: [{ hasSignatureAuthority: true, isResponsible: true, lawyer: { name: 'Avni', surname: 'Kaya' } }],
    });
    const data = await getCaseData();
    const takip = service.generateTakipTalebi(data).content;
    expect(takip).toContain('Av.Avni Kaya');
    expect(takip).not.toMatch(/Av\.\s?Av\./);
    const odeme = service.generateOdemeEmri(data).content;
    expect(odeme).toContain('VEKILI          : Av. Avni Kaya');
    expect(odeme).not.toMatch(/Av\.\s?Av\./);
  });

  it('kambiyo ödeme emri tüzel kişi borçlunun vergi numarasını basar; kimliksiz borçluda boş satır kalmaz', async () => {
    const { service, getCaseData } = buildService({
      takipTuru: { code: 'KAMBIYO_CEK' },
      debtors: [
        debtor('Keşideci A.Ş.', 'KESIDECI', { tckn: null, vkn: '9876543210', type: 'COMPANY' }),
        debtor('Kimliksiz Ciranta', 'CIRANTA', { tckn: null }),
      ],
    });
    const data = await getCaseData();
    const odeme = service.generateOdemeEmri(data);
    expect(odeme.templateCode).toBe('ORNEK_7_KAMBIYO');
    expect(odeme.content).toContain('T.C./Vergi No: 9876543210');
    const ilamsiz = buildService({ debtors: [debtor('Kimliksiz Borçlu', 'ASIL_BORCLU', { tckn: null })] });
    const content = ilamsiz.service.generateOdemeEmri(await ilamsiz.getCaseData()).content;
    const block = content.slice(content.indexOf('1. Kimliksiz Borçlu'), content.indexOf('ALACAGIN TUTARI'));
    expect(block.split('\n').slice(1).filter((l) => l.trim().length === 0 && l.length > 0)).toEqual([]);
  });

  it('nafaka takip talebi ve nafaka icra emri de tüm borçluları yazar', async () => {
    const { service, getCaseData } = buildService({ subCategory: 'NAFAKA', debtors: [debtor('Borçlu Bir', 'ASIL_BORCLU'), debtor('Borçlu İki', 'MUSETEREK_BORCLU')] });
    const data = await getCaseData();
    expect(data.proceedingKind).toBe('NAFAKA');
    const takip = service.generateTakipTalebi(data).content;
    expect(takip).toContain('Borçlu Bir');
    expect(takip).toContain('Borçlu İki');
    const icra = service.generateIcraEmri(data).content;
    expect(icra).toContain('Borçlu İki (Müşterek Borçlu)');
  });
});

describe('üretim kaydı ve istemci önizlemesi', () => {
  it('generateDocumentFromCase: DocumentArtifact (contentHash, dataHash, READY) + DOCUMENT_GENERATED denetimi; seçim dayanağı ve "kabul doğrulanmadı" kayıtta; tekrar üretim yeni satır AÇMAZ', async () => {
    const artifact = {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({ id: 'art-1', ...data })),
    };
    const audit = { log: jest.fn(async () => undefined) };
    const { service } = buildService(
      { type: 'CHECK', claimItems: [{ itemType: 'PRINCIPAL', demandedAmount: 100, amount: 100, status: 'ACTIVE', isVirtual: false }] },
      { artifact, audit, instruments: [CEK_INSTRUMENT] },
    );
    const result = await service.generateDocumentFromCase('case-1', 'XML', 'takip-talebi', 'v1', 't1', 'user-1');
    expect(result.fromCache).toBe(false);
    expect(result.selection).toMatchObject({ kind: 'ILAMSIZ', explicit: false });
    expect(artifact.create).toHaveBeenCalledTimes(1);
    const data = (artifact.create.mock.calls[0] as any[])[0].data;
    expect(data).toMatchObject({ tenantId: 't1', caseId: 'case-1', documentType: 'TAKIP_TALEBI', format: 'XML', templateVersion: 'v1', status: 'READY', createdById: 'user-1' });
    expect(data.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(data.dataHash).toMatch(/^[a-f0-9]{16}$/);
    expect(data.filePath).toBeUndefined();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 't1', action: 'DOCUMENT_GENERATED', entityType: 'DocumentArtifact', entityId: 'art-1', userId: 'user-1',
      metadata: expect.objectContaining({
        documentType: 'TAKIP_TALEBI',
        format: 'XML',
        adliyeKabulu: 'DOGRULANMADI',
        takipYoluSecimi: expect.objectContaining({ kind: 'ILAMSIZ', basis: 'NOT_SELECTED', explicit: false }),
      }),
    }));

    // Kayıt sorgusu kiracı kapsamlıdır
    const recordLookup = artifact.findFirst.mock.calls.map((c) => (c as any[])[0]).find((a) => a?.where?.tenantId);
    expect(recordLookup.where).toMatchObject({ tenantId: 't1', caseId: 'case-1', documentType: 'TAKIP_TALEBI', format: 'XML' });

    // Aynı veri/şablon: mevcut satır bulunur (önbellek satırı filePath taşımadığından belge yeniden üretilir ama
    // KAYIT güncellenmez/çoğaltılmaz); denetim yine yazılır
    artifact.findFirst.mockResolvedValue({ id: 'art-1' } as any);
    await service.generateDocumentFromCase('case-1', 'XML', 'takip-talebi', 'v1', 't1', 'user-1');
    expect(artifact.create).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledTimes(2);
  });

  it('eşzamanlı üretim (P2002): mevcut kayıt yeniden okunur; kayıt yazılamazsa denetim hedefi dosyadır; belge yine döner', async () => {
    const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
    const raced = {
      findFirst: jest.fn()
        .mockResolvedValueOnce(null) // önbellek araması
        .mockResolvedValueOnce(null) // kayıt araması
        .mockResolvedValueOnce({ id: 'art-raced' }), // P2002 sonrası yeniden okuma
      create: jest.fn(async () => { throw p2002; }),
    };
    const audit = { log: jest.fn(async () => undefined) };
    const a = buildService({}, { artifact: raced, audit });
    const first = await a.service.generateDocumentFromCase('case-1', 'XML', 'takip-talebi', 'v1', 't1', 'user-1');
    expect(first.buffer.length).toBeGreaterThan(0);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'DocumentArtifact', entityId: 'art-raced' }));

    const failing = { findFirst: jest.fn(async () => null), create: jest.fn(async () => { throw new Error('db down'); }) };
    const audit2 = { log: jest.fn(async () => undefined) };
    const b = buildService({}, { artifact: failing, audit: audit2 });
    const second = await b.service.generateDocumentFromCase('case-1', 'XML', 'takip-talebi', 'v1', 't1', 'user-1');
    expect(second.buffer.length).toBeGreaterThan(0);
    expect(audit2.log).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'Case', entityId: 'case-1' }));
  });

  it('normalizeClientTemplateData: istemcinin kör çek tazminatı belgeye ve toplama GİRMEZ; toplamlar sunucuda; TASLAK; kalem türü CEK kambiyo seçtirmez', () => {
    const input = {
      claimItems: [
        { type: 'PRINCIPAL', description: 'Çek bedeli', amount: 10000, currency: 'TRY' },
        { type: 'COMPENSATION', description: '', amount: 1000, currency: 'TRY' },
        { type: 'INTEREST', description: 'İşlemiş Faiz', amount: 400, currency: 'TRY' },
      ],
      totals: { principal: 1, interest: 1, fees: 1, total: 3, currency: 'TRY' },
      lawyers: [{ name: 'Av. Deniz Yılmaz' }],
      caseType: 'GENEL_ICRA',
      subCategory: 'CEK',
    };
    const out = normalizeClientTemplateData(input as any);
    expect(out.claimItems.map((i: { type: string }) => i.type)).toEqual(['PRINCIPAL', 'INTEREST']);
    expect(out.totals).toEqual({ principal: 10000, interest: 400, fees: 0, total: 10400, currency: 'TRY' });
    expect(out.draftExcludedItems).toEqual([{ type: 'COMPENSATION', amount: 1000, currency: 'TRY', reason: 'NOT_A_RECORDED_CLAIM_ITEM' }]);
    // Avukat adı veride değiştirilmez; unvan üretim yerinde tek kez eklenir
    expect((out as any).lawyers[0].name).toBe('Av. Deniz Yılmaz');
    expect(normalizeClientTemplateData({ ...input, claimItems: [{ type: 'COMMISSION', description: '', amount: 5, currency: 'TRY' }] } as any).claimItems[0]).toMatchObject({ type: 'OTHER' });
    expect(out.proceedingSelection).toMatchObject({ kind: 'ILAMSIZ', explicit: true, basis: 'CLIENT_LABEL' });
    expect(out.isDraft).toBe(true);
    expect(normalizeClientTemplateData({ ...input, caseType: 'KAMBIYO' } as any).proceedingKind).toBe('KAMBIYO_CEK');
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
      interestInfo: { type: 'YASAL', description: '', variableRate: true }, caseType: 'KAMBIYO', subCategory: 'CEK', executionPath: 'HACIZ',
    } as unknown as TemplateData;
    await service.generateTakipTalebiWord(base);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      isDraft: true,
      proceedingKind: 'KAMBIYO_CEK',
      totals: { principal: 100, interest: 0, fees: 0, total: 100, currency: 'TRY' },
      claimItems: [expect.objectContaining({ type: 'PRINCIPAL' })],
      draftExcludedItems: [expect.objectContaining({ type: 'COMPENSATION', amount: 10 })],
    }));
    spy.mockClear();
    await service.generateWordFromCase('case-1', 'takip-talebi', 't1');
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0] as any[])[0]).not.toHaveProperty('isDraft');
  });

  describe('K3-L Faz 2b — taslak belgede SUNUCU hesaplı çek tazminatı', () => {
    const clientBase = {
      fileNumber: '2026/1', filingDate: '2026-01-01', executionOffice: { name: 'Ankara', city: 'Ankara' },
      creditors: [{ type: 'INDIVIDUAL', name: 'Alacaklı', address: 'Adres' }], lawyers: [{ name: 'Av. Deniz Yılmaz' }],
      debtors: [{ type: 'INDIVIDUAL', name: 'Borçlu', address: 'A' }],
      claimItems: [
        { type: 'PRINCIPAL', description: 'Çek bedeli', amount: 10000.1, currency: 'TRY' },
        // istemcinin kendi hesabı (kör %10) — KULLANILMAZ
        { type: 'COMPENSATION', description: '', amount: 9999, currency: 'TRY' },
      ],
      totals: { principal: 1, interest: 0, fees: 1, total: 2, currency: 'TRY' },
      interestInfo: { type: 'YASAL', description: '', variableRate: true }, caseType: 'KAMBIYO', subCategory: 'CEK', executionPath: 'HACIZ',
    };
    const previewInput = {
      instruments: [{ amount: 10000.1, currency: 'TRY', isBounced: true, bounceDate: '2026-09-01' }],
      debtors: [{ tempId: 'd-kesideci', role: 'KESIDECI' }, { tempId: 'd-ciranta', role: 'CIRANTA' }],
    };

    it('tutar sunucuda hesaplanır: satır TASLAK etiketli, toplam sunucu tutarını içerir; istemci satırı kullanılmaz', async () => {
      const { service } = buildService();
      const spy = jest.spyOn(service as any, 'generateTakipTalebiWordFormatted').mockResolvedValue(Buffer.from('docx'));
      await service.generateTakipTalebiWord({ ...clientBase, cekFormationPreview: previewInput } as unknown as TemplateData);
      const data = (spy.mock.calls[0] as any[])[0];
      expect(data.claimItems).toEqual([
        expect.objectContaining({ type: 'PRINCIPAL', amount: 10000.1 }),
        { type: 'CHECK_PENALTY', description: 'Çek Tazminatı (TASLAK — onay bekliyor)', amount: 1000.01, currency: 'TRY' },
      ]);
      expect(data.totals).toEqual({ principal: 10000.1, interest: 0, fees: 1000.01, total: 11000.11, currency: 'TRY' });
      expect(data.draftExcludedItems).toEqual([expect.objectContaining({ type: 'COMPENSATION', amount: 9999 })]);
      expect(data.draftComputedItems).toEqual([
        { type: 'CHECK_PENALTY', amount: 1000.01, currency: 'TRY', source: 'SERVER_PREVIEW', previewHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
      ]);
      expect(data.draftPenaltyNotice).toContain('sunucu hesabıyla TASLAK');
      expect(data.isDraft).toBe(true);
      // önizleme girdisi belge verisine taşınmaz
      expect(data).not.toHaveProperty('cekFormationPreview');
    });

    it('girdi eksikse (karşılıksız işareti yok) tutar ÜRETİLMEZ — kör %10 yok; sebep taslak notunda', async () => {
      const { service } = buildService();
      const spy = jest.spyOn(service as any, 'generateTakipTalebiPdfFormatted').mockResolvedValue(Buffer.from('pdf'));
      await service.generateTakipTalebiPdf({
        ...clientBase,
        cekFormationPreview: { ...previewInput, instruments: [{ amount: 10000.1, currency: 'TRY' }] },
      } as unknown as TemplateData);
      const data = (spy.mock.calls[0] as any[])[0];
      expect(data.claimItems.map((i: { type: string }) => i.type)).toEqual(['PRINCIPAL']);
      expect(data.totals).toEqual({ principal: 10000.1, interest: 0, fees: 0, total: 10000.1, currency: 'TRY' });
      expect(data.draftComputedItems).toEqual([]);
      expect(data.draftPenaltyNotice).toMatch(/^Çek tazminatı bu taslakta yer almaz: /);
    });

    it('önizleme girdisi yoksa önceki davranış: istemci satırı dışlanır, tazminat satırı yok', () => {
      const out = normalizeClientTemplateData(clientBase as any);
      expect(out.claimItems.map((i: { type: string }) => i.type)).toEqual(['PRINCIPAL']);
      expect(out.draftComputedItems).toEqual([]);
      expect(out.draftPenaltyNotice).toContain('kayıtlı alacak kalemi değildir');
    });

    it('takip yolu seçimi tazminat hesabından ETKİLENMEZ: açık seçim yoksa kambiyo seçilmez', () => {
      const out = normalizeClientTemplateData(
        { ...clientBase, caseType: 'GENEL_ICRA' } as any,
        { status: 'HESAPLANDI', amount: 1000.01, currency: 'TRY', previewHash: 'a'.repeat(64) },
      );
      expect(out.proceedingSelection.kind).not.toBe('KAMBIYO_CEK');
      expect(out.claimItems.map((i: { type: string }) => i.type)).toEqual(['PRINCIPAL', 'CHECK_PENALTY']);
    });
  });
});
