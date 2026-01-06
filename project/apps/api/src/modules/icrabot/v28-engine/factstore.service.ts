/**
 * v28 FactStore Service
 * 
 * Dosya bazlı fact/flag depolama sistemi.
 * Python v28_factstore_actions/engine_v28/factstore_db/adapter.py'den port edildi.
 * 
 * Facts: JSON değerler (case.status, assets.vehicle.found, engine.risk.score)
 * Flags: Boolean değerler (HIGH_RISK, MANUAL_REVIEW_REQUIRED)
 * 
 * Features:
 * - Transaction-safe writes with row-level locking
 * - Audit trail for all changes
 * - Batch operations for performance
 * - Diff/compare utilities
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface FactSnapshot {
  facts: Record<string, any>;
  flags: Record<string, boolean>;
}

export interface WriteMetadata {
  runId?: string;
  ruleId?: string;
  source?: string;
  eventId?: string;
  // Action feedback fields (v28_policy_feedback)
  action_id?: string;
  action_type?: string;
  status?: string;
  kind?: string;
  [key: string]: any; // Allow additional metadata
}

export interface FactDiff {
  key: string;
  kind: 'fact' | 'flag';
  oldValue: any;
  newValue: any;
  changed: boolean;
}

export interface BatchWriteResult {
  factsWritten: number;
  flagsWritten: number;
  auditsCreated: number;
}

@Injectable()
export class FactStoreService {
  private readonly logger = new Logger(FactStoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Dosya için mevcut fact/flag snapshot'ını döner
   */
  async getSnapshot(caseId: string): Promise<FactSnapshot> {
    const [facts, flags] = await Promise.all([
      (this.prisma as any).icrabotCaseFact.findMany({
        where: { caseId },
        select: { key: true, value: true },
      }),
      (this.prisma as any).icrabotCaseFlag.findMany({
        where: { caseId },
        select: { key: true, value: true },
      }),
    ]);

    return {
      facts: Object.fromEntries(facts.map((f: any) => [f.key, f.value])),
      flags: Object.fromEntries(flags.map((f: any) => [f.key, f.value])),
    };
  }

  /**
   * Fact ve flag'leri yazar, audit log tutar
   */
  async write(
    caseId: string,
    facts: Record<string, any>,
    flags: Record<string, boolean>,
    meta: WriteMetadata,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx: any) => {
      // Facts
      for (const [key, newValue] of Object.entries(facts || {})) {
        const existing = await tx.icrabotCaseFact.findUnique({
          where: { caseId_key: { caseId, key } },
        });

        if (existing) {
          const oldValue = existing.value;
          if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            await tx.icrabotCaseFact.update({
              where: { caseId_key: { caseId, key } },
              data: { value: newValue },
            });
            await tx.icrabotFactAudit.create({
              data: {
                caseId,
                key,
                oldValue,
                newValue,
                kind: 'fact',
                meta,
              },
            });
          }
        } else {
          await tx.icrabotCaseFact.create({
            data: { caseId, key, value: newValue },
          });
          await tx.icrabotFactAudit.create({
            data: {
              caseId,
              key,
              oldValue: null,
              newValue,
              kind: 'fact',
              meta,
            },
          });
        }
      }

      // Flags
      for (const [key, newValue] of Object.entries(flags || {})) {
        const boolValue = Boolean(newValue);
        const existing = await tx.icrabotCaseFlag.findUnique({
          where: { caseId_key: { caseId, key } },
        });

        if (existing) {
          const oldValue = existing.value;
          if (oldValue !== boolValue) {
            await tx.icrabotCaseFlag.update({
              where: { caseId_key: { caseId, key } },
              data: { value: boolValue },
            });
            await tx.icrabotFactAudit.create({
              data: {
                caseId,
                key,
                oldValue,
                newValue: boolValue,
                kind: 'flag',
                meta,
              },
            });
          }
        } else {
          await tx.icrabotCaseFlag.create({
            data: { caseId, key, value: boolValue },
          });
          await tx.icrabotFactAudit.create({
            data: {
              caseId,
              key,
              oldValue: null,
              newValue: boolValue,
              kind: 'flag',
              meta,
            },
          });
        }
      }
    });

    this.logger.debug(`FactStore write: caseId=${caseId}, facts=${Object.keys(facts || {}).length}, flags=${Object.keys(flags || {}).length}`);
  }

  /**
   * Belirli bir fact değerini döner
   */
  async getFact(caseId: string, key: string): Promise<any> {
    const fact = await (this.prisma as any).icrabotCaseFact.findUnique({
      where: { caseId_key: { caseId, key } },
    });
    return fact?.value;
  }

  /**
   * Belirli bir flag değerini döner
   */
  async getFlag(caseId: string, key: string): Promise<boolean> {
    const flag = await (this.prisma as any).icrabotCaseFlag.findUnique({
      where: { caseId_key: { caseId, key } },
    });
    return flag?.value ?? false;
  }

  /**
   * Fact audit geçmişini döner
   */
  async getAuditHistory(caseId: string, limit = 100): Promise<any[]> {
    return (this.prisma as any).icrabotFactAudit.findMany({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ==================== v28_factstore_actions EXTENSIONS ====================

  /**
   * Batch write with optimized transaction (Python DBFactStore.write pattern)
   * Uses upsert for better performance
   */
  async batchWrite(
    caseId: string,
    facts: Record<string, any>,
    flags: Record<string, boolean>,
    meta: WriteMetadata,
  ): Promise<BatchWriteResult> {
    const result: BatchWriteResult = {
      factsWritten: 0,
      flagsWritten: 0,
      auditsCreated: 0,
    };

    await this.prisma.$transaction(async (tx: any) => {
      // Batch upsert facts
      for (const [key, newValue] of Object.entries(facts || {})) {
        // Get existing for audit
        const existing = await tx.icrabotCaseFact.findUnique({
          where: { caseId_key: { caseId, key } },
        });
        const oldValue = existing?.value ?? null;
        const changed = JSON.stringify(oldValue) !== JSON.stringify(newValue);

        // Upsert
        await tx.icrabotCaseFact.upsert({
          where: { caseId_key: { caseId, key } },
          create: { caseId, key, value: newValue },
          update: { value: newValue },
        });
        result.factsWritten++;

        // Audit only if changed
        if (changed) {
          await tx.icrabotFactAudit.create({
            data: { caseId, key, oldValue, newValue, kind: 'fact', meta },
          });
          result.auditsCreated++;
        }
      }

      // Batch upsert flags
      for (const [key, newValue] of Object.entries(flags || {})) {
        const boolValue = Boolean(newValue);
        const existing = await tx.icrabotCaseFlag.findUnique({
          where: { caseId_key: { caseId, key } },
        });
        const oldValue = existing?.value ?? null;
        const changed = oldValue !== boolValue;

        await tx.icrabotCaseFlag.upsert({
          where: { caseId_key: { caseId, key } },
          create: { caseId, key, value: boolValue },
          update: { value: boolValue },
        });
        result.flagsWritten++;

        if (changed) {
          await tx.icrabotFactAudit.create({
            data: { caseId, key, oldValue, newValue: boolValue, kind: 'flag', meta },
          });
          result.auditsCreated++;
        }
      }
    });

    this.logger.debug(
      `BatchWrite: caseId=${caseId}, facts=${result.factsWritten}, flags=${result.flagsWritten}, audits=${result.auditsCreated}`,
    );
    return result;
  }

  /**
   * Compares two snapshots and returns differences
   */
  diffSnapshots(before: FactSnapshot, after: FactSnapshot): FactDiff[] {
    const diffs: FactDiff[] = [];

    // Compare facts
    const allFactKeys = new Set([
      ...Object.keys(before.facts),
      ...Object.keys(after.facts),
    ]);
    for (const key of allFactKeys) {
      const oldValue = before.facts[key] ?? null;
      const newValue = after.facts[key] ?? null;
      const changed = JSON.stringify(oldValue) !== JSON.stringify(newValue);
      if (changed) {
        diffs.push({ key, kind: 'fact', oldValue, newValue, changed: true });
      }
    }

    // Compare flags
    const allFlagKeys = new Set([
      ...Object.keys(before.flags),
      ...Object.keys(after.flags),
    ]);
    for (const key of allFlagKeys) {
      const oldValue = before.flags[key] ?? false;
      const newValue = after.flags[key] ?? false;
      if (oldValue !== newValue) {
        diffs.push({ key, kind: 'flag', oldValue, newValue, changed: true });
      }
    }

    return diffs;
  }

  /**
   * Deletes all facts and flags for a case (with audit)
   */
  async clearCase(caseId: string, meta: WriteMetadata): Promise<void> {
    const snapshot = await this.getSnapshot(caseId);

    await this.prisma.$transaction(async (tx: any) => {
      // Audit deletions
      for (const [key, value] of Object.entries(snapshot.facts)) {
        await tx.icrabotFactAudit.create({
          data: { caseId, key, oldValue: value, newValue: null, kind: 'fact', meta },
        });
      }
      for (const [key, value] of Object.entries(snapshot.flags)) {
        await tx.icrabotFactAudit.create({
          data: { caseId, key, oldValue: value, newValue: null, kind: 'flag', meta },
        });
      }

      // Delete
      await tx.icrabotCaseFact.deleteMany({ where: { caseId } });
      await tx.icrabotCaseFlag.deleteMany({ where: { caseId } });
    });

    this.logger.log(`Cleared all facts/flags for case ${caseId}`);
  }

  /**
   * Sets multiple facts atomically
   */
  async setFacts(caseId: string, facts: Record<string, any>, meta: WriteMetadata): Promise<void> {
    await this.batchWrite(caseId, facts, {}, meta);
  }

  /**
   * Sets multiple flags atomically
   */
  async setFlags(caseId: string, flags: Record<string, boolean>, meta: WriteMetadata): Promise<void> {
    await this.batchWrite(caseId, {}, flags, meta);
  }

  /**
   * Gets facts matching a key pattern (e.g., "assets.*")
   */
  async getFactsByPattern(caseId: string, pattern: string): Promise<Record<string, any>> {
    // Convert glob pattern to SQL LIKE
    const likePattern = pattern.replace(/\*/g, '%').replace(/\?/g, '_');

    const facts = await (this.prisma as any).$queryRaw`
      SELECT key, value FROM icrabot_case_facts 
      WHERE case_id = ${caseId} AND key LIKE ${likePattern}
    `;

    return Object.fromEntries((facts as any[]).map((f) => [f.key, f.value]));
  }

  /**
   * Checks if a fact exists
   */
  async hasFact(caseId: string, key: string): Promise<boolean> {
    const count = await (this.prisma as any).icrabotCaseFact.count({
      where: { caseId, key },
    });
    return count > 0;
  }

  /**
   * Checks if a flag is set (true)
   */
  async isFlagSet(caseId: string, key: string): Promise<boolean> {
    const flag = await (this.prisma as any).icrabotCaseFlag.findUnique({
      where: { caseId_key: { caseId, key } },
    });
    return flag?.value === true;
  }

  /**
   * Increments a numeric fact value
   */
  async incrementFact(caseId: string, key: string, delta: number, meta: WriteMetadata): Promise<number> {
    const current = await this.getFact(caseId, key);
    const oldValue = typeof current === 'number' ? current : 0;
    const newValue = oldValue + delta;

    await this.write(caseId, { [key]: newValue }, {}, meta);
    return newValue;
  }

  /**
   * Appends to an array fact
   */
  async appendToFact(caseId: string, key: string, item: any, meta: WriteMetadata): Promise<any[]> {
    const current = await this.getFact(caseId, key);
    const oldArray = Array.isArray(current) ? current : [];
    const newArray = [...oldArray, item];

    await this.write(caseId, { [key]: newArray }, {}, meta);
    return newArray;
  }

  /**
   * Gets audit history for a specific key
   */
  async getKeyAuditHistory(caseId: string, key: string, limit = 50): Promise<any[]> {
    return (this.prisma as any).icrabotFactAudit.findMany({
      where: { caseId, key },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Gets all cases with a specific flag set
   */
  async getCasesWithFlag(key: string, value = true): Promise<string[]> {
    const flags = await (this.prisma as any).icrabotCaseFlag.findMany({
      where: { key, value },
      select: { caseId: true },
    });
    return flags.map((f: any) => f.caseId);
  }

  /**
   * Bulk snapshot for multiple cases
   */
  async getBulkSnapshots(caseIds: string[]): Promise<Map<string, FactSnapshot>> {
    const [facts, flags] = await Promise.all([
      (this.prisma as any).icrabotCaseFact.findMany({
        where: { caseId: { in: caseIds } },
        select: { caseId: true, key: true, value: true },
      }),
      (this.prisma as any).icrabotCaseFlag.findMany({
        where: { caseId: { in: caseIds } },
        select: { caseId: true, key: true, value: true },
      }),
    ]);

    const result = new Map<string, FactSnapshot>();

    // Initialize empty snapshots
    for (const caseId of caseIds) {
      result.set(caseId, { facts: {}, flags: {} });
    }

    // Populate facts
    for (const f of facts as any[]) {
      const snapshot = result.get(f.caseId)!;
      snapshot.facts[f.key] = f.value;
    }

    // Populate flags
    for (const f of flags as any[]) {
      const snapshot = result.get(f.caseId)!;
      snapshot.flags[f.key] = f.value;
    }

    return result;
  }
}
