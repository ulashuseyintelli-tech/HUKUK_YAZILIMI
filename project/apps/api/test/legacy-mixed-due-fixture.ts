import { PrismaClient } from '@prisma/client';
import { OfficeApprovalService } from '../src/modules/office-approval/office-approval.service';
import { ensureCaseFinanceWriter } from './case-finance-writer-fixture';
import { createApprovedDue } from './due-create-approval-fixture';
import { resolveTestDatabaseUrl } from './test-db-env';

/**
 * Historical read/refusal fixtures only. FR-7 forbids new cross-currency admission.
 * Create a valid native Due through the real HTTP route, then establish the former
 * persisted currency on that exact Due/ClaimItem pair in the disposable test DB.
 * This does not represent a successful cross-currency HTTP write.
 *
 * `writerUserId`: `post`'un isteği gönderdiği hesap. Due ekleme dosya düzeyi mali yazma yetkisi ister (owner kararı
 * 18.11.2026, K3); fikstür o hesabı bu dosyada yetkili yapar (yetki kuralının kendisi ayrı spec'te sınanır).
 *
 * `app`: Due ekleme iki kişi onayına tabidir (owner kararı 19.11.2026); fikstür talebi gerçek uçtan açar ve aynı
 * uygulamanın onay servisiyle, talep edenden FARKLI onay yetkili bir hesapla onaylar (kalem üretimdeki yoldan oluşur).
 */
export async function addLegacyMixedDueFixture(
  db: PrismaClient,
  post: (path: string, body: Record<string, unknown>) => PromiseLike<{ status: number; body: any }>,
  caseId: string,
  due: Record<string, unknown>,
  currency: string,
  writerUserId: string,
  app: { get<T>(token: new (...args: any[]) => T): T },
): Promise<void> {
  if (!resolveTestDatabaseUrl(process.env)) throw new Error('Legacy fixture requires an explicit safe TEST_DATABASE_URL');
  await ensureCaseFinanceWriter(db, caseId, writerUserId);
  const parent = await db.case.findUniqueOrThrow({ where: { id: caseId }, select: { tenantId: true, currency: true } });
  const { dueId } = await createApprovedDue({
    db,
    approvals: app.get(OfficeApprovalService),
    post,
    caseId,
    due: { ...due, currency: parent.currency },
    requesterUserId: writerUserId,
  });
  await db.$transaction(async (tx) => {
    const changedDue = await tx.due.updateMany({ where: { id: dueId, caseId, case: { tenantId: parent.tenantId } }, data: { currency } });
    const changedClaim = await tx.claimItem.updateMany({
      where: { tenantId: parent.tenantId, caseId, metadata: { path: ['dueSync', 'sourceDueId'], equals: dueId } },
      data: { currency },
    });
    if (changedDue.count !== 1 || changedClaim.count !== 1) throw new Error('Historical fixture must identify exactly one linked Due/ClaimItem pair');
  });
}
