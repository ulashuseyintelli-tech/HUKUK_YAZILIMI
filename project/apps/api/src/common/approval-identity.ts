import type { Prisma } from '@prisma/client';
import { isValidTckn } from './identity-validation.util';

/**
 * F02-A — Onay ayrılığı için KİŞİ kimliği (OFF/OD-11: self-approval Person-identity düzeyinde engellenir).
 *
 * Tek kaynak: bir hesabın kişi-kimliği adayları, aynı tenant'taki bağlı Lawyer / StaffMember kartının
 * GEÇERLİ TCKN'sidir (yalnız rakamlar). İki hesap aynı kişidir ⇔ hesap aynı VEYA aday kümeleri kesişir.
 *
 * Bu modül `common/` altındadır ki genel onay motoru (OfficeApprovalService) ve domain'e ait onay akışları
 * (ör. ClientFinancialDisclosureApprovalService) AYNI yüklemi kullansın; FD servisi office-approval modülüne
 * bağımlı olmadan kişi düzeyine çıkar (kod tekrarı yok, drift yok).
 *
 * BİLİNEN SINIR (F02 karar listesi K-A1): kartsız hesabın aday kümesi BOŞTUR → kartsız talep eden ile aynı
 * kişinin kartlı hesabı ayrı kişi gibi görünür. Bu yüklem kimlik kanıtı ÜRETMEZ; mevcut kanıtı tüketir.
 *
 * Sorgular SIRALIDIR: interaktif transaction istemcisi eşzamanlı sorgu çalıştırmaz.
 */
export type ApprovalIdentityDb = Pick<Prisma.TransactionClient, 'user'>;

export async function resolveApprovalIdentityCandidates(
  db: ApprovalIdentityDb,
  userId: string,
  tenantId: string,
): Promise<Set<string>> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      lawyer: { select: { tenantId: true, tckn: true } },
      staffMember: { select: { tenantId: true, tckn: true } },
    },
  });
  const candidates = new Set<string>();
  if (user?.lawyer && user.lawyer.tenantId === tenantId && isValidTckn(user.lawyer.tckn)) {
    candidates.add(String(user.lawyer.tckn).replace(/\D/g, ''));
  }
  if (user?.staffMember && user.staffMember.tenantId === tenantId && isValidTckn(user.staffMember.tckn)) {
    candidates.add(String(user.staffMember.tckn).replace(/\D/g, ''));
  }
  return candidates;
}

/** Aynı hesap ya da aynı tenant'ta geçerli TCKN kesişimi → aynı kişi. */
export async function isSameApprovalIdentity(
  db: ApprovalIdentityDb,
  userIdA: string,
  userIdB: string,
  tenantId: string,
): Promise<boolean> {
  if (userIdA === userIdB) return true;
  const candidatesA = await resolveApprovalIdentityCandidates(db, userIdA, tenantId);
  const candidatesB = await resolveApprovalIdentityCandidates(db, userIdB, tenantId);
  for (const candidate of candidatesA) {
    if (candidatesB.has(candidate)) return true;
  }
  return false;
}

// ───────────────────────── K-A1 SINIR DİLİMİ ─────────────────────────
/**
 * K-A1 SINIR (owner kararı 29–30.10.2026: "a′ + sınır, sıralı") — kişi kimliği KANITI zorunluluğu.
 *
 * Bayrak depodaki env-bayrak konvansiyonudur (bkz. EXPENSE_REMAINING_GATE_ENABLED); varsayılan KAPALI → davranış
 * DEĞİŞMEZ. Canlıda açılması, kartsız hesap SAYIMI + kart EŞLEMESİ tamamlandıktan sonra AYRI yayın onayıyla yapılır
 * (owner: "Canlı etkinleştirme, sayım ve eşleme sonrasında ayrı yayın onayıyla"). Yeni altyapı değildir.
 */
export const APPROVAL_IDENTITY_PROOF_FLAG = 'OFFICE_APPROVAL_IDENTITY_PROOF_REQUIRED';

/** 403 kodu — talep eden YA DA karar veren hesabın kişi kimliği kanıtı yok (kart yok / kartta geçerli TCKN yok). */
export const APPROVAL_IDENTITY_UNPROVEN = 'APPROVAL_IDENTITY_UNPROVEN';

/**
 * Öz-onaya DUYARLI türler (owner karar listesi K-A1-sınır): COLLECTION_VOID, FINANCIAL_CASE_CLOSE,
 * CLAIM_ITEM_HIGH_IMPACT_CHANGE ve FD onayı. Değerler enum/sabitlerle BİREBİR aynıdır (saf spec drift'i yakalar);
 * policy-engine ya da collection modülüne import bağımlılığı bilinçli olarak kurulmaz.
 */
export const APPROVAL_IDENTITY_PROOF_SENSITIVE_ACTION_CODES: ReadonlySet<string> = new Set([
  'COLLECTION_VOID',
  'FINANCIAL_CASE_CLOSE',
  'CLAIM_ITEM_HIGH_IMPACT_CHANGE',
  'CLIENT_FINANCIAL_DISCLOSURE_APPROVE',
]);

export type ApprovalIdentityParty = 'REQUESTER' | 'APPROVER' | 'OFFICE_APPROVER' | 'CONTENT_APPROVER';

export function isApprovalIdentityProofRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[APPROVAL_IDENTITY_PROOF_FLAG]?.toLowerCase() === 'true';
}

/**
 * Verilen taraflardan kişi kimliği KANITSIZ olanlar: hesap yok ya da aday kümesi BOŞ (kart yok / geçerli TCKN yok).
 * Bayrak KAPALI → her zaman [] (hiçbir sorgu çalışmaz). Çağıran boş olmayan sonucu 403'e çevirir (fail-closed).
 * Sorgular SIRALIDIR (interaktif transaction istemcisi).
 */
export async function findUnprovenApprovalIdentities(
  db: ApprovalIdentityDb,
  tenantId: string,
  parties: ReadonlyArray<{ party: ApprovalIdentityParty; userId: string | null | undefined }>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ApprovalIdentityParty[]> {
  if (!isApprovalIdentityProofRequired(env)) return [];
  const unproven: ApprovalIdentityParty[] = [];
  for (const { party, userId } of parties) {
    if (!userId) { unproven.push(party); continue; }
    const candidates = await resolveApprovalIdentityCandidates(db, userId, tenantId);
    if (candidates.size === 0) unproven.push(party);
  }
  return unproven;
}

const PARTY_LABEL: Record<ApprovalIdentityParty, string> = {
  REQUESTER: 'talep edenin',
  APPROVER: 'karar verenin',
  OFFICE_APPROVER: 'ofis onaylayıcısının',
  CONTENT_APPROVER: 'içerik onaylayıcısının',
};

/** Onaylayanın gördüğü uyarı (owner: "talep edenin kişi kartı yok — kart bağlayın"). Kişisel veri içermez. */
export function approvalIdentityUnprovenMessage(unproven: ReadonlyArray<ApprovalIdentityParty>): string {
  const who = unproven.map((p) => PARTY_LABEL[p]).join(' ve ');
  return `Kişi kimliği kanıtlanamadı: ${who} kişi kartı (geçerli TCKN) yok — kart bağlayın.`;
}
