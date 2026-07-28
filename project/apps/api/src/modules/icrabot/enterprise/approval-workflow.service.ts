/**
 * APPROVAL WORKFLOW SERVICE (v38)
 * 
 * Yüksek etkili aksiyonlar için onay workflow'u.
 * Risk level veya lock bazlı zorunlu onay.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ApprovalDecision = 'APPROVE' | 'REJECT';
export type UserRole = 'ADMIN' | 'OPS' | 'LAWYER' | 'VIEWER';

export interface ApprovalRule {
  whenRiskLevel?: string;
  whenLockId?: string;
  requiresRoles: UserRole[];
  minApprovals: number;
}

export interface ApprovalRequest {
  id: string;
  tenantId: string;
  caseId: string;
  jobId?: string;
  requestedByUserId: string;
  reason: string;
  status: ApprovalStatus;
  riskLevel?: string;
  lockId?: string;
  createdAt: Date;
}

export interface ApprovalDecisionRecord {
  id: string;
  approvalRequestId: string;
  userId: string;
  decision: ApprovalDecision;
  note?: string;
  createdAt: Date;
}

@Injectable()
export class ApprovalWorkflowService {
  private readonly logger = new Logger(ApprovalWorkflowService.name);

  // Approval rules configuration
  private readonly rules: ApprovalRule[] = [
    {
      whenRiskLevel: 'HIGH_IMPACT_WRITE',
      requiresRoles: ['LAWYER', 'ADMIN'],
      minApprovals: 1,
    },
    {
      whenRiskLevel: 'CRITICAL',
      requiresRoles: ['ADMIN'],
      minApprovals: 1,
    },
    {
      whenLockId: 'LOCK_EXECUTION_ACTIONS',
      requiresRoles: ['LAWYER', 'ADMIN'],
      minApprovals: 1,
    },
    {
      whenLockId: 'LOCK_HIGH_RISK',
      requiresRoles: ['ADMIN'],
      minApprovals: 1,
    },
  ];

  constructor(private prisma: PrismaService) {}

  /**
   * Check if approval is required for a job
   */
  isApprovalRequired(riskLevel?: string, lockId?: string): ApprovalRule | null {
    for (const rule of this.rules) {
      if (rule.whenRiskLevel && riskLevel === rule.whenRiskLevel) {
        return rule;
      }
      if (rule.whenLockId && lockId === rule.whenLockId) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Create an approval request
   */
  async createApprovalRequest(
    tenantId: string,
    caseId: string,
    requestedByUserId: string,
    reason: string,
    options: {
      jobId?: string;
      riskLevel?: string;
      lockId?: string;
    } = {},
  ): Promise<ApprovalRequest> {
    const prismaAny = this.prisma as any;

    try {
      const request = await prismaAny.icrabotApprovalRequest?.create({
        data: {
          tenantId,
          caseId,
          jobId: options.jobId || null,
          requestedByUserId,
          reason,
          status: 'PENDING',
          riskLevel: options.riskLevel || null,
          lockId: options.lockId || null,
        },
      });

      this.logger.log(`Approval request created: ${request.id}`);
      return request;
    } catch (e) {
      // Model may not exist, return mock
      this.logger.warn('IcrabotApprovalRequest model not found');
      return {
        id: 'temp_' + Date.now(),
        tenantId,
        caseId,
        jobId: options.jobId,
        requestedByUserId,
        reason,
        status: 'PENDING',
        riskLevel: options.riskLevel,
        lockId: options.lockId,
        createdAt: new Date(),
      };
    }
  }

  /**
   * Submit a decision on an approval request
   */
  /**
   * DEBTOR-ENTERPRISE-APPROVAL-AUTHORIZATION-P0-I01 (R02-F09A) — I01B DECISION AUTHORITY
   *
   * HTTP yuzeyinin kullandigi TEK yetkili giris noktasi. `tenantId` ve `actorUserId`
   * cagiran tarafindan DEGIL, authenticated principal'dan turetilerek gecilir.
   *
   * CAPABILITY DURUMU: UNRESOLVED.
   * Semantic compatibility gate sonucu: bu aggregate'in onayladigi sey icrabot is
   * yurutme riskidir (riskLevel / lockId); repository'deki kanonik onay yetkisi ise
   * office capacity modeline (Lawyer.lawyerRank XOR StaffMember.staffType) dayanir.
   * Bu iki eksen arasinda KANONIK bir esleme yoktur; `OfficeApprovalService` bu
   * aggregate tarafindan hic kullanilmamistir ve repository'de paylasilan
   * `isApproverEligible`'in KASITLI olarak yeniden kullanilmadigi bir emsal vardir.
   * Yerel `UserRole` tipi ('OPS' | 'LAWYER') kanonik Prisma enum'unda KARSILIGI
   * OLMAYAN degerler tasir, dolayisiyla rol tablosu da kanonik kabul edilemez.
   *
   * Bu nedenle approver capability ICAT EDILMEZ ve karar mutasyonu GUVENLI VARSAYILAN
   * olarak fail-closed kapatilir. Okuma, talep olusturma ve trust-boundary korumasi
   * (I01A) tam calisir. Disposition: PARTIAL / OWNER SEMANTIC DECISION REQUIRED.
   */
  async submitDecisionAuthorized(
    tenantId: string,
    approvalRequestId: string,
    actorUserId: string,
    _decision: ApprovalDecision,
    _note?: string,
  ): Promise<{ approved: boolean; request: ApprovalRequest }> {
    if (typeof tenantId !== 'string' || tenantId.length === 0) {
      throw new ForbiddenException('enterprise_approval_tenant_required');
    }
    if (typeof actorUserId !== 'string' || actorUserId.length === 0) {
      throw new ForbiddenException('enterprise_approval_actor_required');
    }

    const prismaAny = this.prisma as any;

    // Sahiplik tenant-scoped cozulur. Cross-tenant ve var-olmayan kayit AYNI dis
    // hatayi uretir: varlik sizintisi olmaz.
    let request: ApprovalRequest | null = null;
    try {
      request = await prismaAny.icrabotApprovalRequest?.findFirst({
        where: { id: approvalRequestId, tenantId },
      });
    } catch (e) {
      throw new NotFoundException('Approval request not found');
    }
    if (!request) {
      throw new NotFoundException('Approval request not found');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Approval request is not pending');
    }

    // CAPABILITY UNRESOLVED -> fail-closed. Hicbir mutasyon, audit veya yan etki olusmaz.
    throw new ForbiddenException(
      'enterprise_approval_capability_unresolved: bu aggregate icin kanonik approver ' +
        'politikasi tanimli degil; karar mutasyonu guvenli varsayilan olarak kapalidir',
    );
  }

  async submitDecision(
    tenantId: string,
    approvalRequestId: string,
    userId: string,
    userRole: UserRole,
    decision: ApprovalDecision,
    note?: string,
  ): Promise<{ approved: boolean; request: ApprovalRequest }> {
    const prismaAny = this.prisma as any;

    // Get the approval request
    let request: ApprovalRequest | null = null;
    try {
      request = await prismaAny.icrabotApprovalRequest?.findFirst({
        where: { id: approvalRequestId, tenantId },
      });
    } catch (e) {
      throw new NotFoundException('Approval request not found');
    }

    if (!request) {
      throw new NotFoundException('Approval request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Approval request is not pending');
    }

    // Check if user role is allowed to approve
    const rule = this.isApprovalRequired(request.riskLevel, request.lockId);
    if (rule && !rule.requiresRoles.includes(userRole)) {
      throw new BadRequestException(
        `Role ${userRole} is not authorized to approve this request`,
      );
    }

    // DEBTOR-ENTERPRISE-APPROVAL-AUTHORIZATION-P0-I01 (R02-F09A) — I01B STATE + AUDIT
    //
    // ONCEKI DAVRANIS: karar kaydi ONCE yaziliyor, ardindan `update({ where: { id } })`
    // ile — tenant yuklemi OLMADAN — durum degistiriliyordu; her iki yazma da
    // `catch -> logger.warn` ile YUTULUYOR ve cagirana yine "approved" donuluyordu.
    // Yani hicbir sey yazilmasa bile yanit basarili gorunuyordu.
    //
    // YENI DAVRANIS:
    //  - gecis ATOMIK bir predicate ile yapilir (id + tenantId + status=PENDING),
    //    boylece replay ve es zamanli ikinci karar tek kazanana indirgenir;
    //  - durum gecisi ile audit kaydi AYNI transaction icindedir: audit yazilamazsa
    //    gecis geri alinir ve basari yaniti URETILMEZ;
    //  - hicbir hata yutulmaz.
    if (!prismaAny.icrabotApprovalRequest || !prismaAny.icrabotApprovalDecision) {
      // Model yoksa sessizce "basarili" donmek yerine fail-closed.
      throw new ForbiddenException(
        'enterprise_approval_store_unavailable: approval kayit modeli cozumlenemedi',
      );
    }

    // Update request status
    const newStatus: ApprovalStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    
    await this.prisma.$transaction(async (tx: any) => {
      const transitioned = await tx.icrabotApprovalRequest.updateMany({
        where: { id: approvalRequestId, tenantId, status: 'PENDING' },
        data: { status: newStatus },
      });

      if (transitioned.count !== 1) {
        // Baska bir karar yarisi kazandi, kayit baska tenant'a ait veya artik PENDING degil.
        throw new BadRequestException('Approval request is not pending');
      }

      await tx.icrabotApprovalDecision.create({
        data: {
          approvalRequestId,
          userId,
          decision,
          note: note || null,
        },
      });
    });

    this.logger.log(`Approval ${approvalRequestId} ${newStatus} by ${userId}`);

    return {
      approved: decision === 'APPROVE',
      request: { ...request, status: newStatus },
    };
  }

  /**
   * Get pending approval requests for a tenant
   */
  async getPendingRequests(tenantId: string): Promise<ApprovalRequest[]> {
    const prismaAny = this.prisma as any;

    try {
      return await prismaAny.icrabotApprovalRequest?.findMany({
        where: { tenantId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      }) || [];
    } catch (e) {
      return [];
    }
  }
}
