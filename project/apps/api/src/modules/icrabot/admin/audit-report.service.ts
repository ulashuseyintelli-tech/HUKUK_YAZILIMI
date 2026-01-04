/**
 * AUDIT REPORT SERVICE (v12)
 * 
 * Audit kanıt paketi oluşturma ve export.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuditPackage,
  AuditPackageHeader,
  AuditPackageSections,
  AuditEventItem,
  AuditFactItem,
  AuditDecisionItem,
  AuditJobItem,
  AuditEvidenceItem,
  AuditFilter,
  AuditExportOptions,
  AuditTimelineEntry,
  AUDIT_REPORT_CONFIG,
  PII_MASKING_RULES,
  computeHash,
} from '../config/audit-report.config';

@Injectable()
export class AuditReportService {
  constructor(private prisma: PrismaService) {}

  // ==================== AUDIT PACKAGE ====================

  async generateAuditPackage(
    caseId: string,
    tenantId: string,
    userId: string,
    options?: AuditExportOptions,
  ): Promise<AuditPackage> {
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true, uyapDosyaNo: true },
    });

    if (!caseData) {
      throw new NotFoundException(`Dosya bulunamadı: ${caseId}`);
    }

    const header: AuditPackageHeader = {
      caseId,
      uyapDosyaNo: caseData.uyapDosyaNo || '',
      generatedAt: new Date(),
      generatedBy: userId,
      tenantId,
    };

    const sections = await this.collectSections(caseId, tenantId, options);

    // Apply PII masking if enabled
    if (options?.maskPii ?? AUDIT_REPORT_CONFIG.piiMaskingEnabled) {
      this.maskPiiInSections(sections);
    }

    const packageHash = computeHash({ header, sections });

    return {
      header,
      sections,
      integrity: {
        packageHash,
        signature: undefined, // TODO: Implement signing
      },
    };
  }

  private async collectSections(
    caseId: string,
    tenantId: string,
    options?: AuditExportOptions,
  ): Promise<AuditPackageSections> {
    const dateFilter = options?.dateRange
      ? {
          createdAt: {
            gte: options.dateRange.from,
            lte: options.dateRange.to,
          },
        }
      : {};

    // Collect events
    const events = await this.prisma.icrabotEvent.findMany({
      where: { caseId, tenantId, ...dateFilter },
      orderBy: { createdAt: 'asc' },
    });

    // Collect facts
    const facts = await this.prisma.icrabotFact.findMany({
      where: { caseId, tenantId, ...dateFilter },
      orderBy: { createdAt: 'asc' },
    });

    // Collect decisions
    const decisions = await this.prisma.icrabotDecision.findMany({
      where: { caseId, tenantId, ...dateFilter },
      orderBy: { createdAt: 'asc' },
    });

    // Collect jobs
    const jobs = await this.prisma.icrabotJobRun.findMany({
      where: { caseId, tenantId, ...dateFilter },
      orderBy: { startedAt: 'asc' },
    });

    // Collect evidence
    const evidence = await this.prisma.icrabotEvidence.findMany({
      where: { caseId, tenantId, ...dateFilter },
      orderBy: { createdAt: 'asc' },
    });

    return {
      events: events.map(e => ({
        eventId: e.id,
        ts: e.createdAt,
        type: e.eventType,
        payloadHash: computeHash(e.payload),
      })),
      facts: facts.map(f => ({
        factType: f.factType,
        key: f.key,
        valueHash: computeHash(f.value),
        snapshotId: f.snapshotId || '',
      })),
      decisions: decisions.map(d => ({
        ruleId: d.ruleId,
        inputHash: computeHash(d.input),
        outputHash: computeHash(d.output),
        ts: d.createdAt,
      })),
      jobs: jobs.map(j => ({
        jobId: j.jobId,
        recipeId: j.recipeId,
        status: j.status,
        startedAt: j.startedAt,
        finishedAt: j.finishedAt || undefined,
      })),
      evidence: evidence.map(e => ({
        snapshotId: e.snapshotId,
        snapshotHash: e.snapshotHash,
        screenshotPath: e.screenshotPath || undefined,
        documentRefs: (e.documentRefs as string[]) || [],
      })),
    };
  }

  private maskPiiInSections(sections: AuditPackageSections): void {
    // PII masking is applied at hash level, actual values are not stored
    // This is a placeholder for additional masking logic if needed
  }

  // ==================== TIMELINE ====================

  async getCaseTimeline(
    caseId: string,
    tenantId: string,
    options?: { from?: Date; to?: Date },
  ): Promise<AuditTimelineEntry[]> {
    const dateFilter = options
      ? {
          createdAt: {
            ...(options.from && { gte: options.from }),
            ...(options.to && { lte: options.to }),
          },
        }
      : {};

    // Fetch all timeline items
    const [events, facts, decisions, jobs] = await Promise.all([
      this.prisma.icrabotEvent.findMany({
        where: { caseId, tenantId, ...dateFilter },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.icrabotFact.findMany({
        where: { caseId, tenantId, ...dateFilter },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.icrabotDecision.findMany({
        where: { caseId, tenantId, ...dateFilter },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.icrabotJobRun.findMany({
        where: { caseId, tenantId, ...dateFilter },
        orderBy: { startedAt: 'asc' },
      }),
    ]);

    // Combine and sort
    const timeline: AuditTimelineEntry[] = [
      ...events.map(e => ({
        id: e.id,
        ts: e.createdAt,
        type: 'event' as const,
        title: e.eventType,
        description: this.formatEventDescription(e),
        snapshotHash: undefined,
        proofRefs: undefined,
        relatedJobIds: undefined,
      })),
      ...facts.map(f => ({
        id: f.id,
        ts: f.createdAt,
        type: 'fact' as const,
        title: `${f.factType}: ${f.key}`,
        description: this.formatFactDescription(f),
        snapshotHash: f.snapshotId || undefined,
        proofRefs: undefined,
        relatedJobIds: undefined,
      })),
      ...decisions.map(d => ({
        id: d.id,
        ts: d.createdAt,
        type: 'decision' as const,
        title: d.ruleId,
        description: this.formatDecisionDescription(d),
        snapshotHash: undefined,
        proofRefs: undefined,
        relatedJobIds: undefined,
      })),
      ...jobs.map(j => ({
        id: j.id,
        ts: j.startedAt,
        type: 'job' as const,
        title: j.recipeId,
        description: this.formatJobDescription(j),
        snapshotHash: undefined,
        proofRefs: undefined,
        relatedJobIds: [j.jobId],
      })),
    ];

    // Sort by timestamp
    timeline.sort((a, b) => a.ts.getTime() - b.ts.getTime());

    return timeline;
  }

  private formatEventDescription(event: any): string {
    const payload = event.payload as Record<string, unknown>;
    return JSON.stringify(payload).slice(0, 200);
  }

  private formatFactDescription(fact: any): string {
    const value = fact.value;
    if (typeof value === 'object') {
      return JSON.stringify(value).slice(0, 200);
    }
    return String(value).slice(0, 200);
  }

  private formatDecisionDescription(decision: any): string {
    const output = decision.output as Record<string, unknown>;
    return JSON.stringify(output).slice(0, 200);
  }

  private formatJobDescription(job: any): string {
    const status = job.status;
    const duration = job.durationMs ? `${(job.durationMs / 1000).toFixed(1)}s` : '-';
    const error = job.lastErrorMessage ? ` - ${job.lastErrorMessage}` : '';
    return `${status} (${duration})${error}`;
  }

  // ==================== EXPORT ====================

  async exportAuditPackage(
    caseId: string,
    tenantId: string,
    userId: string,
    options: AuditExportOptions,
  ): Promise<{ data: Buffer; filename: string; contentType: string }> {
    const auditPackage = await this.generateAuditPackage(caseId, tenantId, userId, options);

    switch (options.format) {
      case 'json':
        return this.exportAsJson(auditPackage, caseId);
      case 'pdf':
        return this.exportAsPdf(auditPackage, caseId);
      case 'zip':
        return this.exportAsZip(auditPackage, caseId, options);
      default:
        return this.exportAsJson(auditPackage, caseId);
    }
  }

  private exportAsJson(
    auditPackage: AuditPackage,
    caseId: string,
  ): { data: Buffer; filename: string; contentType: string } {
    const json = JSON.stringify(auditPackage, null, 2);
    return {
      data: Buffer.from(json, 'utf-8'),
      filename: `audit_${caseId}_${Date.now()}.json`,
      contentType: 'application/json',
    };
  }

  private exportAsPdf(
    auditPackage: AuditPackage,
    caseId: string,
  ): { data: Buffer; filename: string; contentType: string } {
    // TODO: Implement PDF generation with pdfkit
    // For now, return JSON as placeholder
    const json = JSON.stringify(auditPackage, null, 2);
    return {
      data: Buffer.from(json, 'utf-8'),
      filename: `audit_${caseId}_${Date.now()}.pdf`,
      contentType: 'application/pdf',
    };
  }

  private exportAsZip(
    auditPackage: AuditPackage,
    caseId: string,
    options: AuditExportOptions,
  ): { data: Buffer; filename: string; contentType: string } {
    // TODO: Implement ZIP generation with archiver
    // Include screenshots if options.includeScreenshots
    const json = JSON.stringify(auditPackage, null, 2);
    return {
      data: Buffer.from(json, 'utf-8'),
      filename: `audit_${caseId}_${Date.now()}.zip`,
      contentType: 'application/zip',
    };
  }

  // ==================== EVIDENCE ====================

  async getEvidence(
    caseId: string,
    tenantId: string,
    snapshotId?: string,
  ): Promise<AuditEvidenceItem[]> {
    const evidence = await this.prisma.icrabotEvidence.findMany({
      where: {
        caseId,
        tenantId,
        ...(snapshotId && { snapshotId }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return evidence.map(e => ({
      snapshotId: e.snapshotId,
      snapshotHash: e.snapshotHash,
      screenshotPath: e.screenshotPath || undefined,
      documentRefs: (e.documentRefs as string[]) || [],
    }));
  }

  async downloadEvidence(
    snapshotId: string,
    tenantId: string,
  ): Promise<{ data: Buffer; filename: string; contentType: string }> {
    const evidence = await this.prisma.icrabotEvidence.findFirst({
      where: { snapshotId, tenantId },
    });

    if (!evidence) {
      throw new NotFoundException(`Kanıt bulunamadı: ${snapshotId}`);
    }

    // TODO: Implement actual file retrieval from storage
    const data = Buffer.from(JSON.stringify(evidence), 'utf-8');
    return {
      data,
      filename: `evidence_${snapshotId}.json`,
      contentType: 'application/json',
    };
  }
}
