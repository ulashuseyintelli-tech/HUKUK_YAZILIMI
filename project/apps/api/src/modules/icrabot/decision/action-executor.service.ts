/**
 * ACTION EXECUTOR SERVICE (v26)
 * 
 * Decision rules 'then' executor:
 * - enqueue: [recipe_id...]
 * - open_lock: "LOCK_..."
 * - set_flag: {key: value}
 * - emit: "EVENT_NAME" veya ["E1","E2"]
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionThen } from './decision-rules-loader.service';

export interface ActionResult {
  enqueued: number;
  locksOpened: number;
  flagsSet: number;
  eventsEmitted: number;
}

@Injectable()
export class ActionExecutorService {
  private readonly logger = new Logger(ActionExecutorService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Execute 'then' actions from a decision rule
   */
  async execute(
    caseId: string,
    tenantId: string,
    debtorId: string | null,
    then: DecisionThen,
    triggerFactType: string,
    triggerFactKey: string,
  ): Promise<ActionResult> {
    const result: ActionResult = {
      enqueued: 0,
      locksOpened: 0,
      flagsSet: 0,
      eventsEmitted: 0,
    };

    // 1. Enqueue recipes
    if (then.enqueue && Array.isArray(then.enqueue)) {
      for (const recipeId of then.enqueue) {
        if (typeof recipeId !== 'string') continue;

        // Check if job already exists
        const existing = await this.prisma.icrabotJobRun.findFirst({
          where: {
            caseId,
            tenantId,
            recipeId,
            status: { in: ['QUEUED', 'RUNNING'] },
          },
        });

        if (!existing) {
          const jobId = `job_${caseId}_${recipeId}_${Date.now()}`;
          await this.prisma.icrabotJobRun.create({
            data: {
              jobId,
              caseId,
              tenantId,
              recipeId,
              recipeVersion: 1,
              status: 'QUEUED',
              riskLevel: 'MEDIUM',
              attempt: 0,
              maxAttempts: 4,
            },
          });
          result.enqueued++;
        }
      }
    }

    // 2. Open locks
    const openLock = then.open_lock;
    if (openLock) {
      const lockIds = Array.isArray(openLock) ? openLock : [openLock];
      for (const lockId of lockIds) {
        if (typeof lockId !== 'string') continue;

        await this.prisma.icrabotLock.upsert({
          where: {
            tenantId_caseId_lockType: {
              tenantId,
              caseId,
              lockType: lockId,
            },
          },
          create: {
            caseId,
            tenantId,
            lockType: lockId,
            isOpen: true,
            reason: `rule_lock from fact ${triggerFactType}:${triggerFactKey}`,
          },
          update: {
            isOpen: true,
            reason: `rule_lock from fact ${triggerFactType}:${triggerFactKey}`,
            updatedAt: new Date(),
          },
        });
        result.locksOpened++;
      }
    }

    // 3. Set flags (write as Fact type=Flag)
    if (then.set_flag && typeof then.set_flag === 'object') {
      for (const [key, value] of Object.entries(then.set_flag)) {
        const factHash = this.hashString(`Flag:${key}`);
        
        await this.prisma.icrabotFact.upsert({
          where: {
            tenantId_caseId_factHash: {
              tenantId,
              caseId,
              factHash,
            },
          },
          create: {
            caseId,
            tenantId,
            factType: 'Flag',
            factKey: key,
            factHash,
            value: { value },
          },
          update: {
            value: { value },
            updatedAt: new Date(),
          },
        });
        result.flagsSet++;
      }
    }

    // 4. Emit events (write as Fact type=Event)
    const emit = then.emit;
    if (emit) {
      const events = Array.isArray(emit) ? emit : [emit];
      for (const eventName of events) {
        if (typeof eventName !== 'string') continue;

        const factHash = this.hashString(`Event:${eventName}:${Date.now()}`);
        
        await this.prisma.icrabotFact.create({
          data: {
            caseId,
            tenantId,
            factType: 'Event',
            factKey: eventName,
            factHash,
            value: { from: 'decision_rule', timestamp: new Date().toISOString() },
          },
        });
        result.eventsEmitted++;
      }
    }

    return result;
  }

  /**
   * Simple hash function for fact deduplication
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }
}
