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
import { OutboxScope } from './outbox-scope';
import { assertCaseInScope, filterCaseIdsInScope } from './case-scope';
// UYAP-LEGACY-POA-FLAG-DEPRECATION-I01: computed fact'ler ELLE yazılamaz (fail-closed).
// Bu depo serbest anahtarlıdır ve `POST /v28-engine/:caseId/flag/:key` ile İSTEMCİ
// TARAFINDAN erişilebilirdi → `case.has_power_of_attorney = true` gibi sahte bir yetki
// kaydı üretilebiliyordu. Sahiplik kaydı policy-engine'de TEK yerde tutulur.
import { assertManuallyWritableFactKeys } from '../../policy-engine/fact-store/computed-fact-ownership';

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
   * Dosya için mevcut fact/flag snapshot'ını döner.
   *
   * V28-TENANT-ISOLATION-CLOSEOUT-R01: kapsam ZORUNLU. Kapsam disi case icin
   * fail-closed `NotFoundException` (yabanci ve olmayan case ayni yanit).
   */
  async getSnapshot(caseId: string, scope: OutboxScope): Promise<FactSnapshot> {
    await assertCaseInScope(this.prisma as any, caseId, scope);

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
    scope: OutboxScope,
  ): Promise<void> {
    // I06: computed-owned anahtar varsa transaction HİÇ açılmaz (tümü ya da hiçbiri).
    assertManuallyWritableFactKeys([
      ...Object.keys(facts || {}),
      ...Object.keys(flags || {}),
    ]);
    await this.prisma.$transaction(async (tx: any) => {
      // Kapsam kapisi mutation ile AYNI transaction icinde (TOCTOU yok).
      await assertCaseInScope(tx, caseId, scope);

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
  async getFact(caseId: string, key: string, scope: OutboxScope): Promise<any> {
    await assertCaseInScope(this.prisma as any, caseId, scope);

    const fact = await (this.prisma as any).icrabotCaseFact.findUnique({
      where: { caseId_key: { caseId, key } },
    });
    return fact?.value;
  }

  /**
   * Belirli bir flag değerini döner
   */
  async getFlag(caseId: string, key: string, scope: OutboxScope): Promise<boolean> {
    await assertCaseInScope(this.prisma as any, caseId, scope);

    const flag = await (this.prisma as any).icrabotCaseFlag.findUnique({
      where: { caseId_key: { caseId, key } },
    });
    return flag?.value ?? false;
  }

  /**
   * Fact audit geçmişini döner
   */
  async getAuditHistory(caseId: string, scope: OutboxScope, limit = 100): Promise<any[]> {
    await assertCaseInScope(this.prisma as any, caseId, scope);

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
    scope: OutboxScope,
  ): Promise<BatchWriteResult> {
    // I06: computed-owned anahtar varsa hiçbir yazım yapılmaz (setFacts/setFlags ve
    // `POST /v28-engine/:caseId/{fact,flag}/:key` bu yoldan geçer).
    assertManuallyWritableFactKeys([
      ...Object.keys(facts || {}),
      ...Object.keys(flags || {}),
    ]);
    const result: BatchWriteResult = {
      factsWritten: 0,
      flagsWritten: 0,
      auditsCreated: 0,
    };

    await this.prisma.$transaction(async (tx: any) => {
      // Kapsam kapisi mutation ile AYNI transaction icinde (TOCTOU yok).
      await assertCaseInScope(tx, caseId, scope);

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
   * Deletes all facts and flags for a case (with audit).
   *
   * V28-FACTSTORE-SECURITY-P0-I01: yikici yol artik tenant kapsami ZORUNLU. Kapsam
   * dogrulamasi, audit yazimi ve silme tek transaction icinde atomiktir; kapsam disi
   * case icin HICBIR audit satiri yazilmaz ve HICBIR silme yapilmaz.
   *
   * /// <remarks>
   * /// Cagrildigi yerler:
   * /// - FactStoreController.clearCase() -> DELETE /icrabot/v28/facts/:caseId
   * /// - FactStoreController.clearCasePost() -> POST /icrabot/v28/facts/:caseId/clear
   * /// - ScenarioHarnessService.clearTestData() -> senaryo oncesi temizlik (dev/test yuzeyi)
   * /// </remarks>
   */
  async clearCase(
    caseId: string,
    meta: WriteMetadata,
    scope: OutboxScope,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx: any) => {
      // Kapsam kapisi: silmeden ONCE, ayni transaction icinde (TOCTOU'suz).
      await assertCaseInScope(tx, caseId, scope);

      // Snapshot da transaction icinde okunur: audit edilen deger ile silinen deger ayni.
      const [facts, flags] = await Promise.all([
        tx.icrabotCaseFact.findMany({
          where: { caseId },
          select: { key: true, value: true },
        }),
        tx.icrabotCaseFlag.findMany({
          where: { caseId },
          select: { key: true, value: true },
        }),
      ]);

      // Audit deletions
      for (const { key, value } of facts as Array<{ key: string; value: any }>) {
        await tx.icrabotFactAudit.create({
          data: { caseId, key, oldValue: value, newValue: null, kind: 'fact', meta },
        });
      }
      for (const { key, value } of flags as Array<{ key: string; value: any }>) {
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
  async setFacts(
    caseId: string,
    facts: Record<string, any>,
    meta: WriteMetadata,
    scope: OutboxScope,
  ): Promise<void> {
    await this.batchWrite(caseId, facts, {}, meta, scope);
  }

  /**
   * Sets multiple flags atomically
   */
  async setFlags(
    caseId: string,
    flags: Record<string, boolean>,
    meta: WriteMetadata,
    scope: OutboxScope,
  ): Promise<void> {
    await this.batchWrite(caseId, {}, flags, meta, scope);
  }

  /**
   * Gets facts matching a key pattern (e.g., "assets.*")
   */
  async getFactsByPattern(
    caseId: string,
    pattern: string,
    scope: OutboxScope,
  ): Promise<Record<string, any>> {
    await assertCaseInScope(this.prisma as any, caseId, scope);

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
  async hasFact(caseId: string, key: string, scope: OutboxScope): Promise<boolean> {
    await assertCaseInScope(this.prisma as any, caseId, scope);

    const count = await (this.prisma as any).icrabotCaseFact.count({
      where: { caseId, key },
    });
    return count > 0;
  }

  /**
   * Checks if a flag is set (true)
   */
  async isFlagSet(caseId: string, key: string, scope: OutboxScope): Promise<boolean> {
    await assertCaseInScope(this.prisma as any, caseId, scope);

    const flag = await (this.prisma as any).icrabotCaseFlag.findUnique({
      where: { caseId_key: { caseId, key } },
    });
    return flag?.value === true;
  }

  /**
   * Increments a numeric fact value
   */
  async incrementFact(
    caseId: string,
    key: string,
    delta: number,
    meta: WriteMetadata,
    scope: OutboxScope,
  ): Promise<number> {
    const current = await this.getFact(caseId, key, scope);
    const oldValue = typeof current === 'number' ? current : 0;
    const newValue = oldValue + delta;

    await this.write(caseId, { [key]: newValue }, {}, meta, scope);
    return newValue;
  }

  /**
   * Appends to an array fact
   */
  async appendToFact(
    caseId: string,
    key: string,
    item: any,
    meta: WriteMetadata,
    scope: OutboxScope,
  ): Promise<any[]> {
    const current = await this.getFact(caseId, key, scope);
    const oldArray = Array.isArray(current) ? current : [];
    const newArray = [...oldArray, item];

    await this.write(caseId, { [key]: newArray }, {}, meta, scope);
    return newArray;
  }

  /**
   * Gets audit history for a specific key
   */
  async getKeyAuditHistory(
    caseId: string,
    key: string,
    scope: OutboxScope,
    limit = 50,
  ): Promise<any[]> {
    await assertCaseInScope(this.prisma as any, caseId, scope);

    return (this.prisma as any).icrabotFactAudit.findMany({
      where: { caseId, key },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Gets all cases with a specific flag set.
   *
   * V28-TENANT-ISOLATION-CLOSEOUT-R01 — GLOBAL ENUMERATION KAPATILDI. Onceki hali
   * `key`/`value` ile TUM tenant'lardaki case kimliklerini donduruyordu; artik
   * sonuc kumesi cagiranin kapsamina indirgenir. `IcrabotCaseFlag` tenantId
   * TASIMADIGI icin filtre `Case` uzerinden kurulur.
   */
  async getCasesWithFlag(
    key: string,
    value = true,
    scope: OutboxScope,
  ): Promise<string[]> {
    const flags = await (this.prisma as any).icrabotCaseFlag.findMany({
      where: { key, value },
      select: { caseId: true },
    });

    const caseIds = flags.map((f: any) => f.caseId as string);
    return filterCaseIdsInScope(this.prisma as any, caseIds, scope);
  }

  /**
   * Bulk snapshot for multiple cases.
   *
   * V28-TENANT-ISOLATION-CLOSEOUT-R01: kapsam disi kimlikler DB'ye hic sorulmadan
   * elenir. Sonuc haritasi yalnizca kapsamdaki case'leri icerir — kapsam disi bir
   * kimlik icin bos snapshot bile DONMEZ (aksi halde "bu case var mi" sorusuna
   * dolayli yanit verilmis olurdu).
   */
  async getBulkSnapshots(
    caseIds: string[],
    scope: OutboxScope,
  ): Promise<Map<string, FactSnapshot>> {
    const scopedIds = await filterCaseIdsInScope(this.prisma as any, caseIds, scope);

    const result = new Map<string, FactSnapshot>();
    if (scopedIds.length === 0) return result;

    const [facts, flags] = await Promise.all([
      (this.prisma as any).icrabotCaseFact.findMany({
        where: { caseId: { in: scopedIds } },
        select: { caseId: true, key: true, value: true },
      }),
      (this.prisma as any).icrabotCaseFlag.findMany({
        where: { caseId: { in: scopedIds } },
        select: { caseId: true, key: true, value: true },
      }),
    ]);

    // Initialize empty snapshots (yalniz kapsamdakiler)
    for (const caseId of scopedIds) {
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
