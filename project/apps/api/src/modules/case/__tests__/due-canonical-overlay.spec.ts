import { Prisma } from '@prisma/client';
import {
  DUE_CANONICAL_OVERLAY_FIELDS,
  DUE_OVERLAY_CLAIM_ITEM_SELECT,
  dueSyncSourceDueId,
  overlayDuesWithCanonicalItems,
  type DueOverlayClaimItem,
} from '../due-canonical-overlay';

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
    expect(view.currencyMismatchDueIds).toEqual([]);
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
    const slim = { id: 'due-1', type: 'PRINCIPAL', amount: new Prisma.Decimal('1000.00') };
    const view = overlayDuesWithCanonicalItems([slim], [item()]);
    expect(Object.keys(view.dues[0]).sort()).toEqual(['amount', 'id', 'type']);
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

  it('aynı Due\'yu gösteren birden çok kalem (bütünlük ihlali): tahmin yapılmaz, Due aynen', () => {
    const view = overlayDuesWithCanonicalItems([due()], [item(), item({ id: 'claim-2', demandedAmount: new Prisma.Decimal('9999.00') })]);
    expect(Number(view.dues[0].amount)).toBe(1000);
    expect(view.sources.get('due-1')).toEqual({ source: 'DUE', claimItemId: null, claimItemStatus: null });
  });

  it('Due sırası korunur', () => {
    const view = overlayDuesWithCanonicalItems(
      [due({ id: 'a' }), due({ id: 'b' }), due({ id: 'c' })],
      [item({ id: 'ci-b', metadata: { dueSync: { sourceDueId: 'b' } }, status: 'CANCELLED' }), item({ id: 'ci-c', metadata: { dueSync: { sourceDueId: 'c' } } })],
    );
    expect(view.dues.map((row) => row.id)).toEqual(['a', 'c']);
  });

  describe('para birimi bindirilmez, yeniden etiketlenmez', () => {
    it('Due ile bağlı kalemin para birimi farklıysa tahmin yapılmaz: Due aynen, ayrışma listesinde', () => {
      const view = overlayDuesWithCanonicalItems([due()], [item({ currency: 'USD' })]);
      expect(view.dues[0]).toMatchObject({ currency: 'TRY', description: 'Sentetik asıl alacak', interestStartDate: null });
      expect(Number(view.dues[0].amount)).toBe(1000); // kalemin 1.200 USD'si TRY etiketiyle gösterilmez
      expect(view.sources.get('due-1')).toEqual({ source: 'DUE', claimItemId: 'claim-1', claimItemStatus: 'ACTIVE' });
      expect(view.currencyMismatchDueIds).toEqual(['due-1']);
      expect(view.excludedDueIds).toEqual([]);
    });

    it('Due para birimi yüklü ama kalemin para birimi yüklenmemişse doğrulanamaz: Due aynen', () => {
      const view = overlayDuesWithCanonicalItems([due()], [item({ currency: undefined })]);
      expect(Number(view.dues[0].amount)).toBe(1000);
      expect(view.currencyMismatchDueIds).toEqual(['due-1']);
    });

    it('boşluk / büyük-küçük harf farkı ayrışma değildir; görünümdeki para birimi yine Due\'nun kendi değeridir', () => {
      const view = overlayDuesWithCanonicalItems([due({ currency: ' try ' })], [item({ currency: 'TRY' })]);
      expect(Number(view.dues[0].amount)).toBe(1200);
      expect(view.dues[0].currency).toBe(' try ');
      expect(view.currencyMismatchDueIds).toEqual([]);
    });

    it('aynı para biriminde bindirme para birimini değiştirmez', () => {
      const view = overlayDuesWithCanonicalItems([due({ currency: 'USD' })], [item({ currency: 'USD' })]);
      expect([Number(view.dues[0].amount), view.dues[0].currency]).toEqual([1200, 'USD']);
    });

    it('onaylı iptal para birimi ayrışmasından bağımsızdır: satır yine görünümden çıkar', () => {
      const view = overlayDuesWithCanonicalItems([due()], [item({ currency: 'USD', status: 'CANCELLED' })]);
      expect(view.dues).toEqual([]);
      expect(view.excludedDueIds).toEqual(['due-1']);
      expect(view.currencyMismatchDueIds).toEqual([]);
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
