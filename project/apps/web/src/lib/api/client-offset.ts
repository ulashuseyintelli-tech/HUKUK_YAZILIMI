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
    const resp = await apiClient.get<{ data: OffsetEligibility }>(
      `/client-offsets/client/${clientId}/eligibility?currency=${encodeURIComponent(currency)}`,
    );
    return resp.data.data;
  },

  /** Non-persistent önizleme (D4). Hesap backend'de; FE yalnız render eder (D3). */
  async preview(input: PreviewOffsetInput): Promise<OffsetPreview> {
    const resp = await apiClient.post<{ data: OffsetPreview }>('/client-offsets/preview', input);
    return resp.data.data;
  },

  /** Mahsup uygula (kind=APPLY). PARTNER/MANAGER-only (backend 403). */
  async create(input: CreateOffsetInput): Promise<CreateOffsetResult> {
    const resp = await apiClient.post<{ data: CreateOffsetResult }>('/client-offsets', input);
    return resp.data.data;
  },

  /** Mahsup iptali (kind=REVERSAL). PARTNER/MANAGER-only + reason≥10. */
  async reverse(offsetId: string, input: ReverseOffsetInput): Promise<ReverseOffsetResult> {
    const resp = await apiClient.post<{ data: ReverseOffsetResult }>(`/client-offsets/${offsetId}/reverse`, input);
    return resp.data.data;
  },

  /** Müvekkilin mahsupları (APPLY+REVERSAL). */
  async list(clientId: string, filters: { currency?: string; kind?: 'APPLY' | 'REVERSAL' } = {}): Promise<ClientOffsetRecord[]> {
    const qs = new URLSearchParams();
    if (filters.currency) qs.set('currency', filters.currency);
    if (filters.kind) qs.set('kind', filters.kind);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const resp = await apiClient.get<{ data: ClientOffsetRecord[] }>(`/client-offsets/client/${clientId}${suffix}`);
    return resp.data.data;
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
