import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createCanonicalSourceHash } from '../accounting-journal/accounting-journal-source-hash';
import { checkStageExpenseIdempotencyKey } from './stage-expense-idempotency';

export interface PaymentInput {
  idempotencyKey: string;
  amount: number;
  paymentDate: Date;
  method: string;
  reference?: string | null;
  notes?: string | null;
  matchedBy?: string;
  /** Existing opaque legacy receipt reference, not document validation or receipt acceptance. */
  receiptDocId?: string | null;
}

function optionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new BadRequestException(`${field} metin olmalıdır`);
  return value;
}

/** Caller: ExpenseRequestService.recordPayment, including its legacy receive alias. */
export function normalizeExpensePayment(
  tenantId: string,
  requestId: string,
  userId: string,
  input: PaymentInput,
) {
  if ([tenantId, requestId, userId].some(value => typeof value !== 'string' || value.length === 0)) {
    throw new BadRequestException('Ödeme bağlamı geçersiz');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('Ödeme girdisi geçersiz');
  }
  const key = checkStageExpenseIdempotencyKey(input.idempotencyKey);
  if (!key.ok) throw new BadRequestException({ code: key.code, message: key.message });
  if (!key.key) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Ödeme için idempotencyKey zorunludur' });
  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0) {
    throw new BadRequestException('Ödeme tutarı pozitif ve sonlu bir sayı olmalıdır');
  }
  const amount = new Prisma.Decimal(input.amount);
  if (amount.decimalPlaces() > 2 || amount.gt('9999999999999.99')) {
    throw new BadRequestException('Ödeme tutarı en fazla iki ondalık basamak ve Decimal(15,2) sınırında olmalıdır');
  }
  if (!(input.paymentDate instanceof Date) || !Number.isFinite(input.paymentDate.getTime())) {
    throw new BadRequestException('Ödeme tarihi geçersiz');
  }
  if (typeof input.method !== 'string' || input.method.trim().length === 0) {
    throw new BadRequestException('Ödeme yöntemi metin olmalıdır');
  }
  const matchedBy = input.matchedBy ?? 'MANUAL';
  if (typeof matchedBy !== 'string' || matchedBy.trim().length === 0) {
    throw new BadRequestException('Eşleştirme kaynağı geçersiz');
  }
  const reference = optionalText(input.reference, 'reference');
  const notes = optionalText(input.notes, 'notes');
  const receiptDocId = optionalText(input.receiptDocId, 'receiptDocId');
  const receiptProvided = input.receiptDocId !== undefined;
  const paymentDate = new Date(input.paymentDate.getTime());
  const fingerprint = createCanonicalSourceHash({
    tenantId, requestId, userId, amount: amount.toFixed(2), paymentDate: paymentDate.toISOString(),
    method: input.method, reference, notes, matchedBy, receiptProvided, receiptDocId,
  }, { nonAuthoritativeMetadataKeys: [] });
  return {
    idempotencyKey: key.key, postingKey: `expense-payment:${key.key}`, fingerprint,
    amount, paymentDate, method: input.method, reference, notes, matchedBy, receiptProvided, receiptDocId,
  };
}
