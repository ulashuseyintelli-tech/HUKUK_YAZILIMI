import type { Prisma } from '@prisma/client';

/**
 * Lock before reading the financial lifecycle; the caller re-reads through the same tx.
 * Callers: ExpenseRequestService update/send/remind/cancel/delete/payment/reversal/finalize;
 * ExpenseNotificationService.createOverdueTask. Distribution approval is a separate axis.
 */
export async function lockExpenseRequest(
  tx: Prisma.TransactionClient,
  tenantId: string,
  requestId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "ExpenseRequest" WHERE "id" = ${requestId} AND "tenantId" = ${tenantId} FOR UPDATE`;
}
