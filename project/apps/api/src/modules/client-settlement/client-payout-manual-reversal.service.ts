import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientPayoutManualReversalClosureMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { isOfficeAdminCapacity } from '../policy-engine/effective-permission-mapping';
import { Capacity } from '../policy-engine/types/effective-permission.types';
import { CloseClientPayoutManualReversalDto } from './dto/close-client-payout-manual-reversal.dto';

const REVERSAL_SELECT = {
  id: true,
  tenantId: true,
  caseId: true,
  caseClientId: true,
  amount: true,
  currency: true,
  status: true,
  closureMethod: true,
  confidence: true,
  collectionId: true,
  collectionDispositionId: true,
  collectionDispositionLineId: true,
  clientPayoutId: true,
  clientPayoutAllocationId: true,
  openedAt: true,
  closedAt: true,
  closedById: true,
  closureNote: true,
  evidenceRef: true,
} as const;

type ClientPayoutManualReversalView = Prisma.ClientPayoutManualReversalGetPayload<{
  select: typeof REVERSAL_SELECT;
}>;

interface NormalizedClosureInput {
  closureMethod: ClientPayoutManualReversalClosureMethod;
  closureNote: string | null;
  evidenceRef: string | null;
}

/**
 * TM47D-4 — ClientPayoutManualReversal closure service.
 *
 * Closure-only boundary: closes the workflow row and writes audit; it never mutates payout,
 * allocation, collection, disposition marker, statement, ledger, or ClientOffset rows.
 */
@Injectable()
export class ClientPayoutManualReversalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientPayoutManualReversalController.close() -> POST /client-payout-manual-reversals/:id/close (manuel reversal workflow kapatma)
  /// </remarks>
  async close(
    tenantId: string,
    actorUserId: string,
    manualReversalId: string,
    dto: CloseClientPayoutManualReversalDto,
  ): Promise<ClientPayoutManualReversalView> {
    if (!tenantId) throw new BadRequestException('tenantId yok');
    if (!actorUserId) throw new BadRequestException('actor user id yok');
    if (!manualReversalId) throw new BadRequestException('manual reversal id yok');

    await this.assertOfficeAdmin(actorUserId);
    const input = this.normalizeClosureInput(dto);
    const closedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.clientPayoutManualReversal.findFirst({
        where: { id: manualReversalId, tenantId },
        select: REVERSAL_SELECT,
      });

      if (!existing) {
        throw new NotFoundException('Manual reversal workflow bulunamadi');
      }
      if (existing.status !== 'OPEN') {
        throw new ConflictException({
          code: 'CLIENT_PAYOUT_MANUAL_REVERSAL_NOT_CLOSABLE',
          message: 'Yalniz OPEN manual reversal workflow kapatilabilir',
          status: existing.status,
        });
      }

      const updated = await tx.clientPayoutManualReversal.updateMany({
        where: { id: manualReversalId, tenantId, status: 'OPEN' },
        data: {
          status: 'CLOSED',
          closureMethod: input.closureMethod,
          closedAt,
          closedById: actorUserId,
          closureNote: input.closureNote,
          evidenceRef: input.evidenceRef,
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException({
          code: 'CLIENT_PAYOUT_MANUAL_REVERSAL_NOT_CLOSABLE',
          message: 'Manual reversal workflow artik kapatilabilir durumda degil',
        });
      }

      const closed = await tx.clientPayoutManualReversal.findFirstOrThrow({
        where: { id: manualReversalId, tenantId },
        select: REVERSAL_SELECT,
      });

      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_PAYOUT_MANUAL_REVERSAL_CLOSED',
        entityType: 'ClientPayoutManualReversal',
        entityId: manualReversalId,
        userId: actorUserId,
        description: `Client payout manual reversal closed with ${input.closureMethod}`,
        oldValues: {
          status: existing.status,
          closureMethod: existing.closureMethod,
          closedAt: existing.closedAt,
          closedById: existing.closedById,
          evidenceRef: existing.evidenceRef,
        },
        newValues: {
          status: 'CLOSED',
          closureMethod: input.closureMethod,
          closedAt: closedAt.toISOString(),
          closedById: actorUserId,
          evidenceRef: input.evidenceRef,
          closureNotePresent: Boolean(input.closureNote),
          closureNoteLength: input.closureNote?.length ?? 0,
        },
        metadata: {
          manualReversalId,
          tenantId,
          caseId: existing.caseId,
          caseClientId: existing.caseClientId,
          clientPayoutId: existing.clientPayoutId,
          clientPayoutAllocationId: existing.clientPayoutAllocationId,
          collectionId: existing.collectionId,
          collectionDispositionId: existing.collectionDispositionId,
          collectionDispositionLineId: existing.collectionDispositionLineId,
          closureMethod: input.closureMethod,
          closedById: actorUserId,
          evidenceRef: input.evidenceRef,
          amount: existing.amount.toString(),
          currency: existing.currency,
          closureNotePresent: Boolean(input.closureNote),
          authorizationMode: 'DIRECT_OFFICE_ADMIN_CAPABILITY',
        },
      });

      return closed;
    });
  }

  private async assertOfficeAdmin(actorUserId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      include: { lawyer: { select: { lawyerRank: true } }, staffMember: { select: { staffType: true } } },
    });
    const capacity = (user?.lawyer?.lawyerRank ?? user?.staffMember?.staffType ?? 'UNKNOWN') as Capacity;
    if (!isOfficeAdminCapacity(capacity)) {
      throw new ForbiddenException({
        code: 'CLIENT_PAYOUT_MANUAL_REVERSAL_FORBIDDEN',
        message: 'Manual reversal kapatma islemi icin PARTNER/MANAGER (office-admin) yetkisi gerekir',
        requiredCapability: 'OFFICE_ADMIN_FINANCE',
      });
    }
  }

  private normalizeClosureInput(dto: CloseClientPayoutManualReversalDto): NormalizedClosureInput {
    const closureMethod = dto?.closureMethod;
    if (!Object.values(ClientPayoutManualReversalClosureMethod).includes(closureMethod)) {
      throw new BadRequestException('closureMethod gecersiz');
    }

    const closureNote = this.cleanOptionalText(dto.closureNote);
    const evidenceRef = this.cleanOptionalText(dto.evidenceRef);

    if (closureMethod === 'REFUND' && !closureNote && !evidenceRef) {
      throw new BadRequestException('REFUND kapanisi icin evidenceRef veya closureNote gerekir');
    }
    if (closureMethod === 'OFFSET' && !closureNote) {
      throw new BadRequestException('OFFSET kapanisi icin closureNote gerekir');
    }
    if (closureMethod === 'WAIVER' && (!closureNote || closureNote.length < 20)) {
      throw new BadRequestException('WAIVER kapanisi icin en az 20 karakterlik guclu closureNote gerekir');
    }

    return { closureMethod, closureNote, evidenceRef };
  }

  private cleanOptionalText(value?: string): string | null {
    const cleaned = typeof value === 'string' ? value.trim() : '';
    return cleaned.length > 0 ? cleaned : null;
  }
}
