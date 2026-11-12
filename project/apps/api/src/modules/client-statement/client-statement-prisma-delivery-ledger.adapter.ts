import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import {
  ClientStatementDeliveryStatus,
  Prisma,
  type ClientStatementDeliveryLedger,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { assertClientObjectScope } from '../client/client-object-scope';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { identifyMonthlyStatementPeriod } from './client-statement-monthly-period';
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
  constructor(private readonly prisma: PrismaService, @Optional() private readonly audit?: AuditService,
    @Optional() private readonly approval?: OfficeApprovalService) {}

  async claim(
    input: ClientStatementDeliveryLedgerReservation,
  ): Promise<ClientStatementDeliveryLedgerRecord | null> {
    return this.claimUsing(this.prisma, input);
  }

  private async claimUsing(db: Pick<Prisma.TransactionClient, 'clientStatementDeliveryLedger'>,
    input: ClientStatementDeliveryLedgerReservation): Promise<ClientStatementDeliveryLedgerRecord | null> {
    try {
      const created = await db.clientStatementDeliveryLedger.create({
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
      return this.claimExisting(input, db);
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
    db: Pick<Prisma.TransactionClient, 'clientStatementDeliveryLedger'> = this.prisma,
  ): Promise<ClientStatementDeliveryLedgerRecord | null> {
    const existing = await db.clientStatementDeliveryLedger.findUnique({
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
      ? await db.clientStatementDeliveryLedger.updateMany({
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
      : await db.clientStatementDeliveryLedger.updateMany({
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

    const claimed = await db.clientStatementDeliveryLedger.findUnique({
      where: { dedupeKey: input.dedupeKey },
    });
    if (!claimed) {
      throw new ClientStatementDeliveryLedgerInvariantError('Kazanılan teslim claim’i yeniden okunamadı');
    }
    return this.toRecord(claimed);
  }

  /** Callers: monthly run and target-bound HTTP recovery. No transport inside DB transactions. */
  async inspectDelivery(input: ClientStatementDeliveryLedgerReservation) {
    const pair = await this.pair(this.prisma, input);
    return { ledger: pair.row ? this.toRecord(pair.row) : null, notificationStatus: pair.status };
  }

  async claimDelivery(input: ClientStatementDeliveryLedgerReservation) {
    return this.prisma.$transaction(async tx => {
      await this.lockAndAuthorize(tx, input);
      const pair = await this.pair(tx, input);
      if (['PENDING', 'SENT', 'CONFLICT'].includes(pair.status)) return null;
      const claim = pair.row ? await this.claimExisting(input, tx) : await this.claimUsing(tx, input);
      if (claim) await this.auditTransition(tx, input, 'CLAIMED', claim.attempts);
      return claim ? { ...claim, retryFailed: pair.status === 'FAILED' } : null;
    });
  }

  async reconcileSent(input: ClientStatementDeliveryLedgerReservation): Promise<boolean> {
    return this.prisma.$transaction(async tx => {
      await this.lockAndAuthorize(tx, input);
      const pair = await this.pair(tx, input);
      if (!pair.row || pair.status !== 'SENT') return false;
      if (pair.row.status === 'SENT') return true;
      const changed = await tx.clientStatementDeliveryLedger.updateMany({
        where: { id: pair.row.id, status: pair.row.status, attempts: pair.row.attempts, reservedAt: pair.row.reservedAt },
        data: { status: 'SENT', sentAt: pair.notification!.sentAt, reservedAt: null, nextRetryAt: null, lastError: null },
      });
      if (changed.count !== 1) return false;
      await this.auditTransition(tx, input, 'RECONCILED', pair.row.attempts);
      return true;
    });
  }

  async finishDelivery(input: ClientStatementDeliveryLedgerReservation, claim: ClientStatementDeliveryLedgerRecord,
    sent: boolean, error?: string): Promise<'SENT' | 'FAILED' | 'UNCERTAIN'> {
    return this.prisma.$transaction(async tx => {
      await this.lockAndAuthorize(tx, input);
      const pair = await this.pair(tx, input);
      if (!pair.row || pair.row.status !== 'PENDING' || pair.row.attempts !== claim.attempts ||
        pair.row.reservedAt?.getTime() !== claim.reservedAt?.getTime()) return 'UNCERTAIN';
      // A timeout or an uncommitted SENT stamp is never evidence of non-delivery.
      if (pair.status === 'PENDING' || pair.status === 'CONFLICT' || (sent && pair.status !== 'SENT')) return 'UNCERTAIN';
      const delivered = pair.status === 'SENT';
      await tx.clientStatementDeliveryLedger.update({ where: { id: pair.row.id }, data: delivered
        ? { status: 'SENT', sentAt: pair.notification!.sentAt, reservedAt: null, nextRetryAt: null, lastError: null }
        : { status: 'FAILED', sentAt: null, reservedAt: null, nextRetryAt: computeNextRetryAt(claim.attempts, input.now), lastError: truncateLedgerError(error) },
      });
      await this.auditTransition(tx, input, delivered ? 'SENT' : 'FAILED', claim.attempts);
      return delivered ? 'SENT' : 'FAILED';
    });
  }

  private async lockAndAuthorize(tx: Prisma.TransactionClient, input: ClientStatementDeliveryLedgerReservation) {
    const key = `client-notification-dispatch|${input.tenantId}|${input.dedupeKey}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const statement = await tx.clientStatement.findFirst({ where: { id: input.statementId, tenantId: input.tenantId,
      clientId: input.clientId, caseId: null, status: 'ACTIVE', client: { isActive: true } },
      select: { periodStart: true, periodEnd: true } });
    if (!statement || identifyMonthlyStatementPeriod(statement.periodStart, statement.periodEnd)?.periodKey !== input.periodKey) {
      throw new ClientStatementDeliveryLedgerInvariantError('Aylık teslim belge kapsamı değişmiş');
    }
    if (input.actorUserId) {
      const actor = await tx.user.findFirst({ where: { id: input.actorUserId, tenantId: input.tenantId, isActive: true }, select: { role: true } });
      if (!actor || actor.role === 'VIEWER' || !this.approval || !await this.approval.isApproverEligibleInTx(tx, input.actorUserId, input.tenantId)) {
        throw new ForbiddenException('MONTHLY_DELIVERY_AUTHORITY_REQUIRED');
      }
      await assertClientObjectScope(tx, input.tenantId, input.actorUserId, input.clientId);
    }
  }

  private async pair(db: Pick<Prisma.TransactionClient, 'clientStatementDeliveryLedger' | 'clientNotification'>,
    input: ClientStatementDeliveryLedgerReservation) {
    const row = await db.clientStatementDeliveryLedger.findUnique({ where: { dedupeKey: input.dedupeKey } });
    if (row) this.assertSameReservationScope(row, input);
    const notifications = await db.clientNotification.findMany({
      where: { tenantId: input.tenantId, dedupeKey: input.dedupeKey }, take: 2,
      select: { id: true, clientId: true, channel: true, type: true, status: true, sentAt: true },
    });
    const notification = notifications.length === 1 ? notifications[0] : null;
    const valid = notification && notification.clientId === input.clientId && notification.channel === 'EMAIL' &&
      notification.type === 'STATEMENT_READY' && ['SENT', 'FAILED', 'PENDING'].includes(notification.status) &&
      (notification.status !== 'SENT' || notification.sentAt !== null);
    const status: 'NONE' | 'CONFLICT' | 'SENT' | 'FAILED' | 'PENDING' = notifications.length === 0 ? 'NONE'
      : !valid ? 'CONFLICT' : notification!.status as 'SENT' | 'FAILED' | 'PENDING';
    return { row, notification, status };
  }

  private async auditTransition(tx: Prisma.TransactionClient, input: ClientStatementDeliveryLedgerReservation,
    outcome: string, attempts: number) {
    if (!this.audit || !input.auditActorId) throw new ClientStatementDeliveryLedgerInvariantError('Teslim audit bağı eksik');
    await this.audit.logInTransaction(tx, {
      tenantId: input.tenantId, userId: input.auditActorId, action: 'UPDATE', entityType: 'ClientStatement', entityId: input.statementId,
      newValues: { deliveryOutcome: outcome, attempts, periodKey: input.periodKey },
      description: 'Monthly statement delivery state transition',
    });
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
