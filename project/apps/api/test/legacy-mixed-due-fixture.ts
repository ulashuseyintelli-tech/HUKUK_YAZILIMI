import { PrismaClient } from '@prisma/client';
import { resolveTestDatabaseUrl } from './test-db-env';

/**
 * Historical read/refusal fixtures only. FR-7 forbids new cross-currency admission.
 * Create a valid native Due through the real HTTP route, then establish the former
 * persisted currency on that exact Due/ClaimItem pair in the disposable test DB.
 * This does not represent a successful cross-currency HTTP write.
 */
export async function addLegacyMixedDueFixture(
  db: PrismaClient,
  post: (path: string, body: Record<string, unknown>) => PromiseLike<{ status: number; body: any }>,
  caseId: string,
  due: Record<string, unknown>,
  currency: string,
): Promise<void> {
  if (!resolveTestDatabaseUrl(process.env)) throw new Error('Legacy fixture requires an explicit safe TEST_DATABASE_URL');
  const parent = await db.case.findUniqueOrThrow({ where: { id: caseId }, select: { tenantId: true, currency: true } });
  const res = await post(`/cases/${caseId}/dues`, { ...due, currency: parent.currency });
  if (res.status !== 201 || !res.body.id) throw new Error(`Native Due fixture admission failed: ${res.status}`);
  await db.$transaction(async (tx) => {
    const changedDue = await tx.due.updateMany({ where: { id: res.body.id, caseId, case: { tenantId: parent.tenantId } }, data: { currency } });
    const changedClaim = await tx.claimItem.updateMany({
      where: { tenantId: parent.tenantId, caseId, metadata: { path: ['dueSync', 'sourceDueId'], equals: res.body.id } },
      data: { currency },
    });
    if (changedDue.count !== 1 || changedClaim.count !== 1) throw new Error('Historical fixture must identify exactly one linked Due/ClaimItem pair');
  });
}
