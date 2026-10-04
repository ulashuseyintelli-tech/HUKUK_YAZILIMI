import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { isOfficeWriteDeniedForRole } from './office-write-role.policy';

/**
 * B10 (owner GO 2026-09-27) — YETKİ KONTROLÜ ile MALİ YAZMA arasındaki yarışın kapatılması.
 *
 * Sorun (ölçüldü, 2026-09-26 karar paketi §7.4): yürütme yolları aktör yetkisini transaction DIŞINDA okuyup
 * sonra ayrı bir transaction'da yazıyordu. Arada commit edilen bir yetki iptali (PUT/PATCH /lawyers/:id
 * `canApproveOfficeActions=false` / rütbe düşürme, DELETE /lawyers/:id → Lawyer.isActive + User.isActive=false)
 * yazmayı DURDURMUYORDU (READ COMMITTED, kilitsiz okuma).
 *
 * Çözüm: yürütme transaction'ı İLK mali yazmadan ÖNCE aktörün `Lawyer` ve `User` satırlarını `FOR SHARE` ile
 * kilitler ve yetkiyi bu kilit ALTINDA yeniden değerlendirir. Geri alma yolları bu satırları UPDATE eder
 * (satır kilidi), dolayısıyla:
 *  - iptal ÖNCE commit ettiyse: FOR SHARE en son commit edilmiş satırı okur → yetki yok → 403, yazma yok;
 *  - yürütme kilidi ÖNCE aldıysa: iptalin UPDATE'i yürütme commit/rollback olana kadar BEKLER; yürütme,
 *    kararın verildiği andaki geçerli yetkiyle tamamlanır, iptal ondan sonra uygulanır.
 * Kilit SIRASI geri alma yollarıyla AYNIDIR (LawyerService.delete: önce Lawyer, sonra User) → iki taraf
 * birbirini döngüsel beklemez.
 *
 * SINIR (bilinçli): `StaffMember` bağlantısı eklemek User satırında yalnız `FOR KEY SHARE` alır ve `FOR SHARE`
 * ile ÇAKIŞMAZ — bu yol bir yetki iptali olarak serileştirilmez. `User.role`'ü değiştiren HTTP yolu yoktur.
 */
export async function lockExecutionActorRows(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Lawyer" WHERE "userId" = ${userId} FOR SHARE`;
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR SHARE`;
}

/**
 * B4 (owner GO 2026-09-27) — VIEWER mali işlem YÜRÜTEMEZ (payout kesinleştirme, dağıtım post'u, FD yayın /
 * yeniden deneme / geri alma / yerine koyma / kayıtlı karar kurtarma), bağlı avukatı PARTNER/MANAGER ya da
 * delege olsa bile. Yüklem OFFICE AK-1a ile AYNIDIR; rol yürütme anında DB'den (kilit altında) okunur.
 * Okuma yüklemleri (`isApproverEligible`, `PayoutApprovalPolicy.isEligible`, `isDisclosureApproverEligible`)
 * DEĞİŞMEZ — onlar inbox/detay görünürlüğünde de kullanılır.
 */
export const FINANCIAL_EXECUTION_DENIED_VIEWER = 'FINANCIAL_EXECUTION_DENIED_VIEWER';

export function assertFinancialExecutionRole(role: unknown): void {
  if (isOfficeWriteDeniedForRole(role)) {
    throw new ForbiddenException({
      code: FINANCIAL_EXECUTION_DENIED_VIEWER,
      message: 'Görüntüleyici (VIEWER) rolü mali işlem yürütemez; bağlı avukatın rütbesi veya delegasyonu bu sınırı aşmaz.',
    });
  }
}

/**
 * Kilitle + rolü oku + rol sınırını uygula. Yol-özel yetki yüklemi, çağıran tarafından AYNI `tx` ile
 * (kilit altında) değerlendirilir.
 */
export async function lockAndAssertExecutionRole(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await lockExecutionActorRows(tx, userId);
  const actor = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
  assertFinancialExecutionRole(actor?.role);
}
