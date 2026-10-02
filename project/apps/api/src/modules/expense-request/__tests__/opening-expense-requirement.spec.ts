import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExpenseGateService } from '../expense-gate.service';
import { evaluateOpeningExpenseBasis } from '../opening-expense-basis';
import {
  evaluateOpeningExpenseRequirement,
  loadOpeningExpenseRequirement,
  openingExpenseBlocksExpenseGate,
  OpeningExpenseNotDetermined,
  OpeningExpenseRequirementReadClient,
} from '../opening-expense-requirement';

/**
 * Açılış masrafı şartı — tutarı BELİRLENEMEMİŞ açılış masrafı "sağlandı" sayılmaz (saf karar + okuma + masraf kapısı).
 *
 * Owner ek kararı (2026-10-01): dövizli / karma dosyada talebin oluşturulamaması masraf şartını sağlamaz; eksik hesap
 * görünür ve engelleyicidir; okuma / sorgu etkilenmez; sıfır ya da uydurma tutar, kur, matrah ÜRETİLMEZ; yalnız bir
 * talebin varlığı yeterli sayılmaz. TL dosyanın davranışı DEĞİŞMEZ.
 */
const TRY_BASIS = evaluateOpeningExpenseBasis({ caseCurrency: 'TRY', basisRecordCurrencies: ['TRY'] });
const USD_BASIS = evaluateOpeningExpenseBasis({ caseCurrency: 'USD', basisRecordCurrencies: ['USD'] });

const notDetermined = (input: Parameters<typeof evaluateOpeningExpenseRequirement>[0]): OpeningExpenseNotDetermined => {
  const requirement = evaluateOpeningExpenseRequirement(input);
  if (requirement.status !== 'NOT_DETERMINED') throw new Error(`beklenen: belirlenmedi, gelen: ${requirement.status}`);
  return requirement;
};

describe('evaluateOpeningExpenseRequirement', () => {
  it.each([
    ['müvekkilli, kayıtlı kalem yok', { clientAssigned: true, recordedItemCodes: [] }],
    ['müvekkilsiz', { clientAssigned: false, recordedItemCodes: [] }],
    ['peşin harç kayıtlı', { clientAssigned: true, recordedItemCodes: ['PESIN_HARC'] }],
  ])('TL dosya (%s) → tarifeden hesaplanır; şart bu yardımcıda değerlendirilmez', (_title, rest) => {
    expect(evaluateOpeningExpenseRequirement({ basis: TRY_BASIS, ...rest })).toEqual({ status: 'TARIFF_CALCULABLE' });
  });

  it('dövizli dosya, peşin harç hiçbir talepte kayıtlı değil → belirlenmedi: neden, gereken bilgi, düzeltme yolu; TUTAR YOK', () => {
    if (USD_BASIS.calculable) throw new Error('beklenen: hesaplanamaz');
    const requirement = notDetermined({ basis: USD_BASIS, clientAssigned: true, recordedItemCodes: [] });

    expect(requirement).toEqual({
      status: 'NOT_DETERMINED',
      reasonCode: 'OPENING_EXPENSE_NOT_DETERMINED',
      message: `Açılış masrafı belirlenmediği için masraf şartı sağlanmış sayılmaz. ${USD_BASIS.message}`,
      requiredInfo: ['Peşin harç tutarı (TL)'],
      notCalculableItems: [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç' }],
      completionPath:
        'Bu engelin kalkması için "Peşin Harç" kalemini TL tutarıyla içeren masraf talebi, kalemleri elle girilerek ' +
        'oluşturulmalı ve karşılanmalıdır (ödeme alındı ya da avukat karşıladı).',
      clientAssigned: true,
      caseCurrency: 'USD',
      basisCurrencies: ['USD'],
      tariffCurrency: 'TRY',
    });
    // Tutar, kur ya da toplam ÖNERİLMEZ; 0 da yazılmaz
    expect(`${requirement.message} ${requirement.completionPath}`).not.toMatch(/\d/);
    expect(requirement).not.toHaveProperty('amount');
    expect(requirement).not.toHaveProperty('totalAmount');
  });

  it('müvekkilsiz dövizli dosya → düzeltme yolu önce müvekkil atanmasını söyler', () => {
    const requirement = notDetermined({ basis: USD_BASIS, clientAssigned: false, recordedItemCodes: [] });

    expect(requirement.clientAssigned).toBe(false);
    expect(requirement.completionPath).toBe(
      'Dosyaya müvekkil atanmamış; masraf talebi için önce müvekkil atanmalıdır. Bu engelin kalkması için "Peşin Harç" kalemini TL ' +
        'tutarıyla içeren masraf talebi, kalemleri elle girilerek oluşturulmalı ve karşılanmalıdır (ödeme alındı ya da avukat karşıladı).',
    );
  });

  it('hesaplanamayan birden fazla kalem: yalnız KAYITLI OLMAYANLAR eksik sayılır; hepsi kayıtlıysa kayıtlı', () => {
    if (USD_BASIS.calculable) throw new Error('beklenen: hesaplanamaz');
    const basis = {
      ...USD_BASIS,
      notCalculableItems: [
        { itemCode: 'PESIN_HARC', label: 'Peşin Harç' },
        { itemCode: 'ORNEK_ORANLI', label: 'Örnek Oranlı Kalem' },
        { itemCode: 'ORNEK_ORANLI_IKI', label: 'Örnek Oranlı Kalem İki' },
      ],
    };

    const requirement = notDetermined({ basis, clientAssigned: true, recordedItemCodes: ['ORNEK_ORANLI'] });
    expect(requirement.notCalculableItems.map((item) => item.itemCode)).toEqual(['PESIN_HARC', 'ORNEK_ORANLI_IKI']);
    expect(requirement.completionPath).toContain('Bu engelin kalkması için "Peşin Harç", "Örnek Oranlı Kalem İki" kalemlerini TL tutarıyla içeren');

    expect(evaluateOpeningExpenseRequirement({ basis, clientAssigned: true, recordedItemCodes: ['ORNEK_ORANLI_IKI', 'PESIN_HARC', 'ORNEK_ORANLI'] })).toEqual({
      status: 'RATE_ITEMS_RECORDED',
    });
  });

  it('YALNIZ BİR TALEBİN VARLIĞI YETMEZ: peşin harç dışındaki kalemler kayıtlı olsa da belirlenmedi', () => {
    const requirement = notDetermined({ basis: USD_BASIS, clientAssigned: true, recordedItemCodes: ['POSTA', 'BASVURMA_HARCI', 'TEBLIGAT_GIDERI'] });

    expect(requirement.notCalculableItems).toEqual([{ itemCode: 'PESIN_HARC', label: 'Peşin Harç' }]);
  });

  it('peşin harç bir talepte tutarıyla kayıtlı → kayıtlı; şartın gerisi mevcut masraf kapısı kuralıdır', () => {
    expect(evaluateOpeningExpenseRequirement({ basis: USD_BASIS, clientAssigned: true, recordedItemCodes: ['POSTA', 'PESIN_HARC'] })).toEqual({
      status: 'RATE_ITEMS_RECORDED',
    });
  });

  it.each([
    ['dosya USD + TRY anapara kalemi', { caseCurrency: 'USD', basisRecordCurrencies: ['USD', 'TRY'] }, ['TRY', 'USD']],
    ['dosya TRY, anapara kalemi USD', { caseCurrency: 'TRY', basisRecordCurrencies: ['USD'] }, ['TRY', 'USD']],
  ])('karma para birimi (%s) → belirlenmedi', (_title, basisInput, basisCurrencies) => {
    const requirement = notDetermined({ basis: evaluateOpeningExpenseBasis(basisInput), clientAssigned: true, recordedItemCodes: [] });

    expect(requirement.basisCurrencies).toEqual(basisCurrencies);
  });
});

describe('openingExpenseBlocksExpenseGate', () => {
  it.each([
    ['belirlenmedi + müvekkilli', evaluateOpeningExpenseRequirement({ basis: USD_BASIS, clientAssigned: true, recordedItemCodes: [] }), true],
    // Masraf kapısı talep bazlıdır: müvekkilsiz dosyada otomatik talep hiç denenmez (TL dosyayla aynı)
    ['belirlenmedi + müvekkilsiz', evaluateOpeningExpenseRequirement({ basis: USD_BASIS, clientAssigned: false, recordedItemCodes: [] }), false],
    ['kayıtlı', evaluateOpeningExpenseRequirement({ basis: USD_BASIS, clientAssigned: true, recordedItemCodes: ['PESIN_HARC'] }), false],
    ['TL', evaluateOpeningExpenseRequirement({ basis: TRY_BASIS, clientAssigned: true, recordedItemCodes: [] }), false],
  ])('%s → %s', (_title, requirement, expected) => {
    expect(openingExpenseBlocksExpenseGate(requirement)).toBe(expected);
  });
});

type CaseRow = { clientId: string | null; currency: string; claimItems: { currency: string }[]; dues: { currency: string }[] };

function makeReadClient(caseRow: CaseRow | null, recordedItemCodes: string[] = []) {
  const caseFindFirst = jest.fn().mockResolvedValue(caseRow);
  const itemFindMany = jest.fn().mockResolvedValue(recordedItemCodes.map((itemCode) => ({ itemCode })));
  const client = { case: { findFirst: caseFindFirst }, expenseRequestItem: { findMany: itemFindMany } } as unknown as OpeningExpenseRequirementReadClient;
  return { client, caseFindFirst, itemFindMany };
}

const usdCase = (clientId: string | null = 'client-1'): CaseRow => ({ clientId, currency: 'USD', claimItems: [], dues: [{ currency: 'USD' }] });
const tryCase = (clientId: string | null = 'client-1'): CaseRow => ({ clientId, currency: 'TRY', claimItems: [], dues: [{ currency: 'TRY' }] });

describe('loadOpeningExpenseRequirement', () => {
  it('dosya çağıranın bürosunda değilse null döner; kalem okunmaz (başka büronun dosyası hakkında bilgi üretilmez)', async () => {
    const { client, caseFindFirst, itemFindMany } = makeReadClient(null);

    expect(await loadOpeningExpenseRequirement(client, 'tenant-b', 'case-1')).toBeNull();
    expect(caseFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'case-1', tenantId: 'tenant-b' } }));
    expect(itemFindMany).not.toHaveBeenCalled();
  });

  it('TL dosya: tek okuma; masraf kalemi sorgulanmaz', async () => {
    const { client, itemFindMany } = makeReadClient(tryCase());

    expect(await loadOpeningExpenseRequirement(client, 'tenant-a', 'case-1')).toEqual({ status: 'TARIFF_CALCULABLE' });
    expect(itemFindMany).not.toHaveBeenCalled();
  });

  it('dövizli dosya: yalnız bu büro + bu dosya + İPTAL EDİLMEMİŞ talep + tutarı > 0 olan peşin harç satırı aranır', async () => {
    const { client, itemFindMany } = makeReadClient(usdCase());

    const requirement = await loadOpeningExpenseRequirement(client, 'tenant-a', 'case-1');

    expect(requirement).toMatchObject({ status: 'NOT_DETERMINED', clientAssigned: true });
    expect(itemFindMany).toHaveBeenCalledTimes(1);
    expect(itemFindMany).toHaveBeenCalledWith({
      where: {
        itemCode: { in: ['PESIN_HARC'] },
        finalAmount: { gt: 0 },
        expenseRequest: { caseId: 'case-1', tenantId: 'tenant-a', status: { not: 'CANCELLED' } },
      },
      select: { itemCode: true },
      distinct: ['itemCode'],
    });
  });

  it('dövizli dosya, peşin harç satırı kayıtlı → kayıtlı', async () => {
    const { client } = makeReadClient(usdCase(), ['PESIN_HARC']);

    expect(await loadOpeningExpenseRequirement(client, 'tenant-a', 'case-1')).toEqual({ status: 'RATE_ITEMS_RECORDED' });
  });

  it('müvekkilsiz dövizli dosya → belirlenmedi, müvekkil atanmamış', async () => {
    const { client } = makeReadClient(usdCase(null));

    expect(await loadOpeningExpenseRequirement(client, 'tenant-a', 'case-1')).toMatchObject({ status: 'NOT_DETERMINED', clientAssigned: false });
  });
});

describe('ExpenseGateService — büro kapsamlı masraf kapısı ve açılış masrafı şartı', () => {
  const D = (n: number) => new Prisma.Decimal(n);
  const pending = (id: string, total: number) => ({ id, tenantId: 'tenant-a', stageCode: null, totalAmount: D(total), paidTotal: D(0), status: 'PENDING' });

  function makeGate(caseRow: CaseRow | null, opts: { recordedItemCodes?: string[]; candidates?: ReturnType<typeof pending>[] } = {}) {
    const { client, itemFindMany } = makeReadClient(caseRow, opts.recordedItemCodes);
    const candidates = opts.candidates ?? [];
    const requestFindMany = jest.fn().mockResolvedValue(candidates);
    const requestCount = jest.fn().mockResolvedValue(candidates.length);
    const prisma = { ...client, expenseRequest: { findMany: requestFindMany, count: requestCount } } as never;
    const readService = { computeExpenseRemaining: jest.fn().mockImplementation(async (_db, _tenant, _id, total, paid) => total.minus(paid)) } as never;
    return { service: new ExpenseGateService(prisma, readService), requestFindMany, requestCount, itemFindMany };
  }

  describe('checkGateForCase', () => {
    it('TL dosya: sonuç checkGate ile AYNI — açılış masrafı alanı yok', async () => {
      const { service } = makeGate(tryCase(), { candidates: [pending('er1', 1431.1)] });

      const scoped = await service.checkGateForCase('tenant-a', 'case-1');

      expect(scoped).toEqual(await service.checkGate('case-1', 'tenant-a'));
      expect(scoped).toEqual({
        isBlocked: true,
        blockingExpenses: [{ id: 'er1', stageCode: null, totalAmount: 1431.1, paidTotal: 0, remaining: 1431.1, status: 'PENDING' }],
        totalPending: 1431.1,
        message: '1 adet ödenmemiş masraf talebi var. Toplam: 1431.10 TL',
      });
    });

    it('TL dosya, talep yok: kilitli değil (mevcut davranış)', async () => {
      const { service } = makeGate(tryCase());

      expect(await service.checkGateForCase('tenant-a', 'case-1')).toEqual({ isBlocked: false, blockingExpenses: [], totalPending: 0 });
    });

    it('dövizli dosya, talep YOK: kilitli — "hazır" sayılmaz; neden + düzeltme yolu; belirlenmemiş tutar toplam olarak yazılmaz', async () => {
      const { service } = makeGate(usdCase());

      const gate = await service.checkGateForCase('tenant-a', 'case-1');

      expect(gate.isBlocked).toBe(true);
      expect(gate.blockingExpenses).toEqual([]);
      expect(gate.totalPending).toBe(0);
      expect(gate.openingExpense).toMatchObject({ status: 'NOT_DETERMINED', reasonCode: 'OPENING_EXPENSE_NOT_DETERMINED', requiredInfo: ['Peşin harç tutarı (TL)'] });
      expect(gate.message).toBe(`${gate.openingExpense!.message} ${gate.openingExpense!.completionPath}`);
      expect(gate.message).not.toMatch(/\d/);
    });

    it('dövizli dosya, peşin harçsız ödenmemiş talep var: açılış masrafı HÂLÂ belirlenmedi; iki neden birlikte bildirilir', async () => {
      const { service } = makeGate(usdCase(), { candidates: [pending('er1', 50)] });

      const gate = await service.checkGateForCase('tenant-a', 'case-1');

      expect(gate.isBlocked).toBe(true);
      expect(gate.totalPending).toBe(50);
      expect(gate.openingExpense).toBeDefined();
      expect(gate.message).toBe(
        `${gate.openingExpense!.message} ${gate.openingExpense!.completionPath} Ayrıca: 1 adet ödenmemiş masraf talebi var. Toplam: 50.00 TL`,
      );
    });

    it('dövizli dosya, peşin harç elle kayıtlı ama talep ÖDENMEMİŞ: mevcut kural kilitler (talebin varlığı şartı sağlamaz)', async () => {
      const { service } = makeGate(usdCase(), { recordedItemCodes: ['PESIN_HARC'], candidates: [pending('er1', 2888.5)] });

      expect(await service.checkGateForCase('tenant-a', 'case-1')).toEqual({
        isBlocked: true,
        blockingExpenses: [{ id: 'er1', stageCode: null, totalAmount: 2888.5, paidTotal: 0, remaining: 2888.5, status: 'PENDING' }],
        totalPending: 2888.5,
        message: '1 adet ödenmemiş masraf talebi var. Toplam: 2888.50 TL',
      });
    });

    it('dövizli dosya, peşin harç elle kayıtlı ve talep karşılanmış: engel kalkar', async () => {
      const { service } = makeGate(usdCase(), { recordedItemCodes: ['PESIN_HARC'] });

      expect(await service.checkGateForCase('tenant-a', 'case-1')).toEqual({ isBlocked: false, blockingExpenses: [], totalPending: 0 });
    });

    it('müvekkilsiz dövizli dosya: masraf kapısı TL dosyadaki gibi talep bazlı kalır', async () => {
      const { service } = makeGate(usdCase(null));

      expect(await service.checkGateForCase('tenant-a', 'case-1')).toEqual({ isBlocked: false, blockingExpenses: [], totalPending: 0 });
    });

    it('başka büronun dosyası: bulunamadı; masraf talepleri OKUNMAZ', async () => {
      const { service, requestFindMany, requestCount } = makeGate(null, { candidates: [pending('er1', 1431.1)] });

      await expect(service.checkGateForCase('tenant-b', 'case-1')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.canPerformUyapActionForCase('tenant-b', 'case-1', 'VIEW')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.getGateSummaryForCase('tenant-b', 'case-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(requestFindMany).not.toHaveBeenCalled();
      expect(requestCount).not.toHaveBeenCalled();
    });
  });

  describe('canPerformUyapActionForCase', () => {
    it.each(['VIEW', 'QUERY', 'DOWNLOAD', 'view'])('okuma / sorgu / indirme (%s): açılış masrafı belirlenmemişken de serbest', async (actionType) => {
      const { service } = makeGate(usdCase());

      expect(await service.canPerformUyapActionForCase('tenant-a', 'case-1', actionType)).toBe(true);
    });

    it.each(['SUBMIT', 'SEND', 'NOTIFICATION', 'HACIZ'])('%s: açılış masrafı belirlenmemişken yapılamaz', async (actionType) => {
      const { service } = makeGate(usdCase());

      expect(await service.canPerformUyapActionForCase('tenant-a', 'case-1', actionType)).toBe(false);
    });

    it('dövizli dosya, peşin harç kayıtlı ve talep karşılanmış → yapılabilir; TL dosyada sonuç canPerformUyapAction ile aynı', async () => {
      const recorded = makeGate(usdCase(), { recordedItemCodes: ['PESIN_HARC'] });
      expect(await recorded.service.canPerformUyapActionForCase('tenant-a', 'case-1', 'SUBMIT')).toBe(true);

      const tryBlocked = makeGate(tryCase(), { candidates: [pending('er1', 1431.1)] });
      expect(await tryBlocked.service.canPerformUyapActionForCase('tenant-a', 'case-1', 'SUBMIT')).toBe(false);
      expect(await tryBlocked.service.canPerformUyapAction('case-1', 'SUBMIT', 'tenant-a')).toBe(false);

      const tryClear = makeGate(tryCase());
      expect(await tryClear.service.canPerformUyapActionForCase('tenant-a', 'case-1', 'SUBMIT')).toBe(true);
    });
  });

  describe('getGateSummaryForCase', () => {
    it('TL dosya: sonuç getGateSummary ile AYNI', async () => {
      const blocked = makeGate(tryCase(), { candidates: [pending('er1', 1431.1)] });
      expect(await blocked.service.getGateSummaryForCase('tenant-a', 'case-1')).toEqual(await blocked.service.getGateSummary('case-1', 'tenant-a'));
      expect(await blocked.service.getGateSummaryForCase('tenant-a', 'case-1')).toMatchObject({
        canSubmitToUyap: false,
        message: 'Masraf ödenmeden UYAP işlemi yapılamaz. Bekleyen: 1431.10 TL',
      });

      const clear = makeGate(tryCase());
      expect(await clear.service.getGateSummaryForCase('tenant-a', 'case-1')).toEqual({
        isBlocked: false,
        totalPending: 0,
        blockingCount: 0,
        expenses: [],
        canSubmitToUyap: true,
        canSendNotification: true,
        message: 'UYAP işlemleri için hazır.',
      });
    });

    it('dövizli dosya, talep yok: "hazır" ya da "bekleyen 0.00 TL" YAZILMAZ; gönderim ve tebligat kapalı, neden bildirilir', async () => {
      const { service } = makeGate(usdCase());

      const summary = await service.getGateSummaryForCase('tenant-a', 'case-1');

      expect(summary).toMatchObject({ isBlocked: true, canSubmitToUyap: false, canSendNotification: false, blockingCount: 0, totalPending: 0 });
      expect(summary.message).toContain('Açılış masrafı belirlenmediği için masraf şartı sağlanmış sayılmaz.');
      expect(summary.message).not.toContain('hazır');
      expect(summary.message).not.toContain('Bekleyen');
      expect(summary).toHaveProperty('openingExpense.requiredInfo', ['Peşin harç tutarı (TL)']);
    });

    it('dövizli dosya, peşin harçsız ödenmemiş talep var: açılış nedeni + bekleyen talep mesajı', async () => {
      const { service } = makeGate(usdCase(), { candidates: [pending('er1', 50)] });

      const summary = await service.getGateSummaryForCase('tenant-a', 'case-1');

      expect(summary.message).toMatch(/^Açılış masrafı belirlenmediği için .* Ayrıca: Masraf ödenmeden UYAP işlemi yapılamaz\. Bekleyen: 50\.00 TL$/);
      expect(summary).toMatchObject({ isBlocked: true, blockingCount: 1, totalPending: 50, canSubmitToUyap: false });
    });
  });
});
