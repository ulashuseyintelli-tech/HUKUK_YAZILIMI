/**
 * v28 Engine Runner Service
 * 
 * YAML kurallarını çalıştıran ana motor.
 * Python v28_engine_runner/engine_v28/engine_runner/runner.py'den port edildi.
 * 
 * Flow:
 * 1. Event gelir
 * 2. FactStore'dan snapshot alınır
 * 3. Rule'un "when" clause'u değerlendirilir
 * 4. Eşleşirse "then" bloğu çalıştırılır:
 *    - compute: Hesaplamalar (risk, recovery)
 *    - write: Fact/flag yazma
 *    - decisions: Karar ağacı → actions
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { FactStoreService, FactSnapshot } from './factstore.service';
import { TimelineService } from './timeline.service';
import { OutboxService } from './outbox.service';
import { ExpressionEvaluatorService, EvaluationContext, WhenClause } from './expression-evaluator.service';
import { ComputeRegistryService } from './compute-registry.service';
import * as crypto from 'crypto';

export interface RuleDefinition {
  version?: string;
  rule_id: string;
  when?: WhenClause;
  then?: {
    compute?: ComputeStep[];
    write?: WriteBlock;
    decisions?: DecisionBlock[];
  };
  // Rule metadata (v28_rulepack_versioning)
  _meta?: {
    revisionId?: string;
    version?: number;
    sha256?: string;
    packName?: string;
    ruleKey?: string;
  };
}

export interface ComputeStep {
  name: string;
  run: string;
  input?: Record<string, any>;
}

export interface WriteBlock {
  facts?: { path: string; value: any }[];
  flags?: { key: string; value: any }[];
}

export interface DecisionBlock {
  if: string;
  then?: ActionDefinition[];
}

export interface ActionDefinition {
  action: string;
  idempotency_key?: string;
  payload?: Record<string, any>;
}

export interface RunResult {
  runId: string;
  matched: boolean;
  actionsCreated: number;
}

@Injectable()
export class EngineRunnerService {
  private readonly logger = new Logger(EngineRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly factStore: FactStoreService,
    private readonly timeline: TimelineService,
    private readonly outbox: OutboxService,
    private readonly evaluator: ExpressionEvaluatorService,
    private readonly computeRegistry: ComputeRegistryService,
  ) {}

  /**
   * Event için rule'u çalıştırır
   */
  async runForEvent(
    caseId: string,
    event: Record<string, any>,
    rule: RuleDefinition,
    tenantId?: string,
  ): Promise<RunResult> {
    // 1. Get fact snapshot
    const snapshot = await this.factStore.getSnapshot(caseId);

    // 2. Build context
    const ctx: EvaluationContext = {
      fact: snapshot.facts,
      flags: snapshot.flags,
      compute: {},
      event,
    };

    // 3. Check when clause
    const matched = this.evaluator.checkWhen(rule.when, ctx);
    if (!matched) {
      return { runId: '', matched: false, actionsCreated: 0 };
    }

    // 4. Create engine run record
    const snapshotHash = this.hashSnapshot(snapshot, event);
    const run = await (this.prisma as any).icrabotEngineRun.create({
      data: {
        caseId,
        ruleId: rule.rule_id || 'unknown',
        triggerEventId: event.event_id,
        snapshotHash,
        status: 'started',
      },
    });

    try {
      // 5. Execute compute phase
      const computeList = rule.then?.compute || [];
      for (const c of computeList) {
        const input = this.evaluator.renderTemplate(c.input || {}, ctx);
        const output = await this.computeRegistry.run(c.run, input);
        ctx.compute[c.name] = output;
      }

      await this.timeline.addEntry({
        caseId,
        tenantId,
        type: 'COMPUTE',
        title: 'Compute executed',
        severity: 'info',
        body: { compute: ctx.compute, eventId: event.event_id },
        runId: run.id,
        source: 'engine',
      });

      // 6. Execute write phase
      const write = rule.then?.write;
      const factsToWrite: Record<string, any> = {};
      const flagsToWrite: Record<string, boolean> = {};

      for (const f of write?.facts || []) {
        const value = this.evaluator.renderTemplate(f.value, ctx);
        factsToWrite[f.path] = value;
      }

      for (const fl of write?.flags || []) {
        let value: boolean;
        if (typeof fl.value === 'string') {
          // Expression evaluation
          try {
            value = Boolean(this.evaluator.evalExpr(fl.value, ctx));
          } catch {
            value = Boolean(this.evaluator.renderTemplate(fl.value, ctx));
          }
        } else {
          value = Boolean(fl.value);
        }
        flagsToWrite[fl.key] = value;
      }

      await this.factStore.write(caseId, factsToWrite, flagsToWrite, {
        runId: run.id,
        ruleId: rule.rule_id,
      });

      await this.timeline.addEntry({
        caseId,
        tenantId,
        type: 'FACT_WRITE',
        title: 'Facts/Flags written',
        severity: 'info',
        body: { facts: factsToWrite, flags: flagsToWrite },
        runId: run.id,
        source: 'engine',
      });

      // 7. Execute decisions phase
      const decisions = rule.then?.decisions || [];
      let actionsCreated = 0;

      for (let idx = 0; idx < decisions.length; idx++) {
        const d = decisions[idx];
        if (!d.if) continue;

        const conditionMet = Boolean(this.evaluator.evalExpr(d.if, ctx));
        if (!conditionMet) continue;

        // Explainability
        const because = this.evaluator.explainDecision(d.if, ctx);

        await this.timeline.addEntry({
          caseId,
          tenantId,
          type: 'DECISION',
          title: 'Decision matched',
          severity: 'warn',
          body: { if: d.if, because, index: idx },
          runId: run.id,
          source: 'engine',
        });

        // Execute actions
        for (let actionIdx = 0; actionIdx < (d.then || []).length; actionIdx++) {
          const action = d.then![actionIdx];
          const actionType = action.action;

          // Generate idempotency key
          const idemKey = action.idempotency_key ||
            `${actionType}:${caseId}:${rule.rule_id}:${idx}:${actionIdx}`;

          const payload = this.evaluator.renderTemplate(action.payload || {}, ctx);

          const actionId = await this.outbox.createAction({
            caseId,
            tenantId, // write-time tenant capture (scope'ta thread'li)
            actionType,
            idempotencyKey: idemKey,
            payload,
            runId: run.id,
          });

          if (actionId) {
            actionsCreated++;
            await this.timeline.addEntry({
              caseId,
              tenantId,
              type: 'ACTION',
              title: `Action queued: ${actionType}`,
              severity: 'info',
              body: { actionId, actionType, idempotencyKey: idemKey, payload },
              runId: run.id,
              source: 'engine',
            });
          } else {
            await this.timeline.addEntry({
              caseId,
              tenantId,
              type: 'ACTION',
              title: `Action duplicate (ignored): ${actionType}`,
              severity: 'info',
              body: { idempotencyKey: idemKey },
              runId: run.id,
              source: 'engine',
            });
          }
        }
      }

      // 8. Finalize run
      await (this.prisma as any).icrabotEngineRun.update({
        where: { id: run.id },
        data: {
          status: 'succeeded',
          computeSummary: ctx.compute,
          finishedAt: new Date(),
        },
      });

      return { runId: run.id, matched: true, actionsCreated };

    } catch (error: any) {
      // Handle failure
      await (this.prisma as any).icrabotEngineRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          error: { error: error.message },
          finishedAt: new Date(),
        },
      });

      await this.timeline.addEntry({
        caseId,
        tenantId,
        type: 'OUTCOME',
        title: 'Engine run failed',
        severity: 'critical',
        body: { error: error.message },
        runId: run.id,
        source: 'system',
      });

      throw error;
    }
  }

  /**
   * Birden fazla rule'u event için çalıştırır
   */
  async runRulesForEvent(
    caseId: string,
    event: Record<string, any>,
    rules: RuleDefinition[],
    tenantId?: string,
  ): Promise<{ matched: RunResult[]; total: number }> {
    const matched: RunResult[] = [];

    for (const rule of rules) {
      try {
        const result = await this.runForEvent(caseId, event, rule, tenantId);
        if (result.matched) {
          matched.push(result);
        }
      } catch (error: any) {
        this.logger.error(`Rule ${rule.rule_id} failed: ${error.message}`);
      }
    }

    return { matched, total: rules.length };
  }

  /**
   * Snapshot hash'i oluşturur
   */
  private hashSnapshot(snapshot: FactSnapshot, event: Record<string, any>): string {
    const data = JSON.stringify({ facts: snapshot.facts, flags: snapshot.flags, event });
    return 'sha256:' + crypto.createHash('sha256').update(data).digest('hex');
  }
}
