import { Prisma } from '@prisma/client';
import { ClaimItemService } from '../claim-item.service';
import {
  buildClaimSummaryCurrencyStatus,
  sumClaimSummaryTotals,
  type ClaimSummaryItemInput,
  type ClaimSummaryTotals,
} from '../claim-summary-currency';
import { ClaimItemType } from '../dto/claim-item.dto';

/**
 * Alacak özeti para birimi bağlamı — DAVRANIŞ SÖZLEŞMESİ (saf birim + servis; veritabanı YOK).
 *
 * Kural: yardımcı tutar çevirmez ve para birimleri arasında toplama yapmaz. Etkin kalemler tek para birimindeyse özetin
 * tek toplamları geçerlidir; birden fazla para birimi (ya da para birimi kayıtlı olmayan kalem) varsa tek toplam
 * GÖSTERİLEMEZ ve toplamlar para birimi bazında verilir. Yanıtın mevcut alanları (`currency`, `items`, `totals`)
 * DEĞİŞMEZ — aşağıdaki "mevcut alanlar" iddiaları düzeltmeden önceki servis koduyla da geçer (karakterizasyon).
 *
 * Kalem başına farklı para birimine izin verilip verilmeyeceği ve dövizli takipte kur owner kararıdır; burada kural
 * seçilmez.
 */

/** Her kalem türünden bir kayıt; tutarlar yanlış kategoriye düşen türü ele verecek biçimde birbirinden farklı. */
const HER_TURDEN: Array<{ itemType: ClaimItemType; amount: number }> = [
  { itemType: ClaimItemType.PRINCIPAL, amount: 10_000 },
  { itemType: ClaimItemType.INTEREST, amount: 110.1 },
  { itemType: ClaimItemType.PRE_INTEREST, amount: 220.2 },
  { itemType: ClaimItemType.POST_INTEREST, amount: 330.3 },
  { itemType: ClaimItemType.EXPENSE, amount: 250 },
  { itemType: ClaimItemType.FEE, amount: 120.05 },
  { itemType: ClaimItemType.ATTORNEY_FEE, amount: 9_000 },
  { itemType: ClaimItemType.PENALTY, amount: 1_000 },
  { itemType: ClaimItemType.CHECK_PENALTY, amount: 500 },
  { itemType: ClaimItemType.CONTRACTUAL_PENALTY, amount: 250.25 },
  { itemType: ClaimItemType.TAX_KDV, amount: 18 },
  { itemType: ClaimItemType.TAX_BSMV, amount: 5 },
  { itemType: ClaimItemType.TAX_KKDF, amount: 15.5 },
  { itemType: ClaimItemType.OTHER, amount: 7.77 },
];

/** HER_TURDEN için elle hesaplanmış beklenen toplamlar (yardımcı çağrılarak ÜRETİLMEDİ). */
const HER_TURDEN_TOPLAM: ClaimSummaryTotals = {
  principal: 10_000,
  preInterest: 330.3, // INTEREST 110,10 + PRE_INTEREST 220,20
  postInterest: 330.3,
  totalInterest: 660.6,
  expense: 250,
  fee: 120.05,
  attorneyFee: 9_000,
  penalty: 1_750.25, // PENALTY 1.000 + CHECK_PENALTY 500 + CONTRACTUAL_PENALTY 250,25
  tax: 38.5, // KDV 18 + BSMV 5 + KKDF 15,50
  other: 7.77,
  grandTotal: 21_827.17,
};

const SIFIR_TOPLAM: ClaimSummaryTotals = {
  principal: 0,
  preInterest: 0,
  postInterest: 0,
  totalInterest: 0,
  expense: 0,
  fee: 0,
  attorneyFee: 0,
  penalty: 0,
  tax: 0,
  other: 0,
  grandTotal: 0,
};

const kalem = (itemType: string, amount: unknown, currency?: string | null): ClaimSummaryItemInput => ({
  itemType,
  amount,
  currency,
});

const paraBirimiyle = (currency: string): ClaimSummaryItemInput[] =>
  HER_TURDEN.map((row) => kalem(row.itemType, row.amount, currency));

describe('Alacak özeti kategori toplamları (sumClaimSummaryTotals)', () => {
  it('fikstür her kalem türünü tam bir kez içerir (bakıldığının kanıtı)', () => {
    expect(HER_TURDEN.map((row) => row.itemType).sort()).toEqual(Object.values(ClaimItemType).sort());
    expect(HER_TURDEN).toHaveLength(14);
  });

  it('her kalem türü kendi kategorisine toplanır; genel toplam bütün kalemlerin toplamıdır', () => {
    expect(sumClaimSummaryTotals(paraBirimiyle('TRY'))).toEqual(HER_TURDEN_TOPLAM);
  });

  it('bilinmeyen kalem türü "diğer" kategorisine girer ve genel toplama dahildir', () => {
    expect(sumClaimSummaryTotals([kalem('BILINMEYEN_TUR', 1.23, 'TRY')])).toEqual({ ...SIFIR_TOPLAM, other: 1.23, grandTotal: 1.23 });
  });

  it('kayıttaki tutar biçimleri: Prisma Decimal, metin ve boş tutar (boş = 0)', () => {
    expect(
      sumClaimSummaryTotals([
        kalem('PRINCIPAL', new Prisma.Decimal('1000.10'), 'TRY'),
        kalem('PRINCIPAL', '2000.20', 'TRY'),
        kalem('PRINCIPAL', null, 'TRY'),
        kalem('PRINCIPAL', undefined, 'TRY'),
        kalem('EXPENSE', new Prisma.Decimal('0'), 'TRY'),
      ]),
    ).toEqual({ ...SIFIR_TOPLAM, principal: 3_000.3, grandTotal: 3_000.3 });
  });

  it('kuruş toplamı kayan nokta artığı taşımaz (0,10 + 0,20 = 0,30)', () => {
    const totals = sumClaimSummaryTotals([kalem('EXPENSE', 0.1, 'TRY'), kalem('EXPENSE', 0.2, 'TRY')]);
    expect(totals.expense).toBe(0.3);
    expect(totals.grandTotal).toBe(0.3);
  });

  it('kalem yoksa bütün toplamlar 0', () => {
    expect(sumClaimSummaryTotals([])).toEqual(SIFIR_TOPLAM);
  });
});

describe('Alacak özeti para birimi bağlamı (buildClaimSummaryCurrencyStatus)', () => {
  it('kalem yok: tek toplam (0) gösterilebilir; para birimi dayanağı yok', () => {
    expect(buildClaimSummaryCurrencyStatus([])).toEqual({
      durum: 'KALEM_YOK',
      toplamGosterilebilir: true,
      gerekce: null,
      mesaj: null,
      alacakParaBirimi: null,
      paraBirimleri: [],
      paraBirimiEksikKalemSayisi: 0,
      toplamlarParaBirimiBazinda: [],
    });
  });

  it.each(['TRY', 'USD', 'EUR'])('tek para birimi (%s): tek toplam gösterilebilir; para birimi bazındaki tek satır bütün kalemlerin toplamıdır', (currency) => {
    const items = paraBirimiyle(currency);

    expect(buildClaimSummaryCurrencyStatus(items)).toEqual({
      durum: 'TEK_PARA_BIRIMI',
      toplamGosterilebilir: true,
      gerekce: null,
      mesaj: null,
      alacakParaBirimi: currency,
      paraBirimleri: [currency],
      paraBirimiEksikKalemSayisi: 0,
      toplamlarParaBirimiBazinda: [{ paraBirimi: currency, kalemSayisi: 14, totals: HER_TURDEN_TOPLAM }],
    });
  });

  it('karma anapara (USD + EUR + TRY): tek toplam GÖSTERİLEMEZ; her para birimi kendi tutarıyla ayrı durur (çevirme ve birleştirme yok)', () => {
    const status = buildClaimSummaryCurrencyStatus([
      kalem('PRINCIPAL', 10_000, 'USD'),
      kalem('PRINCIPAL', 5_000, 'EUR'),
      kalem('PRINCIPAL', 2_000, 'TRY'),
    ]);

    expect(status).toEqual({
      durum: 'KARMA_PARA_BIRIMI',
      toplamGosterilebilir: false,
      gerekce: 'FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ',
      mesaj:
        'Dosyada birden fazla para biriminde alacak kalemi var (EUR, TRY, USD). Tutarlar çevrilmedi ve tek toplamda ' +
        'birleştirilmedi; toplamlar para birimi bazında gösterilir.',
      alacakParaBirimi: null,
      paraBirimleri: ['EUR', 'TRY', 'USD'],
      paraBirimiEksikKalemSayisi: 0,
      toplamlarParaBirimiBazinda: [
        { paraBirimi: 'EUR', kalemSayisi: 1, totals: { ...SIFIR_TOPLAM, principal: 5_000, grandTotal: 5_000 } },
        { paraBirimi: 'TRY', kalemSayisi: 1, totals: { ...SIFIR_TOPLAM, principal: 2_000, grandTotal: 2_000 } },
        { paraBirimi: 'USD', kalemSayisi: 1, totals: { ...SIFIR_TOPLAM, principal: 10_000, grandTotal: 10_000 } },
      ],
    });
    // Hiçbir yerde 17.000 (çapraz para birimi toplamı) üretilmez
    expect(JSON.stringify(status)).not.toContain('17000');
  });

  it('karar kalem sırasından bağımsızdır (son kalemin para birimi sonucu değiştirmez)', () => {
    const a = [kalem('PRINCIPAL', 10_000, 'USD'), kalem('PRINCIPAL', 5_000, 'EUR'), kalem('PRINCIPAL', 2_000, 'TRY')];
    const b = [a[2], a[1], a[0]];
    const c = [a[1], a[2], a[0]];

    expect(buildClaimSummaryCurrencyStatus(b)).toEqual(buildClaimSummaryCurrencyStatus(a));
    expect(buildClaimSummaryCurrencyStatus(c)).toEqual(buildClaimSummaryCurrencyStatus(a));
  });

  it('aynı kategoride farklı para birimi (USD masraf + EUR masraf): kategori toplamı da para birimi bazında ayrılır', () => {
    const status = buildClaimSummaryCurrencyStatus([
      kalem('PRINCIPAL', 10_000, 'USD'),
      kalem('EXPENSE', 250, 'USD'),
      kalem('EXPENSE', 300, 'EUR'),
    ]);

    expect(status.toplamGosterilebilir).toBe(false);
    expect(status.toplamlarParaBirimiBazinda).toEqual([
      { paraBirimi: 'EUR', kalemSayisi: 1, totals: { ...SIFIR_TOPLAM, expense: 300, grandTotal: 300 } },
      { paraBirimi: 'USD', kalemSayisi: 2, totals: { ...SIFIR_TOPLAM, principal: 10_000, expense: 250, grandTotal: 10_250 } },
    ]);
  });

  it('para birimi yazımı (boşluk / küçük harf) aynı para birimini ikiye bölmez', () => {
    const status = buildClaimSummaryCurrencyStatus([
      kalem('PRINCIPAL', 10_000, 'USD'),
      kalem('EXPENSE', 250, ' usd '),
    ]);

    expect(status).toMatchObject({
      durum: 'TEK_PARA_BIRIMI',
      toplamGosterilebilir: true,
      alacakParaBirimi: 'USD',
      paraBirimleri: ['USD'],
    });
    expect(status.toplamlarParaBirimiBazinda).toEqual([
      { paraBirimi: 'USD', kalemSayisi: 2, totals: { ...SIFIR_TOPLAM, principal: 10_000, expense: 250, grandTotal: 10_250 } },
    ]);
  });

  it.each([
    ['boş metin', ''],
    ['yalnız boşluk', '   '],
    ['null', null],
    ['tanımsız', undefined],
  ])('para birimi kayıtlı olmayan kalem (%s): TRY SAYILMAZ; tek toplam gösterilemez ve kalem hiçbir toplama girmez', (_title, currency) => {
    const status = buildClaimSummaryCurrencyStatus([kalem('PRINCIPAL', 10_000, 'TRY'), kalem('EXPENSE', 250, currency)]);

    expect(status).toEqual({
      durum: 'PARA_BIRIMI_EKSIK',
      toplamGosterilebilir: false,
      gerekce: 'KALEM_PARA_BIRIMI_EKSIK',
      mesaj: '1 alacak kaleminin para birimi kayıtlı değil. Bu kalemler hiçbir toplama dahil edilmedi; tek toplam gösterilmedi.',
      alacakParaBirimi: null,
      paraBirimleri: ['TRY'],
      paraBirimiEksikKalemSayisi: 1,
      toplamlarParaBirimiBazinda: [
        { paraBirimi: 'TRY', kalemSayisi: 1, totals: { ...SIFIR_TOPLAM, principal: 10_000, grandTotal: 10_000 } },
      ],
    });
  });

  it('para birimi eksik kalem + birden fazla para birimi: iki neden de açıklamada yer alır', () => {
    const status = buildClaimSummaryCurrencyStatus([
      kalem('PRINCIPAL', 10_000, 'USD'),
      kalem('PRINCIPAL', 5_000, 'EUR'),
      kalem('EXPENSE', 250, ''),
      kalem('FEE', 100, null),
    ]);

    expect(status).toMatchObject({
      durum: 'PARA_BIRIMI_EKSIK',
      toplamGosterilebilir: false,
      gerekce: 'KALEM_PARA_BIRIMI_EKSIK',
      alacakParaBirimi: null,
      paraBirimleri: ['EUR', 'USD'],
      paraBirimiEksikKalemSayisi: 2,
    });
    expect(status.mesaj).toBe(
      '2 alacak kaleminin para birimi kayıtlı değil. Bu kalemler hiçbir toplama dahil edilmedi; tek toplam gösterilmedi. ' +
        'Dosyada birden fazla para biriminde alacak kalemi var (EUR, USD). Tutarlar çevrilmedi ve tek toplamda ' +
        'birleştirilmedi; toplamlar para birimi bazında gösterilir.',
    );
    expect(status.toplamlarParaBirimiBazinda.map((row) => [row.paraBirimi, row.kalemSayisi, row.totals.grandTotal])).toEqual([
      ['EUR', 1, 5_000],
      ['USD', 1, 10_000],
    ]);
  });

  it('her kalem tam bir kez sayılır: para birimi bazındaki kalem sayıları + para birimi eksik kalemler = kalem sayısı', () => {
    const items = [...paraBirimiyle('USD'), ...paraBirimiyle('EUR'), kalem('EXPENSE', 1, ''), kalem('PRINCIPAL', 2, 'TRY')];
    const status = buildClaimSummaryCurrencyStatus(items);

    const sayilan = status.toplamlarParaBirimiBazinda.reduce((sum, row) => sum + row.kalemSayisi, 0);
    expect(sayilan + status.paraBirimiEksikKalemSayisi).toBe(items.length);
    expect(status.toplamlarParaBirimiBazinda.map((row) => [row.paraBirimi, row.kalemSayisi])).toEqual([
      ['EUR', 14],
      ['TRY', 1],
      ['USD', 14],
    ]);
  });

  it('girdiyi değiştirmez (salt okuma)', () => {
    const items = [kalem('PRINCIPAL', 10_000, 'USD'), kalem('PRINCIPAL', 5_000, ' eur ')];
    const snapshot = JSON.parse(JSON.stringify(items));

    buildClaimSummaryCurrencyStatus(items);

    expect(items).toEqual(snapshot);
  });
});

describe('ClaimItemService.getClaimSummary — mevcut alanlar ve para birimi bağlamı', () => {
  /** Kayıt satırı: Prisma'nın döndürdüğü biçim (tutar Decimal). */
  const satir = (itemType: string, amount: number | string, currency: string) => ({
    itemType,
    amount: new Prisma.Decimal(amount),
    currency,
    status: 'ACTIVE',
  });

  function makeService(rows: unknown[]) {
    const findMany = jest.fn(async () => rows);
    const prisma: any = { claimItem: { findMany } };
    return { service: new ClaimItemService(prisma), findMany };
  }

  const ETIKETLER: Record<string, string> = {
    PRINCIPAL: 'Asıl Alacak',
    INTEREST: 'Faiz',
    PRE_INTEREST: 'Takip Öncesi Faiz',
    POST_INTEREST: 'Takip Sonrası Faiz',
    EXPENSE: 'Masraf',
    FEE: 'Harç',
    ATTORNEY_FEE: 'Vekalet Ücreti',
    PENALTY: 'Tazminat',
    CHECK_PENALTY: 'Çek Tazminatı',
    CONTRACTUAL_PENALTY: 'Cezai Şart',
    TAX_KDV: 'KDV',
    TAX_BSMV: 'BSMV',
    TAX_KKDF: 'KKDF',
    OTHER: 'Diğer',
  };

  describe('mevcut alanlar DEĞİŞMEDİ (karakterizasyon — düzeltmesiz servis koduyla da geçer)', () => {
    it.each(['TRY', 'USD'])('%s dosya, her türden kalem: currency / items / totals / calculationDate', async (currency) => {
      const { service, findMany } = makeService(HER_TURDEN.map((row) => satir(row.itemType, row.amount, currency)));

      const summary = await service.getClaimSummary('tenant-1', 'case-1', '2026-03-01');

      expect(findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', caseId: 'case-1', status: 'ACTIVE' },
        orderBy: { sortOrder: 'asc' },
      });
      expect(summary.caseId).toBe('case-1');
      expect(summary.currency).toBe(currency);
      expect(summary.calculationDate).toBe('2026-03-01T00:00:00.000Z');
      expect(summary.totals).toEqual(HER_TURDEN_TOPLAM);
      expect(summary.items).toEqual(
        HER_TURDEN.map((row) => ({ type: row.itemType, label: ETIKETLER[row.itemType], amount: row.amount, count: 1 })),
      );
    });

    it('kalemsiz dosya: currency "TRY", items boş, toplamlar 0', async () => {
      const { service } = makeService([]);

      const summary = await service.getClaimSummary('tenant-1', 'case-1', '2026-03-01');

      expect(summary.currency).toBe('TRY');
      expect(summary.items).toEqual([]);
      expect(summary.totals).toEqual(SIFIR_TOPLAM);
    });

    it('karma dosya: mevcut alanlar çapraz para birimi toplamını ve SON kalemin para birimini taşımayı sürdürür (bilinen kusur; geçerliliği blok bildirir)', async () => {
      const usd = satir('PRINCIPAL', 10_000, 'USD');
      const eur = satir('PRINCIPAL', 5_000, 'EUR');
      const lira = satir('PRINCIPAL', 2_000, 'TRY');

      const trySon = await makeService([usd, eur, lira]).service.getClaimSummary('tenant-1', 'case-1');
      const eurSon = await makeService([usd, lira, eur]).service.getClaimSummary('tenant-1', 'case-1');

      expect([trySon.currency, eurSon.currency]).toEqual(['TRY', 'EUR']);
      for (const summary of [trySon, eurSon]) {
        expect(summary.totals).toEqual({ ...SIFIR_TOPLAM, principal: 17_000, grandTotal: 17_000 });
        expect(summary.items).toEqual([{ type: 'PRINCIPAL', label: 'Asıl Alacak', amount: 17_000, count: 3 }]);
      }
    });
  });

  describe('eklemeli `paraBirimiDurumu` bloğu', () => {
    it.each(['TRY', 'USD'])('%s dosya: tek toplam gösterilebilir; para birimi bazındaki tek satır `totals` ve `currency` ile aynıdır', async (currency) => {
      const { service } = makeService(HER_TURDEN.map((row) => satir(row.itemType, row.amount, currency)));

      const summary = await service.getClaimSummary('tenant-1', 'case-1', '2026-03-01');

      expect(summary.paraBirimiDurumu).toEqual({
        durum: 'TEK_PARA_BIRIMI',
        toplamGosterilebilir: true,
        gerekce: null,
        mesaj: null,
        alacakParaBirimi: summary.currency,
        paraBirimleri: [summary.currency],
        paraBirimiEksikKalemSayisi: 0,
        toplamlarParaBirimiBazinda: [{ paraBirimi: summary.currency, kalemSayisi: 14, totals: summary.totals }],
      });
    });

    it('kalemsiz dosya: KALEM_YOK; tek toplam (0) gösterilebilir', async () => {
      const summary = await makeService([]).service.getClaimSummary('tenant-1', 'case-1');

      expect(summary.paraBirimiDurumu).toMatchObject({
        durum: 'KALEM_YOK',
        toplamGosterilebilir: true,
        alacakParaBirimi: null,
        toplamlarParaBirimiBazinda: [],
      });
    });

    it('karma dosya: tek toplam GÖSTERİLEMEZ; blok kalem sırasından bağımsız ve para birimi bazında', async () => {
      const usd = satir('PRINCIPAL', 10_000, 'USD');
      const eur = satir('PRINCIPAL', 5_000, 'EUR');
      const lira = satir('PRINCIPAL', 2_000, 'TRY');

      const trySon = await makeService([usd, eur, lira]).service.getClaimSummary('tenant-1', 'case-1');
      const eurSon = await makeService([usd, lira, eur]).service.getClaimSummary('tenant-1', 'case-1');

      expect(trySon.paraBirimiDurumu).toMatchObject({
        durum: 'KARMA_PARA_BIRIMI',
        toplamGosterilebilir: false,
        gerekce: 'FARKLI_PARA_BIRIMLERI_TEK_TOPLAMDA_BIRLESTIRILEMEZ',
        alacakParaBirimi: null,
        paraBirimleri: ['EUR', 'TRY', 'USD'],
        toplamlarParaBirimiBazinda: [
          { paraBirimi: 'EUR', kalemSayisi: 1, totals: { ...SIFIR_TOPLAM, principal: 5_000, grandTotal: 5_000 } },
          { paraBirimi: 'TRY', kalemSayisi: 1, totals: { ...SIFIR_TOPLAM, principal: 2_000, grandTotal: 2_000 } },
          { paraBirimi: 'USD', kalemSayisi: 1, totals: { ...SIFIR_TOPLAM, principal: 10_000, grandTotal: 10_000 } },
        ],
      });
      expect(eurSon.paraBirimiDurumu).toEqual(trySon.paraBirimiDurumu);
    });
  });
});
