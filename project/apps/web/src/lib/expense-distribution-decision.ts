// D4 — Masraf DAĞITIM UYGUNLUĞU kararı (onay / ret): okuma durumunun ve sunucu yanıtlarının saf sınıflandırması.
//
// Bu karar ödeme, müvekkile gönderim ya da finalize DEĞİLDİR. Yalnız masrafın tahsilat dağıtımında büroya geri
// ödenebilecek masraf sayılıp sayılmayacağını belirler (API: dağıtım kesinleştirmesinde geri ödeme satırı yalnız
// `expenseApprovalStatus = APPROVED` masrafı kabul eder). Karar yalnız PENDING_APPROVAL'dan verilir; sonra değişmez.
//
// Yetki (genel onaycı: PARTNER ya da onay yetkisi verilmiş avukat) ve kişi düzeyi öz-onay kararını SUNUCU verir
// (#3072, O-7). Web rol, rütbe ya da hesap kimliği karşılaştırmasıyla kural ÜRETMEZ; yalnız sunucunun yanıtını açıklar.
// Okuma alanları eksik ya da tanınmazsa durum TAHMİN EDİLMEZ ve karar düğmesi sunulmaz.
import type { ActionErrorContract } from './action-error';

export type DistributionApprovalStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export type ExpenseDistributionState =
  | { kind: 'KNOWN'; approvalStatus: DistributionApprovalStatus; cancelled: boolean }
  | { kind: 'UNKNOWN' };

const APPROVAL_STATUSES: ReadonlySet<string> = new Set(['PENDING_APPROVAL', 'APPROVED', 'REJECTED']);

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

/**
 * `GET /expense-requests/by-case/:caseId` satırından dağıtım durumu. İki alan da sunucudan gelmelidir:
 * `expenseApprovalStatus` (dağıtım ekseni) ve `status` (yaşam döngüsü; CANCELLED karar engelidir).
 */
export function readDistributionState(row: unknown): ExpenseDistributionState {
  const r = record(row);
  const approval = r?.expenseApprovalStatus;
  const status = r?.status;
  if (typeof approval !== 'string' || !APPROVAL_STATUSES.has(approval)) return { kind: 'UNKNOWN' };
  if (typeof status !== 'string' || status.trim() === '') return { kind: 'UNKNOWN' };
  return { kind: 'KNOWN', approvalStatus: approval as DistributionApprovalStatus, cancelled: status === 'CANCELLED' };
}

/** Karar düğmeleri yalnız bekleyen ve iptal edilmemiş talepte sunulur. */
export function canOfferDistributionDecision(state: ExpenseDistributionState | undefined): boolean {
  return state?.kind === 'KNOWN' && state.approvalStatus === 'PENDING_APPROVAL' && !state.cancelled;
}

export const DISTRIBUTION_STATUS_LABEL: Record<DistributionApprovalStatus, string> = {
  PENDING_APPROVAL: 'Onay bekliyor',
  APPROVED: 'Onaylandı: dağıtımda geri ödemeye uygun',
  REJECTED: 'Reddedildi: dağıtımda geri ödemeye alınmaz',
};

export const DISTRIBUTION_APPROVE_EXPLANATION =
  'Onay, bu masrafın tahsilat dağıtımında büroya geri ödenebilecek masraf sayılmasını sağlar. Ödeme yapmaz, müvekkile bir şey göndermez ve talebi sonlandırmaz. Karar verildikten sonra bu ekrandan değiştirilemez.';

export const DISTRIBUTION_REJECT_EXPLANATION =
  'Ret, bu masrafın tahsilat dağıtımında geri ödemeye alınmamasını sağlar. Talebi iptal etmez; ödeme ya da müvekkile bildirim değildir. Karar verildikten sonra bu ekrandan değiştirilemez.';

export const DISTRIBUTION_DECISION_FALLBACK = 'Dağıtım kararı kaydedilemedi.';

export const DISTRIBUTION_MESSAGES = {
  NOT_ELIGIBLE:
    'Bu kararı verme yetkiniz yok. Masraf dağıtım kararını büro ortağı (PARTNER) ya da onay yetkisi verilmiş avukat verebilir. Hiçbir değişiklik yapılmadı.',
  SELF_APPROVAL:
    'Bu masraf talebini siz ya da aynı kişiye ait başka bir hesap oluşturdu; dağıtım kararını başka bir yetkili vermeli. Hiçbir değişiklik yapılmadı.',
  VIEWER: 'Görüntüleyici rolüyle dağıtım kararı verilemez. Hiçbir değişiklik yapılmadı.',
  CASE_CLOSED: 'Dosya kapalı olduğu için dağıtım kararı verilemez. Hiçbir değişiklik yapılmadı.',
  CASE_ARCHIVED: 'Dosya arşivde olduğu için dağıtım kararı verilemez. Hiçbir değişiklik yapılmadı.',
  NOTE_REQUIRED: 'Ret gerekçesi zorunludur; boş ya da yalnız boşluktan oluşan gerekçe kabul edilmez.',
  CONFLICT: 'Talep aynı anda başka bir işlemle değiştirildi; kararınız uygulanmadı.',
  NOT_PENDING: 'Talep artık onay beklemiyor; kararınız uygulanmadı.',
  CANCELLED: 'Talep iptal edilmiş; dağıtım kararı verilemez.',
} as const;

export type DistributionDecisionFailureKind =
  | 'NOT_ELIGIBLE'
  | 'SELF_APPROVAL'
  | 'VIEWER'
  | 'CASE_GATE'
  | 'NOTE_REQUIRED'
  | 'CONFLICT'
  | 'NOT_PENDING'
  | 'CANCELLED'
  | 'OTHER';

export interface DistributionDecisionFailure {
  kind: DistributionDecisionFailureKind;
  message: string;
  /** Sunucu talebin durumunun değiştiğini bildirdi: talep yeniden okunmalı (karar YENİDEN GÖNDERİLMEZ). */
  reread: boolean;
}

/**
 * `raw`: istemcinin fırlattığı ham hata (`body` + `status`). `actionError`: aynı hatanın `toActionError` ile güvenli
 * kullanıcı yüzeyi; sınıflanamayan her durumda mesaj BUNDAN gelir (bilinmeyen hata gizlenmez).
 *
 * Sunucu sözleşmesi (expense-request.service.ts `decideDistribution`, CPE kapısı, VIEWER kapısı):
 *  - 403 `EXPENSE_APPROVER_NOT_ELIGIBLE` · 400 `SELF_APPROVAL_FORBIDDEN` · 403 `VIEWER_WRITE_DENIED`
 *  - 403 `GATE_BLOCKED` + `blockedBy.gateCode` (CASE_CLOSED / CASE_ARCHIVED)
 *  - 409 (eşzamanlı değişti)
 *  - 400 KODSUZ: "İptal edilmiş masraf talebi …", "Yalnız PENDING_APPROVAL masraf …", "Reddetme gerekçesi (note) zorunludur."
 * Kodsuz üç yanıt yalnız metinle tanınır; metin değişirse yanıt OTHER olarak aynen gösterilir (güvenli taraf).
 */
export function classifyDistributionDecisionFailure(
  raw: unknown,
  actionError: ActionErrorContract,
): DistributionDecisionFailure {
  const e = record(raw);
  const body = record(e?.body) ?? record(record(e?.response)?.data);
  const status = typeof e?.status === 'number' ? e.status : undefined;
  const code = typeof body?.code === 'string' ? body.code : undefined;
  const message = typeof body?.message === 'string' ? body.message : '';

  if (code === 'EXPENSE_APPROVER_NOT_ELIGIBLE') return { kind: 'NOT_ELIGIBLE', message: DISTRIBUTION_MESSAGES.NOT_ELIGIBLE, reread: false };
  if (code === 'SELF_APPROVAL_FORBIDDEN') return { kind: 'SELF_APPROVAL', message: DISTRIBUTION_MESSAGES.SELF_APPROVAL, reread: false };
  if (code === 'VIEWER_WRITE_DENIED') return { kind: 'VIEWER', message: DISTRIBUTION_MESSAGES.VIEWER, reread: false };
  if (code === 'GATE_BLOCKED') {
    const gateCode = record(body?.blockedBy)?.gateCode;
    if (gateCode === 'CASE_CLOSED') return { kind: 'CASE_GATE', message: DISTRIBUTION_MESSAGES.CASE_CLOSED, reread: false };
    if (gateCode === 'CASE_ARCHIVED') return { kind: 'CASE_GATE', message: DISTRIBUTION_MESSAGES.CASE_ARCHIVED, reread: false };
  }
  if (status === 409) return { kind: 'CONFLICT', message: DISTRIBUTION_MESSAGES.CONFLICT, reread: true };
  if (status === 400 && code === undefined) {
    if (message.startsWith('İptal edilmiş masraf talebi')) return { kind: 'CANCELLED', message: DISTRIBUTION_MESSAGES.CANCELLED, reread: true };
    if (message.startsWith('Yalnız PENDING_APPROVAL masraf')) return { kind: 'NOT_PENDING', message: DISTRIBUTION_MESSAGES.NOT_PENDING, reread: true };
    if (message.includes('gerekçesi (note) zorunlu')) return { kind: 'NOTE_REQUIRED', message: DISTRIBUTION_MESSAGES.NOTE_REQUIRED, reread: false };
  }
  return { kind: 'OTHER', message: actionError.message, reread: false };
}
