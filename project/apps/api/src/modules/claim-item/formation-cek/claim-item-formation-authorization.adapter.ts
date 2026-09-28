import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { lockExecutionActorRows } from '../../office-approval/office-approval-execution-authority';
import { ClaimItemWriterRouterService } from '../claim-item-writer-router.service';
import {
  HumanClaimItemFormationAuthorizationPort,
  type HumanClaimItemFormationAuthorizationInput,
} from '../formation-intent/claim-item-formation-resolver.ports';

/**
 * K3 AUTO-GENERATE FORMATION (owner GO 2026-09-28) — insan formation talebinin yetkisi, `POST /claim-items`
 * (`createFromUser`) ile AYNI ClaimItem insan yazma kapısıdır: aktif profil (avukat XOR personel), kiracı/dosya
 * kapsamı ve dosyada mali düzenleme nesne yetkisi (`casePermissions.canEditFinance` veya personel `canSeeFinance` +
 * `canEdit`). Kapı CREATE için onay ister (OFFICE_APPROVAL_REQUIRED) → talep açılabilir; DENIED → 403 ve yazma yok.
 *
 * `assertAuthorizedInTransaction` #2824/#2825 desenidir: talep yazısının transaction'ında, ilk yazmadan önce aktörün
 * `Lawyer` → `User` satırları `FOR SHARE` kilitlenir ve AYNI kapı tx istemcisiyle yeniden sorulur (iptal önce commit
 * ettiyse ret; kilit önce alındıysa iptal bekler).
 */
export class ClaimItemFormationAuthorizationAdapter extends HumanClaimItemFormationAuthorizationPort {
  constructor(private readonly router: ClaimItemWriterRouterService) {
    super();
  }

  async assertAuthorized(input: HumanClaimItemFormationAuthorizationInput): Promise<void> {
    await this.evaluate(input);
  }

  async assertAuthorizedInTransaction(
    tx: Prisma.TransactionClient,
    input: HumanClaimItemFormationAuthorizationInput,
  ): Promise<void> {
    await lockExecutionActorRows(tx, input.actorUserId);
    await this.evaluate(input, tx);
  }

  private async evaluate(
    input: HumanClaimItemFormationAuthorizationInput,
    database?: Prisma.TransactionClient,
  ): Promise<void> {
    const result = await this.router.evaluateHuman(
      {
        operation: 'CREATE',
        tenantId: input.tenantId,
        caseId: input.caseId,
        actorUserId: input.actorUserId,
        payload: { tenantId: input.tenantId, caseId: input.caseId },
      },
      ...(database === undefined ? [] : [database as never]),
    );
    if (result.outcome === 'DENIED') {
      throw new ForbiddenException(`ClaimItem write denied: ${result.reasonCode}`);
    }
    if (result.outcome !== 'OFFICE_APPROVAL_REQUIRED') {
      throw new ForbiddenException('ClaimItem formation requires OfficeApproval.');
    }
  }
}
