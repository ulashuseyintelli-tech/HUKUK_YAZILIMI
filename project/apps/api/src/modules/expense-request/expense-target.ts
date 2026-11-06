import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const EXPENSE_TARGET_REQUIRED = 'EXPENSE_TARGET_REQUIRED';
export const EXPENSE_TARGET_MISSING = 'EXPENSE_TARGET_MISSING';
export const EXPENSE_TARGET_INVALID = 'EXPENSE_TARGET_INVALID';

export interface ExpenseTargetCandidate {
  clientId: string;
  name: string;
}

export interface ExpenseTargetStatus {
  candidates: ExpenseTargetCandidate[];
  selectionRequired: boolean;
  available: boolean;
  message: string;
}

type TargetRow = { clientId: string; role: string; tenantId: string; name: string | null; displayName: string | null };
const eligible = (row: TargetRow, tenantId: string) =>
  row.tenantId === tenantId && ['ALACAKLI', 'ORTAK_ALACAKLI'].includes(row.role);

export function expenseTargetStatus(rows: readonly TargetRow[], tenantId: string): ExpenseTargetStatus {
  const candidates = rows.filter(row => eligible(row, tenantId))
    .map(row => ({ clientId: row.clientId, name: row.displayName || row.name || 'Müvekkil' }));
  return {
    candidates,
    available: candidates.length > 0,
    selectionRequired: candidates.length > 1,
    message: candidates.length === 0
      ? 'Dosyaya bağlı uygun alacaklı bulunamadı; masraf talebi oluşturulmadı.'
      : candidates.length > 1
        ? 'Birden fazla alacaklı var; masraf talebi için hedef müvekkili açıkça seçin.'
        : '',
  };
}

export function selectExpenseTarget(status: ExpenseTargetStatus, rawClientId: unknown): string {
  if (rawClientId !== undefined && (typeof rawClientId !== 'string' || !rawClientId.trim())) {
    throw new BadRequestException({ code: EXPENSE_TARGET_INVALID, message: 'Masraf hedefi geçerli bir müvekkil kimliği olmalıdır.' });
  }
  if (rawClientId !== undefined) {
    const selected = status.candidates.find(row => row.clientId === rawClientId);
    if (!selected) throw new BadRequestException({ code: EXPENSE_TARGET_INVALID, message: 'Masraf hedefi bu dosyanın uygun alacaklıları arasında değil.' });
    return selected.clientId;
  }
  if (!status.available) throw new ConflictException({ code: EXPENSE_TARGET_MISSING, message: status.message });
  if (status.selectionRequired) throw new ConflictException({ code: EXPENSE_TARGET_REQUIRED, message: status.message });
  return status.candidates[0].clientId;
}

/** Read projection only; eligibility never supplies actor/action permission. */
export async function loadExpenseTargetStatus(
  db: Pick<Prisma.TransactionClient, 'caseClient'>, caseId: string, tenantId: string,
): Promise<ExpenseTargetStatus> {
  const rows = await db.caseClient.findMany({
    where: { caseId, case: { tenantId }, client: { tenantId } },
    select: { clientId: true, role: true, client: { select: { tenantId: true, name: true, displayName: true } } },
    orderBy: { clientId: 'asc' },
  });
  return expenseTargetStatus(rows.map(row => ({ ...row.client, clientId: row.clientId, role: row.role })), tenantId);
}

/**
 * All four expense writers call this in their writing transaction. The Case row
 * lock also blocks FK-backed CaseClient insertion; row locks protect role,
 * membership and Client tenant changes until the expense commits.
 */
export async function resolveExpenseTarget(
  tx: Prisma.TransactionClient, caseId: string, tenantId: string, rawClientId?: unknown,
): Promise<string> {
  const cases = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Case" WHERE id = ${caseId} AND "tenantId" = ${tenantId} FOR UPDATE`;
  if (!cases.length) throw new NotFoundException('Takip bulunamadı');
  const rows = await tx.$queryRaw<TargetRow[]>`
    SELECT cc."clientId", cc.role, c."tenantId", c.name, c."displayName"
    FROM "CaseClient" cc JOIN "Client" c ON c.id = cc."clientId"
    WHERE cc."caseId" = ${caseId}
    ORDER BY cc."clientId" FOR UPDATE OF cc FOR SHARE OF c`;
  return selectExpenseTarget(expenseTargetStatus(rows, tenantId), rawClientId);
}
