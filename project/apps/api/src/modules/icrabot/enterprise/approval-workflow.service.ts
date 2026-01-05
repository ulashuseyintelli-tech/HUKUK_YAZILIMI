/**
 * APPROVAL WORKFLOW SERVICE (v38)
 * 
 * Yüksek etkili aksiyonlar için onay workflow'u.
 * Risk level veya lock bazlı zorunlu onay.
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
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

    // Record the decision
    try {
      await prismaAny.icrabotApprovalDecision?.create({
        data: {
          approvalRequestId,
          userId,
          decision,
          note: note || null,
        },
      });
    } catch (e) {
      this.logger.warn('Could not record approval decision');
    }

    // Update request status
    const newStatus: ApprovalStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    
    try {
      await prismaAny.icrabotApprovalRequest?.update({
        where: { id: approvalRequestId },
        data: { status: newStatus },
      });
    } catch (e) {
      this.logger.warn('Could not update approval request status');
    }

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
