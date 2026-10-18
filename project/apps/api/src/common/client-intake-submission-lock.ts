import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

// The statement after a lock wait must observe the winner's committed source state.
export const CLIENT_INTAKE_WRITE_TX = { isolationLevel: 'ReadCommitted' as const };

/** Callers: ClientIntakeReviewService claim/bulkReview/reject; ClientIntakePromotionService.promote. */
export async function lockClientIntakeSubmission(tx: Prisma.TransactionClient, tenantId: string, submissionId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "ClientIntakeSubmission"
    WHERE "id" = ${submissionId} AND "tenantId" = ${tenantId} FOR UPDATE`;
  if (rows.length !== 1) throw new NotFoundException('Gönderim bulunamadı');
}

/** Callers: ClientIntakeReviewService.reviewField; ClientIntakePromotionService.promoteSoftField/promoteAddress. */
export async function lockClientIntakeFieldSubmission(tx: Prisma.TransactionClient, tenantId: string, fieldId: string): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT s."id" FROM "ClientIntakeSubmission" s
    JOIN "ClientIntakeField" f ON f."submissionId" = s."id"
    WHERE f."id" = ${fieldId} AND s."tenantId" = ${tenantId} FOR UPDATE OF s`;
  if (rows.length !== 1) throw new NotFoundException('Alan bulunamadı');
  return rows[0].id;
}
