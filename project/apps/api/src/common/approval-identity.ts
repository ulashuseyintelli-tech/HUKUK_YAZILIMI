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
