/**
 * AUDIT EXPORT SERVICE (v14)
 * 
 * Dosya bazlı audit kanıt paketi export.
 * - Snapshots, Facts, Jobs, Evidence
 * - ZIP formatında export
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import * as crypto from 'crypto';

export interface AuditExportResult {
  exportId: string;
  caseId: string;
  filename: string;
  hash: string;
  size: number;
  createdAt: Date;
}

export interface AuditPackageContent {
  case: {
    id: string;
    uyapDosyaNo: string;
    stage: string;
    icraType: string;
  };
  generatedAt: string;
  generatedBy: string;
  snapshots: Array<{
    id: string;
    snapshotId: string;
    snapshotHash: string;
    createdAt: string;
  }>;
  jobs: Array<{
    id: string;
    jobId: string;
    recipeId: string;
    status: string;
    attempt: number;
    startedAt?: string;
    finishedAt?: string;
    steps: Array<{
      stepNo: number;
      actionType: string;
      status: string;
      proofRef?: string | null;
    }>;
  }>;
  evidence: Array<{
    snapshotId: string;
    snapshotHash: string;
    screenshotUrl?: string | null;
  }>;
}

@Injectable()
export class AuditExportService {
  constructor(private prisma: PrismaService) {}

  async exportCaseAudit(
    caseId: string,
    tenantId: string,
    requestedBy: string,
  ): Promise<{ buffer: Buffer; result: AuditExportResult }> {
    // Get case
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: {
        id: true,
        uyapDosyaNo: true,
        workflowStage: true,
        type: true,
      },
    });

    if (!caseData) {
      throw new NotFoundException('Dosya bulunamadı');
    }

    // Collect audit data
    const [snapshots, jobs, evidence] = await Promise.all([
      this.prisma.icrabotEvidence.findMany({
        where: { caseId, tenantId },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.icrabotJobRun.findMany({
        where: { caseId, tenantId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { steps: true },
      }),
      this.prisma.icrabotEvidence.findMany({
        where: { caseId, tenantId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    // Build package
    const packageContent: AuditPackageContent = {
      case: {
        id: caseData.id,
        uyapDosyaNo: caseData.uyapDosyaNo || '',
        stage: caseData.workflowStage,
        icraType: caseData.type,
      },
      generatedAt: new Date().toISOString(),
      generatedBy: requestedBy,
      snapshots: snapshots.map((s) => ({
        id: s.id,
        snapshotId: s.snapshotId,
        snapshotHash: s.snapshotHash,
        createdAt: s.createdAt.toISOString(),
      })),
      jobs: jobs.map((j) => ({
        id: j.id,
        jobId: j.jobId,
        recipeId: j.recipeId,
        status: j.status,
        attempt: j.attempt,
        startedAt: j.startedAt?.toISOString(),
        finishedAt: j.finishedAt?.toISOString(),
        steps: j.steps.map((s) => ({
          stepNo: s.stepNo,
          actionType: s.actionType,
          status: s.status,
          proofRef: s.proofRef,
        })),
      })),
      evidence: evidence.map((e) => ({
        snapshotId: e.snapshotId,
        snapshotHash: e.snapshotHash,
        screenshotUrl: e.screenshotUrl,
      })),
    };

    // Create JSON buffer (simplified - no archiver dependency)
    const jsonContent = JSON.stringify(packageContent, null, 2);
    const buffer = Buffer.from(jsonContent, 'utf-8');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Record export
    const exportId = `exp_${caseId}_${Date.now()}`;
    const exportRecord = await this.prisma.icrabotEvidenceExport.create({
      data: {
        caseId,
        tenantId,
        exportId,
        requestedBy,
        format: 'json',
        snapshotCount: snapshots.length,
        jobCount: jobs.length,
        status: 'completed',
        fileSize: buffer.length,
      },
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `audit_${caseId}_${timestamp}.json`;

    return {
      buffer,
      result: {
        exportId: exportRecord.exportId,
        caseId,
        filename,
        hash,
        size: buffer.length,
        createdAt: exportRecord.createdAt,
      },
    };
  }

  async getExportHistory(caseId: string, tenantId: string): Promise<Array<{
    id: string;
    exportId: string;
    format: string;
    status: string;
    fileSize: number | null;
    snapshotCount: number;
    jobCount: number;
    createdAt: Date;
  }>> {
    const exports = await this.prisma.icrabotEvidenceExport.findMany({
      where: { caseId, tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        exportId: true,
        format: true,
        status: true,
        fileSize: true,
        snapshotCount: true,
        jobCount: true,
        createdAt: true,
      },
    });

    return exports;
  }
}
