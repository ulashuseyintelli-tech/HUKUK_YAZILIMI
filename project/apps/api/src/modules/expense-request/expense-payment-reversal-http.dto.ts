import { BadRequestException } from '@nestjs/common';

/** Only the correction reason is client input; all financial coordinates are server-derived. */
export function expensePaymentReversalReason(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => key !== 'reason')) {
    throw new BadRequestException('Yalnız ters kayıt gerekçesi gönderilebilir');
  }
  const reason = (body as { reason?: unknown }).reason;
  if (typeof reason !== 'string' || reason.trim().length < 10) {
    throw new BadRequestException('Ters kayıt gerekçesi en az 10 karakter olmalıdır');
  }
  return reason.trim();
}
