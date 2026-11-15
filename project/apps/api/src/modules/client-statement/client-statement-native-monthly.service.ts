import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type ClientStatementNativeDelivery } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { NotificationDispatcherService } from '../client-notification/notification-dispatcher.service';
import { ACTIVE_TENANT_WHERE } from '../tenant/tenant-lifecycle';
import { ClientStatementNativeService, type NativeStatementActor } from './client-statement-native.service';
import { nativeMonthlyDedupeKey, nativeMonthlyLockKey } from './client-statement-native.contract';
import { buildStatementAttachmentFilename, buildStatementDeliveryTokens } from './client-statement-delivery.contract';
import { formatClosingBalanceLine, formatTrAmount } from './client-statement-pdf.document';
import { computeNextRetryAt, decideDeliveryClaim } from './client-statement-delivery-ledger.contract';
import { identifyMonthlyStatementPeriod, type MonthlyStatementPeriod } from './client-statement-monthly-period';
import type { MonthlyDeliveryTargetResult } from './client-statement-monthly-delivery.service';

/** Existing H6 recipient priority, shared verbatim by legacy and E2; no caller-selected address. */
export function resolveStatementRecipient(client: { email: string | null; contacts?: { type: string | null; value: string | null; isPrimary: boolean | null }[] | null }): string | null {
  const contacts = client.contacts || [];
  const raw = contacts.find(c => c.type === 'EMAIL' && c.isPrimary === true)?.value ||
    contacts.find(c => c.type === 'EMAIL')?.value || client.email || '';
  const normalized = raw.trim().toLowerCase();
  return normalized.includes('@') ? normalized : null;
}

/** E2 participates in the existing H6 run only. It adds neither a cron nor an activation. */
@Injectable()
export class ClientStatementNativeMonthlyService {
  constructor(private readonly prisma: PrismaService, private readonly native: ClientStatementNativeService,
    private readonly dispatcher: NotificationDispatcherService, private readonly approval: OfficeApprovalService,
    private readonly audit: AuditService) {}

  /** Callers: existingTarget/process/retry and the existing H6 currency-refusal branch. */
  isEnabled(): boolean {
    return process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY === 'true' && process.env.CLIENT_STATEMENT_NATIVE_CURRENCY_DELIVERY === 'true';
  }

  /** Caller: existing monthly processClient, before selecting a legacy member. Default-off data must not cause a legacy resend. */
  async existingTarget(tenantId: string, clientId: string, period: MonthlyStatementPeriod, now: Date): Promise<MonthlyDeliveryTargetResult | null> {
    const set = await this.prisma.clientStatementNativeSet.findFirst({ where: { tenantId, clientId, periodStart: period.periodStart, periodEnd: period.periodEnd, status: 'ACTIVE' }, select: { id: true } });
    if (!set) return null;
    if (!this.isEnabled()) {
      // A manually generated E2 snapshot is not monthly activation or a reservation.
      // Preserve accepted legacy TRY delivery unless this period has an actual native delivery claim.
      const claimed = await this.prisma.clientStatementNativeDelivery.count({ where: { tenantId, clientId, periodKey: period.periodKey } });
      return claimed ? { tenantId, clientId, outcome: 'RECONCILIATION_REQUIRED', statementSource: 'NONE', reason: 'native-period-disabled' } : null;
    }
    return this.process(tenantId, clientId, period, now);
  }

  /** Trusted callers: existing monthly processClient after E1 rejection; existingTarget for an already native period. */
  async process(tenantId: string, clientId: string, period: MonthlyStatementPeriod, now: Date): Promise<MonthlyDeliveryTargetResult> {
    const base = { tenantId, clientId, statementSource: 'REUSED' as const };
    if (!this.isEnabled()) return { ...base, outcome: 'RECONCILIATION_REQUIRED', reason: 'native-period-disabled' };
    try {
      const set = await this.native.ensureMonthly(tenantId, clientId, period.periodStart, period.periodEnd);
      return { ...base, statementSource: set.generated ? 'GENERATED' : 'REUSED', ...await this.deliver(tenantId, set.id, now) };
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      return { ...base, statementSource: 'NONE', outcome: 'FAILED', reason: 'native-set-not-ready' };
    }
  }

  /** Caller: native HTTP retry. Existing approver policy plus complete canonical object scope, never title/ADMIN alone. */
  async retry(tenantId: string, setId: string, actor: NativeStatementActor, now = new Date()) {
    await this.prisma.$transaction(async tx => {
      const set = await this.native.findSet(tx, tenantId, setId);
      await this.native.assertActorScope(tx, tenantId, set.clientId, actor, true);
      if (!await this.approval.isApproverEligibleInTx(tx, actor.userId, tenantId)) throw new ForbiddenException('MONTHLY_DELIVERY_AUTHORITY_REQUIRED');
      if (!await tx.clientStatementNativeDelivery.findFirst({ where: { tenantId, setId } })) throw new NotFoundException('Aylık teslim bulunamadı');
    });
    if (!this.isEnabled()) return { enabled: false, target: null };
    return { enabled: true, target: await this.deliver(tenantId, setId, now, actor) };
  }

  private async deliver(tenantId: string, setId: string, now: Date, actor?: NativeStatementActor): Promise<Pick<MonthlyDeliveryTargetResult, 'outcome' | 'reason'>> {
    const set = await this.native.findSet(this.prisma, tenantId, setId);
    const period = identifyMonthlyStatementPeriod(set.periodStart, set.periodEnd);
    if (!period) throw new ConflictException('E2_MONTH_REQUIRED');
    // A real partial artifact failure never reaches reservation or dispatcher.
    let artifacts: Awaited<ReturnType<ClientStatementNativeService['artifacts']>>;
    try { artifacts = await this.native.artifacts(tenantId, setId); }
    catch { return { outcome: 'FAILED', reason: 'native-pdf-set-not-ready' }; }
    const claimed = await this.prisma.$transaction(async tx => {
      await this.lock(tx, tenantId, set.clientId, period.periodKey);
      const current = await this.native.findSet(tx, tenantId, setId);
      if (current.status !== 'ACTIVE' || current.memberHash !== set.memberHash) throw new ConflictException('E2_SET_CHANGED');
      await this.native.assertFrozenCases(tx, tenantId, actor, current);
      if (actor) {
        await this.native.assertActorScope(tx, tenantId, set.clientId, actor, true);
        if (!await this.approval.isApproverEligibleInTx(tx, actor.userId, tenantId)) throw new ForbiddenException('MONTHLY_DELIVERY_AUTHORITY_REQUIRED');
      }
      const client = await tx.client.findFirst({ where: { tenantId, id: set.clientId, isActive: true, tenant: ACTIVE_TENANT_WHERE }, include: { contacts: true } });
      if (!client) throw new NotFoundException('Müvekkil bulunamadı');
      const recipientEmail = resolveStatementRecipient(client);
      if (!recipientEmail) return { outcome: 'SKIPPED_NO_RECIPIENT' as const };
      // Protect the same logical monthly obligation across legacy and native identities.
      const legacy = await tx.clientStatementDeliveryLedger.count({ where: { tenantId, clientId: set.clientId, periodKey: period.periodKey } });
      const statements = await tx.clientStatement.findMany({ where: { tenantId, clientId: set.clientId, caseId: null, periodStart: set.periodStart, periodEnd: set.periodEnd }, select: { id: true } });
      const oldNotification = await tx.clientNotification.count({ where: { tenantId, clientId: set.clientId,
        dedupeKey: { in: statements.map(s => `STATEMENT_MONTHLY:ClientStatement:${s.id}:${period.periodKey}`) } } });
      if (legacy || oldNotification) return { outcome: 'RECONCILIATION_REQUIRED' as const, reason: 'legacy-period-evidence-present' };
      const dedupeKey = nativeMonthlyDedupeKey(tenantId, set.clientId, period.periodKey);
      const row = await tx.clientStatementNativeDelivery.findUnique({ where: { dedupeKey } });
      if (row && (row.tenantId !== tenantId || row.clientId !== set.clientId || row.setId !== setId || row.memberHash !== set.memberHash || row.recipientEmail !== recipientEmail)) {
        return { outcome: 'RECONCILIATION_REQUIRED' as const, reason: 'native-reservation-scope-changed' };
      }
      const pair = await this.notification(tx, tenantId, set.clientId, dedupeKey);
      if (pair.status === 'SENT') {
        if (!row) return { outcome: 'RECONCILIATION_REQUIRED' as const, reason: 'native-ledger-missing' };
        if (row.status !== 'SENT') {
          await tx.clientStatementNativeDelivery.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: pair.sentAt, reservedAt: null, nextRetryAt: null, lastError: null } });
          await this.auditDelivery(tx, row, 'RECONCILED', actor?.userId);
        }
        return { outcome: 'RECONCILED' as const };
      }
      if (pair.status === 'PENDING' || pair.status === 'CONFLICT' || row?.status === 'SENT') return { outcome: 'RECONCILIATION_REQUIRED' as const, reason: 'native-notification-unresolved' };
      const decision = decideDeliveryClaim(row, now);
      if (decision.action === 'SKIP') return { outcome: 'SKIPPED_LEDGER_CLAIM_LOST' as const, reason: decision.reason };
      const data = { status: 'PENDING' as const, attempts: (row?.attempts ?? 0) + 1, reservedAt: now, lastAttemptAt: now, nextRetryAt: null, lastError: null };
      const claim = row ? await tx.clientStatementNativeDelivery.update({ where: { id: row.id }, data })
        : await tx.clientStatementNativeDelivery.create({ data: { ...data, tenantId, clientId: set.clientId, setId, periodKey: period.periodKey, recipientEmail, memberHash: set.memberHash, dedupeKey } });
      await this.auditDelivery(tx, claim, 'CLAIMED', actor?.userId);
      return { claim, retryFailed: pair.status === 'FAILED' };
    });
    if (!('claim' in claimed) || !claimed.claim) return claimed as Pick<MonthlyDeliveryTargetResult, 'outcome' | 'reason'>;
    const claim = claimed.claim;
    const renders = artifacts.map(a => a.render);
    const tokens = { ...buildStatementDeliveryTokens(renders[0]),
      currency: renders.map(r => r.currency).join(' / '),
      openingBalance: renders.map(r => `${formatTrAmount(r.openingBalance)} ${r.currency}`).join(' / '),
      closingBalance: renders.map(r => `${formatTrAmount(r.closingBalance)} ${r.currency}`).join(' / '),
      closingBalanceLine: renders.map(r => formatClosingBalanceLine(r.closingBalance, r.currency)).join('\n'),
      lineCount: String(renders.reduce((n, r) => n + r.lines.length, 0)) };
    let sent = false;
    try {
      const result = await this.dispatcher.dispatch(tenantId, actor?.userId ?? 'SYSTEM_MONTHLY_STATEMENT', {
        clientId: set.clientId, templateCode: 'STATEMENT_READY', type: 'STATEMENT_READY', tokens,
        dedupeKey: claim.dedupeKey, refType: 'ClientStatementNativeSet', refId: setId,
        expectedRecipientEmail: claim.recipientEmail, ...(claimed.retryFailed ? { force: true } : {}),
        attachments: artifacts.map(a => ({ content: a.content, contentType: 'application/pdf', filename: buildStatementAttachmentFilename(a.render).replace(/\.pdf$/, `-${a.currency}.pdf`) })),
      });
      sent = result.status === 'sent' || result.existingStatus === 'SENT';
    } catch { /* Resolve from durable paired evidence; an exception never proves non-delivery. */ }
    try {
      return await this.prisma.$transaction(async tx => {
        await this.lock(tx, tenantId, set.clientId, period.periodKey);
        const row = await tx.clientStatementNativeDelivery.findUnique({ where: { id: claim.id } });
        if (!row || row.status !== 'PENDING' || row.attempts !== claim.attempts || row.reservedAt?.getTime() !== claim.reservedAt?.getTime()) return { outcome: 'RECONCILIATION_REQUIRED' as const, reason: 'native-claim-changed' };
        const pair = await this.notification(tx, tenantId, set.clientId, claim.dedupeKey);
        if (['PENDING', 'CONFLICT'].includes(pair.status) || (sent && pair.status !== 'SENT')) return { outcome: 'RECONCILIATION_REQUIRED' as const, reason: 'native-notification-unresolved' };
        const success = pair.status === 'SENT';
        await tx.clientStatementNativeDelivery.update({ where: { id: row.id }, data: success
          ? { status: 'SENT', sentAt: pair.sentAt, reservedAt: null, nextRetryAt: null, lastError: null }
          : { status: 'FAILED', sentAt: null, reservedAt: null, nextRetryAt: computeNextRetryAt(row.attempts, now), lastError: 'native-delivery-failed' } });
        await this.auditDelivery(tx, row, success ? 'SENT' : 'FAILED', actor?.userId);
        return { outcome: success ? 'DELIVERED' as const : 'FAILED' as const, ...(!success ? { reason: 'native-delivery-failed' } : {}) };
      });
    } catch { return { outcome: 'RECONCILIATION_REQUIRED', reason: 'native-state-write-failed' }; }
  }

  private async lock(tx: Prisma.TransactionClient, tenantId: string, clientId: string, periodKey: string) {
    const periodLock = nativeMonthlyLockKey(tenantId, clientId, periodKey);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${periodLock}, 0))`;
    const notificationLock = `client-notification-dispatch|${tenantId}|${nativeMonthlyDedupeKey(tenantId, clientId, periodKey)}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${notificationLock}, 0))`;
  }

  private async notification(tx: Prisma.TransactionClient, tenantId: string, clientId: string, dedupeKey: string) {
    const rows = await tx.clientNotification.findMany({ where: { tenantId, dedupeKey }, take: 2 });
    const row = rows.length === 1 ? rows[0] : null;
    const valid = row && row.clientId === clientId && row.channel === 'EMAIL' && row.type === 'STATEMENT_READY' && ['SENT', 'PENDING', 'FAILED'].includes(row.status) && (row.status !== 'SENT' || row.sentAt);
    return { status: rows.length === 0 ? 'NONE' : valid ? row!.status : 'CONFLICT', sentAt: row?.sentAt ?? null };
  }

  private async auditDelivery(tx: Prisma.TransactionClient, row: ClientStatementNativeDelivery, outcome: string, actorId = 'SYSTEM_MONTHLY_STATEMENT') {
    await this.audit.logInTransaction(tx, { tenantId: row.tenantId, userId: actorId, action: 'UPDATE', entityType: 'ClientStatementNativeSet', entityId: row.setId,
      description: 'Native monthly statement delivery state transition', metadata: { outcome, attempts: row.attempts, periodKey: row.periodKey, memberHash: row.memberHash } });
  }
}
