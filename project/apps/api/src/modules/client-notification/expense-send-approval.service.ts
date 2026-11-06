import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type OfficeApprovalRequest } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { lockAndAssertExecutionRole } from '../office-approval/office-approval-execution-authority';
import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';
import { assertClientObjectScope } from '../client/client-object-scope';
import { isSameApprovalIdentity, resolveApprovalIdentityCandidates } from '../../common/approval-identity';
import { maskEmail, maskIban, maskTckn } from '../../common/pii-mask.util';
import { lockExpenseRequest } from '../expense-request/expense-request-lock';
import { clientEmailRecipient } from './client-email-recipient';

export const EXPENSE_SEND_ACTION = 'EXPENSE_REQUEST_SEND';
export const EXPENSE_SEND_VERSION = 'EXPENSE_SEND_V1';
export interface ExpenseSendContent { clientId: string; caseId?: string; subject: string; body: string }
/** Server-only call context, never accepted from the public send DTO. */
export interface ExpenseSendContext { expenseRequestId: string; approvalRequestId: string }
export interface ExpenseSendApprovalOutcome {
  success: false;
  approvalRequired: true;
  approvalRequestId: string;
  approvalStatus: string;
  reasonCode: 'OFFICE_APPROVAL_REQUIRED';
  retryable: false;
  message: string;
}
export function expenseSendApprovalOutcome(id: string, status: string): ExpenseSendApprovalOutcome {
  return {
    success: false, approvalRequired: true, approvalRequestId: id, approvalStatus: status,
    reasonCode: 'OFFICE_APPROVAL_REQUIRED', retryable: false,
    message: status === 'PENDING_APPROVAL'
      ? 'Masraf kaydedildi; e-posta gönderilmedi. Gönderim için bağımsız iç onay bekleniyor.'
      : 'Masraf e-postası gönderilmedi. Gönderim onayı geçerli değil; onay kararını inceleyin.',
  };
}

/** 3a/T-3 adapter: one action on the existing OfficeApproval substrate, not a second engine.
 * Callers: NotificationDispatcherService (prepare/reconcile); ClientNotificationService (begin);
 * ExpenseRequestService (assertRecordedSend on legacy status-only endpoints).
 */
@Injectable()
export class ExpenseSendApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approval: OfficeApprovalService,
    private readonly audit: AuditService,
  ) {}

  private async snapshot(tx: Prisma.TransactionClient, tenantId: string, userId: string, id: string, content: ExpenseSendContent) {
    await lockExpenseRequest(tx, tenantId, id);
    const request = await tx.expenseRequest.findFirst({
      where: { id, tenantId }, include: { requestItems: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }, client: { include: { contacts: true } } },
    });
    if (!request) throw new NotFoundException('Masraf talebi bulunamadı');
    await lockAndAssertExecutionRole(tx, userId);
    await assertClientObjectScope(tx, tenantId, userId, request.clientId, request.caseId);
    if (content.clientId !== request.clientId || content.caseId !== request.caseId) {
      throw new ForbiddenException({ code: 'EXPENSE_SEND_PARENT_MISMATCH' });
    }
    if (['CANCELLED', 'PAID', 'RECEIVED'].includes(request.status)) {
      throw new ConflictException({ code: 'EXPENSE_SEND_LIFECYCLE_DENIED' });
    }
    const legacy = await tx.clientNotification.findFirst({ where: {
      tenantId, dedupeKey: `EXPENSE_REQUEST:ExpenseRequest:${id}:1`, status: { in: ['SENT', 'PENDING'] },
    }, select: { id: true } });
    if (legacy) throw new ConflictException({ code: 'EXPENSE_SEND_LEGACY_UNBOUND', message: 'Önceki gönderimin içerik/onay bağı doğrulanamadı; yeniden gönderim yapılmadı.' });
    if (['SENT', 'REMINDED'].includes(request.status)) {
      const boundDelivery = await tx.officeApprovalRequest.findFirst({ where: {
        tenantId, actionCode: EXPENSE_SEND_ACTION, targetType: 'ExpenseRequest', targetRef: id,
        status: 'APPROVED', executionStatus: 'SUCCEEDED',
      }, select: { id: true } });
      if (!boundDelivery) throw new ConflictException({ code: 'EXPENSE_SEND_LEGACY_UNBOUND', message: 'Önceki gönderimin içerik/onay bağı doğrulanamadı; yeniden gönderim yapılmadı.' });
    }
    // No fabricated person and no transfer of distribution's system-requester exception.
    if (!(await resolveApprovalIdentityCandidates(tx, userId, tenantId)).size) {
      throw new ForbiddenException({ code: 'APPROVAL_IDENTITY_UNPROVEN' });
    }
    const recipient = clientEmailRecipient(request.client);
    if (!recipient) throw new ConflictException({ code: 'EXPENSE_SEND_RECIPIENT_MISSING' });
    const business = {
      id: request.id, caseId: request.caseId, clientId: request.clientId,
      amount: request.totalAmount.toFixed(2), currency: request.currency,
      dueDate: request.dueDate?.toISOString() ?? null,
      items: request.requestItems.map(i => ({ code: i.itemCode, label: i.label, description: i.description, amount: i.finalAmount.toFixed(2) })),
    };
    const contentHash = stableJsonHash({ business, recipient, subject: content.subject, body: content.body });
    // No raw email, bank details, provider credentials or rendered body in approval/audit projections.
    const intent = {
      version: EXPENSE_SEND_VERSION, expenseRequestId: id, caseId: request.caseId, clientId: request.clientId,
      contentHash, totalAmount: business.amount, currency: business.currency, dueDate: business.dueDate,
      itemCount: business.items.length, recipientLabel: maskEmail(recipient),
      // Plain-text projection, rendered as text by the inbox; unmasked content remains hash-bound only.
      preview: `${content.subject}\n${content.body.replace(/<[^>]*>/g, ' ')}`
        .replace(/\bTR(?:[\s]*\d){24}(?!\d)/gi, iban => maskIban(iban))
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, email => maskEmail(email))
        .replace(/\b\d{11}\b/g, value => maskTckn(value)),
    };
    return { request, intent, recipient };
  }

  private async assertDecision(tx: Prisma.TransactionClient, tenantId: string, row: OfficeApprovalRequest, contentHash: string, createdById: string) {
    const intent = row.savedIntent as Record<string, unknown>;
    if (row.actionCode !== EXPENSE_SEND_ACTION || row.targetType !== 'ExpenseRequest'
      || row.tenantId !== tenantId || intent?.version !== EXPENSE_SEND_VERSION || intent.contentHash !== contentHash
      || stableJsonHash(row.savedIntent) !== row.payloadHash || row.status !== 'APPROVED'
      || !row.approverUserId || (row.expiresAt && row.expiresAt <= new Date())) {
      throw new ConflictException({ code: 'EXPENSE_SEND_APPROVAL_STALE' });
    }
    await lockAndAssertExecutionRole(tx, row.approverUserId);
    if (!(await this.approval.isApproverEligibleInTx(tx, row.approverUserId, tenantId))) {
      throw new ForbiddenException({ code: 'EXPENSE_SEND_APPROVER_NOT_ELIGIBLE' });
    }
    if (!(await resolveApprovalIdentityCandidates(tx, row.approverUserId, tenantId)).size
      || !(await resolveApprovalIdentityCandidates(tx, row.requesterUserId, tenantId)).size) {
      throw new ForbiddenException({ code: 'APPROVAL_IDENTITY_UNPROVEN' });
    }
    if (await isSameApprovalIdentity(tx, row.approverUserId, row.requesterUserId, tenantId)
      || (createdById !== 'system' && await isSameApprovalIdentity(tx, row.approverUserId, createdById, tenantId))) {
      throw new ForbiddenException({ code: 'SELF_APPROVAL_FORBIDDEN' });
    }
  }

  async prepare(tenantId: string, userId: string, id: string, content: ExpenseSendContent) {
    return this.prisma.$transaction(async tx => {
      const { request, intent } = await this.snapshot(tx, tenantId, userId, id, content);
      const key = `expense-send:${id}:${intent.contentHash}`;
      let row = await tx.officeApprovalRequest.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: key } } });
      if (!row) {
        row = await this.approval.createPendingRequestInTransaction({
          tenantId, actionCode: EXPENSE_SEND_ACTION, targetType: 'ExpenseRequest', targetRef: id,
          requesterUserId: userId, savedIntent: intent, idempotencyKey: key,
        }, tx);
      }
      if (row.actionCode !== EXPENSE_SEND_ACTION || row.targetType !== 'ExpenseRequest' || row.targetRef !== id
        || stableJsonHash(row.savedIntent) !== row.payloadHash || (row.savedIntent as Record<string, unknown>)?.contentHash !== intent.contentHash) {
        throw new ConflictException({ code: 'EXPENSE_SEND_APPROVAL_STALE' });
      }
      if (row.status !== 'APPROVED') return { allowed: false as const, outcome: expenseSendApprovalOutcome(row.id, row.status) };
      await this.assertDecision(tx, tenantId, row, intent.contentHash, request.createdById);
      return { allowed: true as const, context: { expenseRequestId: id, approvalRequestId: row.id } };
    });
  }

  /** Re-check immediately before transport, using the exact recipient and payload transport will use. */
  async begin(tenantId: string, userId: string, context: ExpenseSendContext, content: ExpenseSendContent, recipient: string) {
    return this.prisma.$transaction(async tx => {
      const snap = await this.snapshot(tx, tenantId, userId, context.expenseRequestId, content);
      const row = await tx.officeApprovalRequest.findFirst({ where: { id: context.approvalRequestId, tenantId, targetRef: context.expenseRequestId } });
      if (!row || recipient !== snap.recipient) throw new ConflictException({ code: 'EXPENSE_SEND_APPROVAL_STALE' });
      await this.assertDecision(tx, tenantId, row, snap.intent.contentHash, snap.request.createdById);
      const moved = await tx.officeApprovalRequest.updateMany({
        where: { id: row.id, status: 'APPROVED', executionStatus: { in: ['NOT_RUN', 'FAILED'] } },
        data: { executionStatus: 'RUNNING', runningStartedAt: new Date() },
      });
      if (moved.count !== 1) throw new ConflictException({ code: 'EXPENSE_SEND_ALREADY_RUNNING' });
      await this.audit.logInTransaction(tx, { tenantId, userId, action: 'OFFICE_APPROVAL_EXECUTION_STARTED', entityType: 'OFFICE_APPROVAL', entityId: row.id, metadata: { payloadHash: row.payloadHash } });
    });
  }

  /** Persisted notification evidence, never the HTTP/provider response alone, determines execution status. */
  async reconcile(tenantId: string, userId: string, context: ExpenseSendContext, notificationId: string) {
    await this.prisma.$transaction(async tx => {
      const notification = await tx.clientNotification.findFirst({ where: { id: notificationId, tenantId } });
      if (!notification || !notification.dedupeKey?.endsWith(`:${context.approvalRequestId}`)) return;
      const next = notification.status === 'SENT' ? 'SUCCEEDED' : notification.status === 'FAILED' ? 'FAILED' : null;
      if (!next) return; // uncertain/PENDING is not retry permission
      const moved = await tx.officeApprovalRequest.updateMany({
        where: { id: context.approvalRequestId, tenantId, actionCode: EXPENSE_SEND_ACTION, targetRef: context.expenseRequestId, status: 'APPROVED', executionStatus: { in: next === 'FAILED' ? ['RUNNING', 'NOT_RUN'] : ['RUNNING', 'NOT_RUN', 'FAILED'] } },
        data: { executionStatus: next, ...(next === 'SUCCEEDED' ? { executedAt: new Date() } : {}) },
      });
      if (moved.count) await this.audit.logInTransaction(tx, { tenantId, userId, action: `OFFICE_APPROVAL_EXECUTION_${next}`, entityType: 'OFFICE_APPROVAL', entityId: context.approvalRequestId, metadata: { notificationId } });
    });
  }

  /** Legacy status-only endpoints cannot fabricate a pre-send approval or delivery evidence. */
  async assertRecordedSend(tx: Prisma.TransactionClient, tenantId: string, id: string) {
    const request = await tx.expenseRequest.findFirst({ where: { id, tenantId }, select: { notificationId: true } });
    const notification = request?.notificationId
      ? await tx.clientNotification.findFirst({ where: { id: request.notificationId, tenantId, status: 'SENT' } }) : null;
    const prefix = `EXPENSE_REQUEST:ExpenseRequest:${id}:`;
    const approvalId = notification?.dedupeKey?.startsWith(prefix) ? notification.dedupeKey.slice(prefix.length) : null;
    const approval = approvalId ? await tx.officeApprovalRequest.findFirst({
      where: { id: approvalId, tenantId, actionCode: EXPENSE_SEND_ACTION, targetType: 'ExpenseRequest', targetRef: id, status: 'APPROVED', executionStatus: 'SUCCEEDED' },
    }) : null;
    if (!approval) {
      throw new ConflictException({ code: 'EXPENSE_SEND_APPROVAL_REQUIRED', message: 'Gönderim için masraf e-postası ve iç onay akışını kullanın.' });
    }
  }
}
