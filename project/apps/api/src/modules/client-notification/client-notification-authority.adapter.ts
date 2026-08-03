import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  ClientWorkspaceCommandActor,
  ClientWorkspaceCommandType,
  runAuthorizedClientWorkspaceCommand,
} from '../client/client-workspace-command-authority';
import { AuditService } from '../audit/audit.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';

/**
 * CN-1 — client-notification controller'larını canonical workspace-command
 * primitive'ine bağlayan bounded adapter. Rol politikası veya eligibility hesabı
 * üretmez; yalnız C2'nin frozen primitive'ini ve OFFICE kaynağını tüketir.
 *
 * @remarks Çağrıldığı yerler:
 * - ClientNotificationController.sendEmail / sendSms / sendBulkEmail
 * - NotificationDispatchController.resend
 */
@Injectable()
export class ClientNotificationAuthorityAdapter {
  constructor(
    private readonly officeApproval: OfficeApprovalService,
    private readonly audit: AuditService,
  ) {}

  run<T>(
    actor: ClientWorkspaceCommandActor,
    targetScopeId: string,
    commandType: ClientWorkspaceCommandType,
    execute: () => Promise<T>,
    resultMeta?: (result: T) => Record<string, unknown>,
  ): Promise<T> {
    return runAuthorizedClientWorkspaceCommand(
      {
        isApproverEligible: (userId, tenantId) =>
          this.officeApproval.isApproverEligible(userId, tenantId),
        auditLog: (input) => this.audit.log(input),
      },
      actor,
      { tenantId: String(actor.tenantId ?? ''), clientId: targetScopeId, commandType },
      execute,
      resultMeta,
    );
  }

  /**
   * Recipient sırasından bağımsız, stabil ve PII-free bulk hedef kapsam kimliği.
   * Ham recipient ID'leri yalnız hash preimage'ında kullanılır; audit'e taşınmaz.
   */
  createBulkTargetScopeId(recipientType: string, recipientIds: readonly string[]): string {
    const digest = createHash('sha256')
      .update('CLIENT_NOTIFICATION_BULK_SCOPE/v1\0')
      .update(recipientType)
      .update('\0')
      .update([...recipientIds].sort().join('\0'))
      .digest('hex');

    return `client-notification-bulk:${digest}`;
  }
}
