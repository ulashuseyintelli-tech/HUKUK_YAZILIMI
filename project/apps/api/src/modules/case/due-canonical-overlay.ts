/**
 * Due (dosya kalemi) satırından OKUYAN çıktılar için "onaylı kanonik değer" görünümü — owner talimatı 19.11.2026:
 * "onaylı kanonik bilgi yerine eski Due verisini okuyan çıktı yollarının düzeltmesi".
 *
 * Sorun: kalem ekranından iki kişi onayıyla yapılan tutar / vade / faiz değişikliği Due satırına geri YAZILMAZ
 * (REC-AUTH-009: kalem → Due ters yazım yasak). Due satırından okuyan çıktılar ("UYAP'a Aktar" XML'i, hesap özetinin
 * eski alanları, açılış masrafı matrahı, belge tutarları, mali özet, portal) bu yüzden onay öncesi değeri gösteriyordu.
 *
 * Kural (tek): Due'nun bağlı kanonik kalemi varsa — işaret `ClaimItem.metadata.dueSync.sourceDueId` — onaylı değer
 * KALEMDEN okunur. Bu modül Due satırının bir KOPYASININ üstüne kalemin tutarını, vadesini, açıklamasını ve faiz
 * alanlarını bindirir. Due'ya özgü bilgi (alt tür: kira / aidat / prim …, sıra, KDV, kesinleşme) Due'dan kalır. Hiçbir
 * satır YAZILMAZ; her okuyucu kendi sınıflandırma / eşleme mantığını aynen korur, yalnız girdisi bu görünüm olur.
 *
 *  - Bağlı kalem yok (kanonik kalem üretmeyen tür: nafaka)            → Due aynen.
 *  - Bağlı kalem ETKİN ya da TAHSİL EDİLMİŞ                           → kalem değerleri bindirilir.
 *  - Bağlı kalem onayla İPTAL ya da FERAGAT edilmiş, Due hâlâ duruyor → satır görünümden ÇIKAR (iptal / feragat onaylı
 *    kanonik bilgidir). Tahsil edilmiş kalem kalır: tahsilat çıktılarda ayrıca düşülür.
 *  - Aynı Due'yu gösteren birden çok kalem (bütünlük ihlali; yazım yolu zaten reddeder) → tahmin yapılmaz, Due aynen.
 *  - Due ile bağlı kalemin PARA BİRİMİ farklı (yalnız geçmiş kayıtta olabilir; yeni yazımı FR-7 kabul denetimi
 *    engeller) → tahmin yapılmaz, Due aynen. Para birimi hiçbir durumda BİNDİRİLMEZ ve yeniden etiketlenmez: bir
 *    para birimindeki tutar ötekinin etiketiyle gösterilmez; okuyucuların para birimi doğrulamaları (dosya ↔ kayıt
 *    uyuşmazlığı, karma para birimi, TL tarifesi matrahı) değişmeden çalışır.
 *
 * SAF modül: veritabanı / servis bağımlılığı yok.
 *
 * Çağrıldığı yerler:
 * - UyapCaseMapperService.mapCaseToTakipTalebi() → POST /uyap-export/single · batch, GET /uyap-export/download/:caseId
 * - CaseService.getCalculationSummary() → GET /cases/:id/calculation-summary (eski alanların asıl alacak girdisi)
 * - CaseService.getCaseFinanceSummary() → GET /cases/:id/finance-summary
 * - ExpenseRequestService.createOpeningExpenseSet() → açılış masraf seti (asıl alacak + vade)
 * - DocumentService.prepareDocumentData() / DocumentTemplateService.prepareVariablesFromCase() → belge tutarları
 * - PortalService.getCaseDetail() → GET /portal/cases/:id (müvekkil portalı kalem görünümü)
 */

/** Kalemden okunan (Due görünümüne bindirilen) alanlar. Para birimi BİLEREK yok (yukarıdaki son kural). */
export const DUE_CANONICAL_OVERLAY_FIELDS = [
  'amount',
  'dueDate',
  'description',
  'interestType',
  'interestTypeCode',
  'interestRate',
  'interestStartDate',
  'interestEndDate',
] as const;

/** Bağlı kalemi bu durumlardaysa Due satırı çıktı görünümünden çıkar. */
export const DUE_OVERLAY_EXCLUDED_ITEM_STATUSES = ['CANCELLED', 'WAIVED'] as const;

/** Okuyucunun yüklediği Due satırı: en az kimlik; öteki alanlar okuyucunun seçimine göre vardır. */
export interface DueOverlayRow {
  readonly id: string;
  readonly [field: string]: unknown;
}

/** Bindirme için kalemden gereken alanlar (okuyucu `DUE_OVERLAY_CLAIM_ITEM_SELECT` ile yükler). */
export interface DueOverlayClaimItem {
  readonly id: string;
  readonly status: string;
  readonly metadata: unknown;
  readonly amount?: unknown;
  readonly demandedAmount?: unknown;
  readonly currency?: string | null;
  readonly dueDate?: Date | null;
  readonly description?: string | null;
  readonly interestType?: string | null;
  readonly interestTypeCode?: string | null;
  readonly interestRate?: unknown;
  readonly interestStartDate?: Date | null;
  readonly interestEndDate?: Date | null;
}

/** Prisma `select`: bindirmenin okuduğu kalem alanları (okuyucular aynı seçimi kullanır). */
export const DUE_OVERLAY_CLAIM_ITEM_SELECT = {
  id: true,
  status: true,
  metadata: true,
  amount: true,
  demandedAmount: true,
  currency: true,
  dueDate: true,
  description: true,
  interestType: true,
  interestTypeCode: true,
  interestRate: true,
  interestStartDate: true,
  interestEndDate: true,
} as const;

export type DueCanonicalValueSource = 'DUE' | 'CLAIM_ITEM';

export interface DueCanonicalView<T extends DueOverlayRow> {
  /** Çıktılarda kullanılacak satırlar (Due sırası korunur; iptal / feragat edilmiş kalemin Due'su yoktur). */
  readonly dues: T[];
  /** Due kimliği → değerin kaynağı ve bağlı kalem (denetim / test için). */
  readonly sources: ReadonlyMap<string, { source: DueCanonicalValueSource; claimItemId: string | null; claimItemStatus: string | null }>;
  /** Bağlı kalemi iptal / feragat edildiği için görünümden çıkan Due kimlikleri. */
  readonly excludedDueIds: string[];
  /** Bağlı kalemiyle para birimi ayrıştığı için bindirilmeyen (aynen okunan) Due kimlikleri. */
  readonly currencyMismatchDueIds: string[];
}

/** Kalemin köprü işareti: hangi Due'dan oluştuğu. İşaret yoksa null. */
export function dueSyncSourceDueId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const dueSync = (metadata as { dueSync?: unknown }).dueSync;
  if (!dueSync || typeof dueSync !== 'object' || Array.isArray(dueSync)) return null;
  const sourceDueId = (dueSync as { sourceDueId?: unknown }).sourceDueId;
  return typeof sourceDueId === 'string' && sourceDueId ? sourceDueId : null;
}

const has = (row: object, field: string): boolean => Object.prototype.hasOwnProperty.call(row, field);

/** Karşılaştırma için para birimi kodu (boşluk / büyük-küçük harf farkı ayrışma sayılmaz); değer yoksa null. */
const currencyCode = (value: unknown): string | null => {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return code || null;
};

/**
 * Due satırlarını bağlı kanonik kalemlerin onaylı değerleriyle görünüme çevirir. Girdi satırları DEĞİŞMEZ (kopya
 * döner). Yalnız okuyucunun Due'da yüklediği alanlar bindirilir: Due'da seçilmemiş bir alan görünüme eklenmez.
 */
export function overlayDuesWithCanonicalItems<T extends DueOverlayRow>(
  dues: readonly T[],
  claimItems: readonly DueOverlayClaimItem[],
): DueCanonicalView<T> {
  const boundByDueId = new Map<string, DueOverlayClaimItem[]>();
  for (const item of claimItems) {
    const dueId = dueSyncSourceDueId(item.metadata);
    if (!dueId) continue;
    const list = boundByDueId.get(dueId);
    if (list) list.push(item);
    else boundByDueId.set(dueId, [item]);
  }

  const view: T[] = [];
  const sources = new Map<string, { source: DueCanonicalValueSource; claimItemId: string | null; claimItemStatus: string | null }>();
  const excludedDueIds: string[] = [];
  const currencyMismatchDueIds: string[] = [];

  for (const due of dues) {
    const bound = boundByDueId.get(due.id) ?? [];
    if (bound.length !== 1) {
      // Bağlı kalem yok ya da belirsiz (birden çok işaret): Due aynen; tahmin yapılmaz.
      view.push({ ...due });
      sources.set(due.id, { source: 'DUE', claimItemId: null, claimItemStatus: null });
      continue;
    }
    const item = bound[0];
    if ((DUE_OVERLAY_EXCLUDED_ITEM_STATUSES as readonly string[]).includes(item.status)) {
      excludedDueIds.push(due.id);
      sources.set(due.id, { source: 'CLAIM_ITEM', claimItemId: item.id, claimItemStatus: item.status });
      continue;
    }

    if (has(due, 'currency') && currencyCode(due.currency) !== currencyCode(item.currency)) {
      // Para birimi ayrışması (ya da kalemin para birimi yüklenmemiş): tutar başka etiketle gösterilmez; Due aynen.
      view.push({ ...due });
      sources.set(due.id, { source: 'DUE', claimItemId: item.id, claimItemStatus: item.status });
      currencyMismatchDueIds.push(due.id);
      continue;
    }

    const canonical: Record<string, unknown> = {
      // Kanonik tutar `demandedAmount`; `amount` onun uyumluluk aynasıdır (claim-item-amount-contract).
      amount: item.demandedAmount ?? item.amount,
      // Kalemde vade boş olabilir; Due'nun vadesi zorunludur → boş değer Due'daki vadeyi silmez.
      dueDate: item.dueDate ?? undefined,
      description: item.description,
      interestType: item.interestType,
      interestTypeCode: item.interestTypeCode,
      interestRate: item.interestRate,
      interestStartDate: item.interestStartDate,
      interestEndDate: item.interestEndDate,
    };
    const merged: Record<string, unknown> = { ...due };
    for (const field of DUE_CANONICAL_OVERLAY_FIELDS) {
      if (!has(due, field)) continue; // okuyucu bu alanı yüklemedi
      const value = canonical[field];
      if (value === undefined) continue; // kalemde bu alan yüklenmedi / vade boş
      merged[field] = value;
    }
    view.push(merged as T);
    sources.set(due.id, { source: 'CLAIM_ITEM', claimItemId: item.id, claimItemStatus: item.status });
  }

  return { dues: view, sources, excludedDueIds, currencyMismatchDueIds };
}
