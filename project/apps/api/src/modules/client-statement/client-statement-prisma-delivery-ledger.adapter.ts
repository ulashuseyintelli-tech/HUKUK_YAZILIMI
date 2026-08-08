import { Injectable } from '@nestjs/common';
import {
  ClientStatementDeliveryStatus,
  Prisma,
  type ClientStatementDeliveryLedger,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  CLIENT_STATEMENT_DELIVERY_LOCK_TIMEOUT_MINUTES,
  CLIENT_STATEMENT_DELIVERY_MAX_ATTEMPTS,
  computeNextRetryAt,
  decideDeliveryClaim,
  truncateLedgerError,
  type ClientStatementDeliveryLedgerPort,
  type ClientStatementDeliveryLedgerRecord,
  type ClientStatementDeliveryLedgerReservation,
} from './client-statement-delivery-ledger.contract';

export class ClientStatementDeliveryLedgerInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClientStatementDeliveryLedgerInvariantError';
  }
}

/**
 * X3-B03 — C3 teslim defteri portunun Prisma adaptörü.
 *
 * Çağrıldığı yerler:
 * - ClientStatementMonthlyDeliveryService.processTarget() → claim/markSent/markFailed
 *
 * Yalnız claim/retry metadata'sı yazar. PDF Buffer, render/body içeriği veya log payload'ı
 * bu adaptörün girdi modeline alınmaz ve kalıcılaştırılmaz.
 */
@Injectable()
export class ClientStatementPrismaDeliveryLedgerAdapter implements ClientStatementDeliveryLedgerPort {
  constructor(private readonly prisma: PrismaService) {}

  async claim(
    input: ClientStatementDeliveryLedgerReservation,
  ): Promise<ClientStatementDeliveryLedgerRecord | null> {
    try {
      const created = await this.prisma.clientStatementDeliveryLedger.create({
        data: {
          tenantId: input.tenantId,
          clientId: input.clientId,
          statementId: input.statementId,
          periodKey: input.periodKey,
          recipientEmail: input.recipientEmail,
          dedupeKey: input.dedupeKey,
          status: ClientStatementDeliveryStatus.PENDING,
          attempts: 1,
          reservedAt: input.now,
          lastAttemptAt: input.now,
          nextRetryAt: null,
          sentAt: null,
          lastError: null,
        },
      });
      return this.toRecord(created);
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      return this.claimExisting(input);
    }
  }

  async markSent(dedupeKey: string, now: Date): Promise<void> {
    const updated = await this.prisma.clientStatementDeliveryLedger.updateMany({
      where: { dedupeKey, status: ClientStatementDeliveryStatus.PENDING },
      data: {
        status: ClientStatementDeliveryStatus.SENT,
        reservedAt: null,
        nextRetryAt: null,
        sentAt: now,
        lastError: null,
      },
    });
    if (updated.count === 1) return;

    const existing = await this.prisma.clientStatementDeliveryLedger.findUnique({ where: { dedupeKey } });
    if (existing?.status === ClientStatementDeliveryStatus.SENT) return;
    throw new ClientStatementDeliveryLedgerInvariantError('SENT geçişi için aktif PENDING teslim claim’i bulunamadı');
  }

  async markFailed(dedupeKey: string, attempts: number, error: string, now: Date): Promise<void> {
    const updated = await this.prisma.clientStatementDeliveryLedger.updateMany({
      where: {
        dedupeKey,
        status: ClientStatementDeliveryStatus.PENDING,
        attempts,
      },
      data: {
        status: ClientStatementDeliveryStatus.FAILED,
        reservedAt: null,
        nextRetryAt: computeNextRetryAt(attempts, now),
        sentAt: null,
        lastError: truncateLedgerError(error),
      },
    });
    if (updated.count === 1) return;

    const existing = await this.prisma.clientStatementDeliveryLedger.findUnique({ where: { dedupeKey } });
    if (existing?.status === ClientStatementDeliveryStatus.SENT) return;
    if (existing?.status === ClientStatementDeliveryStatus.FAILED && existing.attempts === attempts) return;
    throw new ClientStatementDeliveryLedgerInvariantError('FAILED geçişi claim attempt ile eşleşmedi');
  }

  private async claimExisting(
    input: ClientStatementDeliveryLedgerReservation,
  ): Promise<ClientStatementDeliveryLedgerRecord | null> {
    const existing = await this.prisma.clientStatementDeliveryLedger.findUnique({
      where: { dedupeKey: input.dedupeKey },
    });
    if (!existing) {
      throw new ClientStatementDeliveryLedgerInvariantError('Unique yarışından sonra teslim kaydı bulunamadı');
    }
    this.assertSameReservationScope(existing, input);

    const decision = decideDeliveryClaim(this.toRecord(existing), input.now);
    if (decision.action === 'SKIP') return null;
    if (decision.kind === 'NEW') {
      throw new ClientStatementDeliveryLedgerInvariantError('Mevcut kayda NEW claim kararı verilemez');
    }

    const commonWhere = {
      id: existing.id,
      dedupeKey: input.dedupeKey,
      tenantId: input.tenantId,
      clientId: input.clientId,
      statementId: input.statementId,
      attempts: { lt: CLIENT_STATEMENT_DELIVERY_MAX_ATTEMPTS },
    };
    const updated = decision.kind === 'TAKEOVER_STALE_PENDING'
      ? await this.prisma.clientStatementDeliveryLedger.updateMany({
          where: {
            ...commonWhere,
            status: ClientStatementDeliveryStatus.PENDING,
            OR: [
              { reservedAt: null },
              {
                reservedAt: {
                  lt: new Date(
                    input.now.getTime() - CLIENT_STATEMENT_DELIVERY_LOCK_TIMEOUT_MINUTES * 60 * 1000,
                  ),
                },
              },
            ],
          },
          data: {
            attempts: { increment: 1 },
            reservedAt: input.now,
            lastAttemptAt: input.now,
            nextRetryAt: null,
            lastError: null,
          },
        })
      : await this.prisma.clientStatementDeliveryLedger.updateMany({
          where: {
            ...commonWhere,
            status: ClientStatementDeliveryStatus.FAILED,
            OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: input.now } }],
          },
          data: {
            status: ClientStatementDeliveryStatus.PENDING,
            attempts: { increment: 1 },
            reservedAt: input.now,
            lastAttemptAt: input.now,
            nextRetryAt: null,
            lastError: null,
          },
        });
    if (updated.count !== 1) return null;

    const claimed = await this.prisma.clientStatementDeliveryLedger.findUnique({
      where: { dedupeKey: input.dedupeKey },
    });
    if (!claimed) {
      throw new ClientStatementDeliveryLedgerInvariantError('Kazanılan teslim claim’i yeniden okunamadı');
    }
    return this.toRecord(claimed);
  }

  private assertSameReservationScope(
    existing: ClientStatementDeliveryLedger,
    input: ClientStatementDeliveryLedgerReservation,
  ): void {
    if (
      existing.tenantId !== input.tenantId
      || existing.clientId !== input.clientId
      || existing.statementId !== input.statementId
      || existing.periodKey !== input.periodKey
      || existing.recipientEmail !== input.recipientEmail
    ) {
      throw new ClientStatementDeliveryLedgerInvariantError('Dedupe anahtarı başka bir teslim kapsamına ait');
    }
  }

  private toRecord(row: ClientStatementDeliveryLedger): ClientStatementDeliveryLedgerRecord {
    return {
      dedupeKey: row.dedupeKey,
      status: row.status,
      attempts: row.attempts,
      reservedAt: row.reservedAt,
      lastAttemptAt: row.lastAttemptAt,
      nextRetryAt: row.nextRetryAt,
      sentAt: row.sentAt,
      lastError: row.lastError,
    };
  }

  private isUniqueConflict(error: unknown): boolean {
    return (
      (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
      || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    );
  }
}
