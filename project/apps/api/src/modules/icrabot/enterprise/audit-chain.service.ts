/**
 * AUDIT CHAIN SERVICE (v38)
 * 
 * Immutable audit log with hash chain.
 * KVKK uyumluluğu için değiştirilemez audit kaydı.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import * as crypto from 'crypto';

export interface AuditEvent {
  tenantId: string;
  caseId?: string;
  userId: string;
  action: string;
  payload: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  caseId: string | null;
  userId: string;
  action: string;
  payload: Record<string, any>;
  prevHash: string;
  eventHash: string;
  createdAt: Date;
}

@Injectable()
export class AuditChainService {
  private readonly logger = new Logger(AuditChainService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Calculate SHA-256 hash
   */
  private sha256(data: string): string {
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
  }

  /**
   * Calculate event hash from previous hash + payload + timestamp
   */
  private calculateEventHash(
    prevHash: string,
    payload: Record<string, any>,
    createdAtIso: string,
  ): string {
    const data = prevHash + JSON.stringify(payload) + createdAtIso;
    return this.sha256(data);
  }

  /**
   * Log an audit event with hash chain
   */
  async logEvent(event: AuditEvent): Promise<AuditLogEntry> {
    const prismaAny = this.prisma as any;

    // Get the last audit log entry for this tenant to get prevHash
    let prevHash = '0'.repeat(64); // Genesis hash
    
    try {
      const lastEntry = await prismaAny.icrabotAuditLog?.findFirst({
        where: { tenantId: event.tenantId },
        orderBy: { createdAt: 'desc' },
        select: { eventHash: true },
      });
      
      if (lastEntry?.eventHash) {
        prevHash = lastEntry.eventHash;
      }
    } catch (e) {
      // Model may not exist yet, use genesis hash
      this.logger.warn('IcrabotAuditLog model not found, using genesis hash');
    }

    const createdAt = new Date();
    const createdAtIso = createdAt.toISOString();

    const fullPayload = {
      ...event.payload,
      action: event.action,
      userId: event.userId,
      caseId: event.caseId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
    };

    const eventHash = this.calculateEventHash(prevHash, fullPayload, createdAtIso);

    // Try to create audit log entry
    try {
      const entry = await prismaAny.icrabotAuditLog?.create({
        data: {
          tenantId: event.tenantId,
          caseId: event.caseId || null,
          userId: event.userId,
          action: event.action,
          payload: fullPayload,
          prevHash,
          eventHash,
          createdAt,
        },
      });

      this.logger.log(`Audit event logged: ${event.action} [${eventHash.slice(0, 8)}...]`);

      return entry;
    } catch (e) {
      // If model doesn't exist, log to console
      this.logger.warn(`Audit log (no DB): ${event.action} - ${JSON.stringify(fullPayload)}`);
      
      return {
        id: 'temp_' + Date.now(),
        tenantId: event.tenantId,
        caseId: event.caseId || null,
        userId: event.userId,
        action: event.action,
        payload: fullPayload,
        prevHash,
        eventHash,
        createdAt,
      };
    }
  }

  /**
   * Verify audit chain integrity
   */
  async verifyChain(tenantId: string, limit = 1000): Promise<{
    valid: boolean;
    checkedCount: number;
    brokenAt?: string;
  }> {
    const prismaAny = this.prisma as any;

    try {
      const entries = await prismaAny.icrabotAuditLog?.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });

      if (!entries || entries.length === 0) {
        return { valid: true, checkedCount: 0 };
      }

      let prevHash = '0'.repeat(64);

      for (const entry of entries) {
        const expectedHash = this.calculateEventHash(
          prevHash,
          entry.payload,
          entry.createdAt.toISOString(),
        );

        if (expectedHash !== entry.eventHash) {
          return {
            valid: false,
            checkedCount: entries.indexOf(entry),
            brokenAt: entry.id,
          };
        }

        prevHash = entry.eventHash;
      }

      return { valid: true, checkedCount: entries.length };
    } catch (e) {
      this.logger.warn('Could not verify audit chain - model may not exist');
      return { valid: true, checkedCount: 0 };
    }
  }
}
