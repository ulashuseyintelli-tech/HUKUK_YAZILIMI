import { apiClient } from './client';

/**
 * TM3 Faz C C-2b — Müvekkil Mahsubu (ClientOffset) API katmanı.
 * Backend: client-offset.controller.ts. Çift zarf (apiClient {data} + controller {data}) → resp.data.data.
 * KURAL: frontend HESAP YAPMAZ — eligibility + preview backend'den gelir; tutar/net backend otoritesi (D2/D3/D4).
 */

// ===== eligibility =====
export interface EligiblePayableBucket {
  payableCaseId: string;
  payableCaseClientId: string;
  clientId: string;
  currency: string;
  availableOutstanding: string; // Decimal-string
  caseNumber: string;
  role: string;
}
export interface EligibleExpenseRequest {
  expenseCaseId: string;
  expenseRequestId: string;
  clientId: string;
  currency: string;
  unpaidAmount: string; // Decimal-string
  caseNumber: string;
  requestStatus: string;
}
export interface OffsetEligibility {
  clientId: string;
  currency: string;
  /** C-2a: actor mahsup uygulayabilir mi (PARTNER/MANAGER). YALNIZ UX — backend enforcement ayrı. */
  canApply: boolean;
  eligiblePayableBuckets: EligiblePayableBucket[];
  eligibleExpenseRequests: EligibleExpenseRequest[];
}

// ===== S8-A — Mahsup Önerisi (Client Offset Recommendation) =====
/**
 * S8-A: mevcut eligibility'den mahsup ÖNERİSİ türetir. KURALLAR (design-gate):
 *  - Kaynak YALNIZCA eligiblePayableBuckets (mevcut CLIENT_PAYABLE). "Dağıtım Bekleyen"/pendingDistribution ASLA.
 *  - OTOMATİK EŞLEME YOK: yalnız tek-seçenekli bacak ön-seçilir (1 kaynak / 1 masraf); birden çoksa o tarafı kullanıcı seçer.
 *    Pairing SIRALANMAZ/SEÇİLMEZ (ADR "otomatik eşleme YOK" korunur).
 *  - UI HESAPLAMAZ: önerilen tutar bağlayıcı değil; backend preview + apply re-validate otoritedir. Sonuç tutarı
 *    iki backend decimal-string'inden BİREBİR küçüğüdür (float aritmetiği YOK → drawer preview byte-eşleşmesi bozulmaz).
 */
export interface OffsetRecommendation {
  mode: 'exact' | 'multi';
  /** ön-seç (yalnız tek-seçenekli bacak). */
  payableCaseClientId?: string;
  expenseRequestId?: string;
  /** yalnız mode==='exact' (1×1): drawer'a verilecek faithful decimal-string. */
  amount?: string;
  /** gösterim (exact). */
  suggestedAmount?: string;
  sourceLabel?: string;
  bucketCount: number;
  expenseCount: number;
  currency: string;
}

/**
 * İki decimal-string'in numerik olarak küçüğünü ORİJİNAL string olarak döndürür.
 * Number YALNIZ karşılaştırma içindir; sonuç float aritmetiğiyle ÜRETİLMEZ (gönderilen tutar backend string'inin birebir kopyası).
 */
export function minDecimalString(a: string, b: string): string {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na <= nb ? a : b;
  return Number.isFinite(na) ? a : b;
}

export function buildOffsetRecommendation(elig?: OffsetEligibility | null): OffsetRecommendation | null {
  if (!elig) return null;
  const buckets = elig.eligiblePayableBuckets ?? [];
  const expenses = elig.eligibleExpenseRequests ?? [];
  if (buckets.length === 0 || expenses.length === 0) return null; // mahsuba uygun çift yok
  const currency = elig.currency || 'TRY';
  const payableSeed = buckets.length === 1 ? buckets[0] : null;
  const expenseSeed = expenses.length === 1 ? expenses[0] : null;

  if (payableSeed && expenseSeed) {
    // Tutar = iki backend decimal-string'inden BİREBİR küçüğü (float/Number ile para HESABI YOK; yalnız karşılaştırma).
    const amount = minDecimalString(payableSeed.availableOutstanding, expenseSeed.unpaidAmount);
    if (!(Number(amount) >= 0.01)) return null; // sub-cent eşik kontrolü (karşılaştırma; tutar üretmez) → kart gizlenir
    return {
      mode: 'exact',
      payableCaseClientId: payableSeed.payableCaseClientId,
      expenseRequestId: expenseSeed.expenseRequestId,
      amount,
      suggestedAmount: amount,
      sourceLabel: `${payableSeed.caseNumber || payableSeed.payableCaseId} (${payableSeed.role})`,
      bucketCount: 1,
      expenseCount: 1,
      currency,
    };
  }

  // Çoklu: pairing SEÇİLMEZ/SIRALANMAZ; yalnız tek-seçenekli bacak (varsa) ön-seçilir, tutar önerilmez.
  return {
    mode: 'multi',
    payableCaseClientId: payableSeed?.payableCaseClientId,
    expenseRequestId: expenseSeed?.expenseRequestId,
    bucketCount: buckets.length,
    expenseCount: expenses.length,
    currency,
  };
}

// ===== preview (non-persistent; hesap BACKEND'de) =====
export interface OffsetPreview {
  payableBefore: string;
  payableAfter: string;
  expenseBefore: string;
  expenseAfter: string;
  netBefore: string;
  netAfter: string;
  maxAmount: string;
  netUnchanged: boolean;
}

// ===== offset kaydı (list) =====
export interface ClientOffsetRecord {
  id: string;
  clientId: string;
  currency: string;
  amount: string; // Decimal-string
  kind: 'APPLY' | 'REVERSAL';
  payableCaseId: string;
  payableCaseClientId: string;
  expenseCaseId: string;
  expenseRequestId: string;
  reversesOffsetId: string | null;
  reason: string | null;
  createdAt: string;
}


export interface OffsetActorProjection {
  id: string | null;
  displayName: string;
}

export interface ClientOffsetAuditEventProjection {
  action: string;
  actor: OffsetActorProjection;
  createdAt: string;
  safeSummary: string;
}

export interface ClientOffsetDetail {
  offset: {
    id: string;
    clientId: string;
    kind: 'APPLY' | 'REVERSAL';
    amount: string;
    currency: string;
    reason: string | null;
    createdAt: string;
    createdBy: OffsetActorProjection;
    reversesOffsetId: string | null;
    reversedByOffsetId: string | null;
  };
  sourceSummary: {
    payable: {
      caseId: string;
      caseNumber: string | null;
      caseLabel: string;
      caseClientId: string;
      role: string | null;
      label: string;
    };
    expense: {
      caseId: string;
      caseNumber: string | null;
      caseLabel: string;
      expenseRequestId: string;
      status: string | null;
      label: string;
    };
  };
  auditEvents: ClientOffsetAuditEventProjection[];
}
export interface OffsetLegSelectionInput {
  clientId: string;
  currency: string;
  payableCaseId: string;
  payableCaseClientId: string;
  expenseCaseId: string;
  expenseRequestId: string;
  amount: string;
}
export type PreviewOffsetInput = OffsetLegSelectionInput;
export interface CreateOffsetInput extends OffsetLegSelectionInput {
  /** Tenant-scoped duplicate guard; client üretir (önizlenen offset başına tek). */
  idempotencyKey: string;
}
export interface CreateOffsetResult {
  created: boolean;
  offsetId: string;
  idempotentReplay?: boolean;
}
export interface ReverseOffsetInput {
  reason: string; // trimmed ≥10
  idempotencyKey: string;
}
export interface ReverseOffsetResult {
  created: boolean;
  offsetId: string;
  reversesOffsetId?: string;
  idempotentReplay?: boolean;
}

export const clientOffsetApi = {
  /** Uygun payable bucket + ödenmemiş ExpenseRequest + canApply (read-only; otomatik eşleme YOK). */
  async getEligibility(clientId: string, currency = 'TRY'): Promise<OffsetEligibility> {
    const resp = await apiClient.get<OffsetEligibility>(
      `/client-offsets/client/${clientId}/eligibility?currency=${encodeURIComponent(currency)}`,
    );
    return resp.data;
  },

  /** Non-persistent önizleme (D4). Hesap backend'de; FE yalnız render eder (D3). */
  async preview(input: PreviewOffsetInput): Promise<OffsetPreview> {
    const resp = await apiClient.post<OffsetPreview>('/client-offsets/preview', input);
    return resp.data;
  },

  /** Mahsup uygula (kind=APPLY). PARTNER/MANAGER-only (backend 403). */
  async create(input: CreateOffsetInput): Promise<CreateOffsetResult> {
    const resp = await apiClient.post<CreateOffsetResult>('/client-offsets', input);
    return resp.data;
  },

  /** Mahsup iptali (kind=REVERSAL). PARTNER/MANAGER-only + reason≥10. */
  async reverse(offsetId: string, input: ReverseOffsetInput): Promise<ReverseOffsetResult> {
    const resp = await apiClient.post<ReverseOffsetResult>(`/client-offsets/${offsetId}/reverse`, input);
    return resp.data;
  },

  /** Müvekkilin mahsupları (APPLY+REVERSAL). */
  async list(clientId: string, filters: { currency?: string; kind?: 'APPLY' | 'REVERSAL' } = {}): Promise<ClientOffsetRecord[]> {
    const qs = new URLSearchParams();
    if (filters.currency) qs.set('currency', filters.currency);
    if (filters.kind) qs.set('kind', filters.kind);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const resp = await apiClient.get<ClientOffsetRecord[]>(`/client-offsets/client/${clientId}${suffix}`);
    return resp.data;
  },
  /** Tek mahsup için read-only source/audit detail projection. */
  async detail(offsetId: string): Promise<ClientOffsetDetail> {
    const resp = await apiClient.get<ClientOffsetDetail>(`/client-offsets/${offsetId}/detail`);
    return resp.data;
  },
};

/** Backend hata mesajını/kodunu kullanıcı diline çevirir (mesaj backend otoritesini DEĞİŞTİRMEZ). */
export function friendlyOffsetError(err: unknown): string {
  const e = err as { message?: string; status?: number; body?: { code?: string; message?: string } };
  const code = e?.body?.code;
  const msg = e?.body?.message || e?.message || '';
  if (e?.status === 403 || /CLIENT_OFFSET_FORBIDDEN|yetki/i.test(`${code} ${msg}`)) {
    return 'Bu işlem için yetkiniz bulunmuyor (yalnız Partner/Manager mahsup yapabilir).';
  }
  if (code === 'OFFSET_EXCEEDS_AVAILABLE' || /aşıyor|exceeds/i.test(msg)) {
    return 'Mahsup tutarı uygun bakiyeyi aşıyor. Önizlemedeki azami tutarı geçmeyin.';
  }
  if (code === 'IDEMPOTENCY_KEY_CONFLICT' || /idempotency|farklı payload/i.test(msg)) {
    return 'Bu işlem anahtarı farklı bir tutarla zaten kullanılmış. Drawer\'ı kapatıp yeniden deneyin.';
  }
  if (code === 'OFFSET_ALREADY_REVERSED' || /zaten iptal/i.test(msg)) {
    return 'Bu mahsup zaten iptal edilmiş.';
  }
  if (/cross-currency|geçersiz|yabancı|CANCELLED/i.test(msg)) {
    return `Mahsup doğrulaması başarısız: ${msg}`;
  }
  return msg || 'Mahsup işlemi başarısız.';
}
