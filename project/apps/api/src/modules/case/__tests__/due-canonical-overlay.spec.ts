import { Prisma } from '@prisma/client';
import {
  DUE_CANONICAL_BINDING_AMBIGUOUS,
  DUE_CANONICAL_CURRENCY_MISMATCH,
  DUE_CANONICAL_OVERLAY_FIELDS,
  DUE_OVERLAY_CLAIM_ITEM_SELECT,
  DueCanonicalViewUnsafeError,
  dueSyncSourceDueId,
  overlayDuesWithCanonicalItems,
  type DueOverlayClaimItem,
} from '../due-canonical-overlay';

/** Görünüm kurulmaz; açık uyumsuzluk hatası (409) — yakalanıp döndürülür. */
const unsafeError = (run: () => unknown): DueCanonicalViewUnsafeError => {
  try {
    run();
  } catch (error) {
    if (error instanceof DueCanonicalViewUnsafeError) return error;
    throw error;
  }
  throw new Error('DueCanonicalViewUnsafeError bekleniyordu; görünüm kuruldu');
};

/**
 * Due satırından okuyan çıktılar için "onaylı kanonik değer" görünümü — SAF kural (owner talimatı 19.11.2026).
 * Değerler SENTETİK. Gerçek okuyucularla davranış: due-derived-outputs-canonical.http.db-gated.integration.spec.ts.
 */
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const due = (overrides: Record<string, unknown> = {}) => ({
  id: 'due-1',
  type: 'PRINCIPAL',
  description: 'Sentetik asıl alacak',
  amount: new Prisma.Decimal('1000.00'),
  currency: 'TRY',
  dueDate: d('2025-01-15'),
  interestType: 'YASAL',
  interestTypeCode: 'LEGAL_3095',
  interestRate: null,
  interestStartDate: null,
  interestEndDate: null,
  sortOrder: 1,
  hasKdv: false,
  ...overrides,
});
const item = (overrides: Partial<DueOverlayClaimItem> & Record<string, unknown> = {}): DueOverlayClaimItem => ({
  id: 'claim-1',
  status: 'ACTIVE',
  metadata: { dueSync: { sourceDueId: 'due-1', mappedFrom: 'Due' } },
  amount: new Prisma.Decimal('1200.00'),
  demandedAmount: new Prisma.Decimal('1200.00'),
  currency: 'TRY',
  dueDate: d('2025-02-20'),
  description: 'Sentetik asıl alacak (kalemde düzeltildi)',
  interestType: 'YASAL',
  interestTypeCode: 'LEGAL_3095',
  interestRate: null,
  interestStartDate: d('2025-03-10'),
  interestEndDate: null,
  ...overrides,
});

describe('Due görünümü onaylı değeri bağlı kanonik kalemden okur', () => {
  it('bağlı ETKİN kalem: tutar, vade, açıklama ve faiz alanları kalemden; Due\'ya özgü alanlar Due\'dan', () => {
    const source = due();
    const view = overlayDuesWithCanonicalItems([source], [item()]);

    expect(view.dues).toHaveLength(1);
    expect(view.dues[0]).toMatchObject({
      id: 'due-1',
      type: 'PRINCIPAL', // alt tür Due'dan
      sortOrder: 1,
      hasKdv: false,
      description: 'Sentetik asıl alacak (kalemde düzeltildi)',
      currency: 'TRY',
      dueDate: d('2025-02-20'),
      interestStartDate: d('2025-03-10'),
    });
    expect(Number(view.dues[0].amount)).toBe(1200);
    expect(view.sources.get('due-1')).toEqual({ source: 'CLAIM_ITEM', claimItemId: 'claim-1', claimItemStatus: 'ACTIVE' });
    expect(view.excludedDueIds).toEqual([]);
    // Girdi satırı değişmez (kopya döner).
    expect(Number(source.amount)).toBe(1000);
    expect(source.interestStartDate).toBeNull();
  });

  it('kanonik tutar demandedAmount\'tır; yoksa amount aynası kullanılır', () => {
    const viaDemanded = overlayDuesWithCanonicalItems([due()], [item({ demandedAmount: new Prisma.Decimal('1500.00'), amount: new Prisma.Decimal('1.00') })]);
    expect(Number(viaDemanded.dues[0].amount)).toBe(1500);
    const viaMirror = overlayDuesWithCanonicalItems([due()], [item({ demandedAmount: undefined, amount: new Prisma.Decimal('1300.00') })]);
    expect(Number(viaMirror.dues[0].amount)).toBe(1300);
  });

  it('kalemde açıkça boş olan faiz alanı Due\'daki eski değeri SİLER; kalemde vade boşsa Due vadesi kalır', () => {
    const view = overlayDuesWithCanonicalItems(
      [due({ interestType: 'TICARI', interestStartDate: d('2024-01-01') })],
      [item({ interestType: null, interestTypeCode: null, interestStartDate: null, dueDate: null })],
    );
    expect(view.dues[0]).toMatchObject({ interestType: null, interestTypeCode: null, interestStartDate: null, dueDate: d('2025-01-15') });
  });

  it('yalnız okuyucunun Due\'da yüklediği alanlar bindirilir; kalemde yüklenmemiş alan Due\'yu değiştirmez', () => {
    const slim = { id: 'due-1', type: 'PRINCIPAL', amount: new Prisma.Decimal('1000.00'), currency: 'TRY' };
    const view = overlayDuesWithCanonicalItems([slim], [item()]);
    expect(Object.keys(view.dues[0]).sort()).toEqual(['amount', 'currency', 'id', 'type']);
    expect(Number(view.dues[0].amount)).toBe(1200);

    const partialItem = overlayDuesWithCanonicalItems([due()], [{ id: 'claim-1', status: 'ACTIVE', metadata: item().metadata, currency: 'TRY' }]);
    expect(Number(partialItem.dues[0].amount)).toBe(1000);
    expect(partialItem.dues[0].description).toBe('Sentetik asıl alacak');
  });

  it.each(['CANCELLED', 'WAIVED'])('bağlı kalem %s: Due görünümden çıkar', (status) => {
    const view = overlayDuesWithCanonicalItems([due(), due({ id: 'due-2', type: 'EXPENSE' })], [item({ status })]);
    expect(view.dues.map((row) => row.id)).toEqual(['due-2']);
    expect(view.excludedDueIds).toEqual(['due-1']);
    expect(view.sources.get('due-1')).toEqual({ source: 'CLAIM_ITEM', claimItemId: 'claim-1', claimItemStatus: status });
  });

  it('bağlı kalem tahsil edilmişse satır kalır (tahsilat çıktılarda ayrıca düşülür)', () => {
    const view = overlayDuesWithCanonicalItems([due()], [item({ status: 'COLLECTED' })]);
    expect(view.dues).toHaveLength(1);
    expect(Number(view.dues[0].amount)).toBe(1200);
  });

  it('bağlı kalemi olmayan Due (nafaka) ve işaretsiz kalem: Due aynen', () => {
    const nafaka = due({ id: 'due-n', type: 'NAFAKA' });
    const view = overlayDuesWithCanonicalItems([nafaka], [item({ metadata: null }), item({ id: 'claim-2', metadata: { dueSync: { sourceDueId: 'baska-due' } } })]);
    expect(view.dues).toEqual([nafaka]);
    expect(view.dues[0]).not.toBe(nafaka);
    expect(view.sources.get('due-n')).toEqual({ source: 'DUE', claimItemId: null, claimItemStatus: null });
  });

  it('aynı Due\'yu gösteren birden çok kalem (bütünlük ihlali): tahmin yapılmaz, Due\'ya da dönülmez — çıktı durur', () => {
    const error = unsafeError(() =>
      overlayDuesWithCanonicalItems([due(), due({ id: 'due-2' })], [item(), item({ id: 'claim-2', demandedAmount: new Prisma.Decimal('9999.00') })], { caseId: 'case-1' }),
    );
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({
      code: DUE_CANONICAL_BINDING_AMBIGUOUS,
      caseId: 'case-1',
      rows: [{ dueId: 'due-1', claimItemIds: ['claim-1', 'claim-2'], dueCurrency: 'TRY', claimItemCurrency: null }],
    });
    expect(JSON.stringify(error.getResponse())).not.toContain('9999'); // hata yanıtı tutar taşımaz
  });

  it('Due sırası korunur', () => {
    const view = overlayDuesWithCanonicalItems(
      [due({ id: 'a' }), due({ id: 'b' }), due({ id: 'c' })],
      [item({ id: 'ci-b', metadata: { dueSync: { sourceDueId: 'b' } }, status: 'CANCELLED' }), item({ id: 'ci-c', metadata: { dueSync: { sourceDueId: 'c' } } })],
    );
    expect(view.dues.map((row) => row.id)).toEqual(['a', 'c']);
  });

  describe('para birimi bindirilmez, yeniden etiketlenmez; uyuşmazlıkta çıktı durur (owner E4)', () => {
    it('Due ile bağlı kalemin para birimi farklıysa: eski Due değerine dönülmez, bütün ayrışan satırlarla 409', () => {
      const dues = [due(), due({ id: 'due-2', type: 'EXPENSE' }), due({ id: 'due-3', currency: 'EUR' })];
      const items = [
        item({ currency: 'USD' }),
        item({ id: 'claim-3', metadata: { dueSync: { sourceDueId: 'due-3' } }, currency: 'EUR' }),
      ];
      const error = unsafeError(() => overlayDuesWithCanonicalItems(dues, items, { caseId: 'case-1' }));
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toEqual({
        code: DUE_CANONICAL_CURRENCY_MISMATCH,
        message: expect.stringContaining('para birimi uyuşmayan 1 kayıt'),
        caseId: 'case-1',
        rows: [{ dueId: 'due-1', claimItemIds: ['claim-1'], dueCurrency: 'TRY', claimItemCurrency: 'USD' }],
      });
      expect((error.getResponse() as { message: string }).message).toContain('çevrilmedi');
      // Girdi değişmez; hata yanıtı tutar taşımaz.
      expect(Number(dues[0].amount)).toBe(1000);
      expect(JSON.stringify(error.getResponse())).not.toMatch(/1000|1200/);
    });

    it.each([
      ['kalemin para birimi yüklenmemiş', due(), item({ currency: undefined }), 'TRY', null],
      ['kalemin para birimi boş', due(), item({ currency: '  ' }), 'TRY', null],
      ['Due para birimi yüklenmemiş', { id: 'due-1', type: 'PRINCIPAL', amount: new Prisma.Decimal('1000.00') }, item(), null, 'TRY'],
    ] as Array<[string, Record<string, unknown> & { id: string }, DueOverlayClaimItem, string | null, string | null]>)(
      'doğrulanamayan para birimi (%s): çıktı durur',
      (_label, row, claim, dueCurrency, claimItemCurrency) => {
        const error = unsafeError(() => overlayDuesWithCanonicalItems([row], [claim]));
        expect(error.getResponse()).toMatchObject({
          code: DUE_CANONICAL_CURRENCY_MISMATCH,
          caseId: null,
          rows: [{ dueId: 'due-1', dueCurrency, claimItemCurrency }],
        });
      },
    );

    it('ayrışma yalnız bağlı kalemi olan Due\'da aranır: bağsız Due farklı para biriminde olabilir (Due aynen)', () => {
      const nafaka = due({ id: 'due-n', type: 'NAFAKA', currency: 'USD' });
      const view = overlayDuesWithCanonicalItems([due(), nafaka], [item()]);
      expect(view.dues.map((row) => [row.id, row.currency, Number(row.amount)])).toEqual([['due-1', 'TRY', 1200], ['due-n', 'USD', 1000]]);
    });

    it('boşluk / büyük-küçük harf farkı ayrışma değildir; görünümdeki para birimi yine Due\'nun kendi değeridir', () => {
      const view = overlayDuesWithCanonicalItems([due({ currency: ' try ' })], [item({ currency: 'TRY' })]);
      expect(Number(view.dues[0].amount)).toBe(1200);
      expect(view.dues[0].currency).toBe(' try ');
    });

    it('aynı para biriminde bindirme para birimini değiştirmez', () => {
      const view = overlayDuesWithCanonicalItems([due({ currency: 'USD' })], [item({ currency: 'USD' })]);
      expect([Number(view.dues[0].amount), view.dues[0].currency]).toEqual([1200, 'USD']);
    });

    it('onaylı iptal para birimi ayrışmasından bağımsızdır: satır yine görünümden çıkar', () => {
      const view = overlayDuesWithCanonicalItems([due()], [item({ currency: 'USD', status: 'CANCELLED' })]);
      expect(view.dues).toEqual([]);
      expect(view.excludedDueIds).toEqual(['due-1']);
    });
  });

  it.each([
    [{ dueSync: { sourceDueId: 'due-1' } }, 'due-1'],
    [{ dueSync: { sourceDueId: '' } }, null],
    [{ dueSync: { sourceDueId: 7 } }, null],
    [{ dueSync: [] }, null],
    [{ kdv: { rate: 20 } }, null],
    [null, null],
    ['due-1', null],
    [['due-1'], null],
  ] as Array<[unknown, string | null]>)('köprü işareti okunur: %j → %s', (metadata, expected) => {
    expect(dueSyncSourceDueId(metadata)).toBe(expected);
  });

  it('kalem seçimi bindirilen bütün alanları ve işareti taşır', () => {
    for (const field of DUE_CANONICAL_OVERLAY_FIELDS) {
      expect((DUE_OVERLAY_CLAIM_ITEM_SELECT as Record<string, boolean>)[field]).toBe(true);
    }
    expect(DUE_OVERLAY_CLAIM_ITEM_SELECT).toMatchObject({ id: true, status: true, metadata: true, demandedAmount: true, currency: true });
    expect(DUE_CANONICAL_OVERLAY_FIELDS as readonly string[]).not.toContain('currency'); // karşılaştırılır, bindirilmez
  });
});
