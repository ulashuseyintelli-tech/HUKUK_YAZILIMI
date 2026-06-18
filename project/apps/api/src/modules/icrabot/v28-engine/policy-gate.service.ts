/**
 * v28 Policy Gate Service
 * 
 * Action'ları policy kurallarına göre değerlendirir.
 * Python v28_ops_bundle/engine_v28/policy_seed/management/commands/seed_policy_rules.py'den port edildi.
 * 
 * Policy Decisions:
 * - ALLOW: Action otomatik çalışabilir
 * - DENY: Action engellenir
 * - MANUAL: Action manual_review kuyruğuna yönlendirilir
 * 
 * Built-in Rules:
 * - KVKK_HOLD: send_email DENY
 * - CLIENT_NO_EMAIL: send_email DENY
 * - HIGH_RISK (>=70): impactful actions MANUAL
 * - QUIET_HOURS: send_email MANUAL
 * - IRREVERSIBLE: uyap_submit/haciz_submit DENY unless ALLOW_IRREVERSIBLE
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { FactStoreService, FactSnapshot } from './factstore.service';

export type PolicyDecision = 'ALLOW' | 'DENY' | 'MANUAL';

export interface PolicyRule {
  id: string;
  name: string;
  priority: number;
  actionType: string | null; // null = all action types
  expr: string;
  decision: PolicyDecision;
  manualActionType?: string;
  manualPayload?: Record<string, any>;
  note?: string;
  isActive: boolean;
}

export interface PolicyEvalContext {
  caseId: string;
  actionType: string;
  payload: Record<string, any>;
  snapshot: FactSnapshot;
}

export interface PolicyEvalResult {
  decision: PolicyDecision;
  matchedRule: PolicyRule | null;
  reason: string;
  manualAction?: {
    actionType: string;
    payload: Record<string, any>;
  };
}

// Risk bands
export const RISK_BANDS = {
  LOW: { min: 0, max: 39 },
  MED: { min: 40, max: 69 },
  HIGH: { min: 70, max: 100 },
};

// Irreversible queues
export const IRREVERSIBLE_QUEUES = [
  'uyap_submit',
  'haciz_submit',
  'icra_mudurlugu_submit',
];

// Quiet hours (Turkey timezone)
export const QUIET_HOURS = {
  start: 19, // 19:00
  end: 9,    // 09:00
};

@Injectable()
export class PolicyGateService implements OnModuleInit {
  private readonly logger = new Logger(PolicyGateService.name);
  private rules: PolicyRule[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly factStore: FactStoreService,
  ) {}

  /**
   * Nest lifecycle hook — uygulama boot'unda çalışır.
   *
   * Çağrıldığı yerler:
   * - Nest DI lifecycle → boot (V28EngineModule, app.module'e bağlı)
   *
   * BOOT SAFLIĞI: Boot HİÇBİR koşulda DB'ye policy-rule seed'i YAZMAZ. loadRules(), DB
   * delegate'i (IcrabotPolicyRule) yoksa in-memory getDefaultRules()'a düşer ve bu kurallar
   * çalışma anında otoritedir. (Eski boot-seed çağrısı + yanıltıcı "Policy rules seeded:
   * created=5" log'u kaldırıldı; seed yalnızca explicit POST /icrabot/v28/policy/seed ile.)
   */
  async onModuleInit() {
    await this.loadRules();
  }

  /**
   * DB'den policy kurallarını yükler
   */
  async loadRules(): Promise<void> {
    try {
      const dbRules = await (this.prisma as any).icrabotPolicyRule?.findMany({
        where: { isActive: true },
        orderBy: { priority: 'desc' },
      });

      if (dbRules && dbRules.length > 0) {
        this.rules = dbRules.map((r: any) => ({
          id: r.id,
          name: r.name,
          priority: r.priority,
          actionType: r.actionType,
          expr: r.expr,
          decision: r.decision,
          manualActionType: r.manualActionType,
          manualPayload: r.manualPayload,
          note: r.note,
          isActive: r.isActive,
        }));
        this.logger.log(`Loaded ${this.rules.length} policy rules from DB`);
      } else {
        this.rules = this.getDefaultRules();
        this.logger.log(`Using ${this.rules.length} default policy rules`);
      }
    } catch {
      this.rules = this.getDefaultRules();
      this.logger.log(`Using ${this.rules.length} default policy rules (DB not available)`);
    }
  }

  /**
   * Varsayılan policy kurallarını döner
   */
  private getDefaultRules(): PolicyRule[] {
    return [
      {
        id: 'default-kvkk-hold',
        name: 'KVKK_HOLD denies send_email',
        priority: 1000,
        actionType: 'send_email',
        expr: "flags.KVKK_HOLD === true",
        decision: 'DENY',
        note: 'KVKK hold active: do not send email automatically.',
        isActive: true,
      },
      {
        id: 'default-client-no-email',
        name: 'CLIENT_NO_EMAIL denies send_email',
        priority: 950,
        actionType: 'send_email',
        expr: "flags.CLIENT_NO_EMAIL === true",
        decision: 'DENY',
        note: 'Client preference: no email.',
        isActive: true,
      },
      {
        id: 'default-high-risk',
        name: 'HIGH_RISK manualizes impactful actions',
        priority: 900,
        actionType: null,
        expr: "facts['compute.risk.score'] >= 70 && ['send_email', 'enqueue'].includes(actionType)",
        decision: 'MANUAL',
        manualActionType: 'enqueue',
        manualPayload: { queue: 'manual_review', reason: 'High risk policy gate' },
        note: 'Risk>=70: require manual review for impactful actions.',
        isActive: true,
      },
      {
        id: 'default-quiet-hours',
        name: 'Quiet hours manualize send_email',
        priority: 850,
        actionType: 'send_email',
        expr: "isQuietHours()",
        decision: 'MANUAL',
        manualActionType: 'enqueue',
        manualPayload: { queue: 'manual_review', reason: 'Quiet hours: review before sending' },
        note: 'Operational policy: do not auto-send email at night.',
        isActive: true,
      },
      {
        id: 'default-irreversible',
        name: 'Irreversible queues denied unless allow flag',
        priority: 800,
        actionType: 'enqueue',
        expr: "IRREVERSIBLE_QUEUES.includes(payload.queue) && flags.ALLOW_IRREVERSIBLE !== true",
        decision: 'DENY',
        note: 'Block irreversible submissions unless explicitly allowed.',
        isActive: true,
      },
    ];
  }

  /**
   * Varsayılan kuralları DB'ye seed eder — YALNIZCA IcrabotPolicyRule Prisma modeli mevcutsa.
   *
   * Çağrıldığı yerler:
   * - PolicyGateController.seedDefaultRules() → POST /api/icrabot/v28/policy/seed (explicit admin/dev)
   *   (onModuleInit ARTIK çağırmaz — boot saflığı.)
   *
   * NOT: `IcrabotPolicyRule` modeli Prisma şemasında YOK (Django v28_ops_bundle
   * seed_policy_rules.py'den yarım port). Model yokken `prisma.icrabotPolicyRule` undefined olur.
   * Eski kod optional-chaining ile sessizce no-op yapıp sayaçları artırarak yanıltıcı
   * "created=5" telemetrisi üretiyordu. Artık delegate yoksa DÜRÜSTçe {created:0,updated:0} döner;
   * model eklenirse gerçek seed çalışır (future-safe).
   */
  async seedDefaultRules(): Promise<{ created: number; updated: number }> {
    const delegate = (this.prisma as any).icrabotPolicyRule;
    if (!delegate) {
      this.logger.warn(
        'Policy rule seed atlandı: IcrabotPolicyRule modeli Prisma şemasında yok; ' +
          'in-memory varsayılan kurallar otoritedir.',
      );
      return { created: 0, updated: 0 };
    }

    const defaultRules = this.getDefaultRules();
    let created = 0;
    let updated = 0;

    try {
      for (const rule of defaultRules) {
        const existing = await delegate.findFirst({
          where: { name: rule.name },
        });

        if (!existing) {
          await delegate.create({
            data: {
              name: rule.name,
              priority: rule.priority,
              actionType: rule.actionType,
              expr: rule.expr,
              decision: rule.decision,
              manualActionType: rule.manualActionType,
              manualPayload: rule.manualPayload,
              note: rule.note,
              isActive: rule.isActive,
            },
          });
          created++;
        } else {
          await delegate.update({
            where: { id: existing.id },
            data: {
              priority: rule.priority,
              expr: rule.expr,
              decision: rule.decision,
              manualActionType: rule.manualActionType,
              manualPayload: rule.manualPayload,
              note: rule.note,
            },
          });
          updated++;
        }
      }

      if (created > 0 || updated > 0) {
        this.logger.log(`Policy rules seeded: created=${created} updated=${updated}`);
        await this.loadRules();
      }
    } catch (e) {
      // DB table may not exist yet
      this.logger.debug('Could not seed policy rules to DB');
    }

    return { created, updated };
  }


  /**
   * Action'ı policy kurallarına göre değerlendirir
   */
  async evaluate(ctx: PolicyEvalContext): Promise<PolicyEvalResult> {
    const { actionType, payload, snapshot } = ctx;
    const { facts, flags } = snapshot;

    // Sort by priority (highest first)
    const sortedRules = [...this.rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      // Skip if rule is for specific action type and doesn't match
      if (rule.actionType && rule.actionType !== actionType) {
        continue;
      }

      // Evaluate expression
      const matches = this.evaluateExpr(rule.expr, {
        facts,
        flags,
        actionType,
        payload,
      });

      if (matches) {
        const result: PolicyEvalResult = {
          decision: rule.decision,
          matchedRule: rule,
          reason: rule.note || rule.name,
        };

        if (rule.decision === 'MANUAL' && rule.manualActionType) {
          result.manualAction = {
            actionType: rule.manualActionType,
            payload: {
              ...rule.manualPayload,
              originalActionType: actionType,
              originalPayload: payload,
              policyRule: rule.name,
            },
          };
        }

        this.logger.debug(`Policy matched: ${rule.name} -> ${rule.decision}`);
        return result;
      }
    }

    // No rule matched -> ALLOW
    return {
      decision: 'ALLOW',
      matchedRule: null,
      reason: 'No policy rule matched',
    };
  }

  /**
   * Expression'ı değerlendirir
   */
  private evaluateExpr(
    expr: string,
    ctx: { facts: Record<string, any>; flags: Record<string, boolean>; actionType: string; payload: Record<string, any> },
  ): boolean {
    try {
      const { facts, flags, actionType, payload } = ctx;

      // Helper functions
      const isQuietHours = (): boolean => {
        const now = new Date();
        const hour = now.getHours();
        // Quiet hours: 19:00 - 09:00
        return hour >= QUIET_HOURS.start || hour < QUIET_HOURS.end;
      };

      const getRiskBand = (score: number): string => {
        if (score >= RISK_BANDS.HIGH.min) return 'HIGH';
        if (score >= RISK_BANDS.MED.min) return 'MED';
        return 'LOW';
      };

      // Create evaluation context
      const evalContext = {
        facts,
        flags,
        actionType,
        payload,
        isQuietHours,
        getRiskBand,
        IRREVERSIBLE_QUEUES,
        RISK_BANDS,
      };

      // Simple expression evaluation
      // Note: In production, use a proper expression parser
      const fn = new Function(
        'facts', 'flags', 'actionType', 'payload',
        'isQuietHours', 'getRiskBand', 'IRREVERSIBLE_QUEUES', 'RISK_BANDS',
        `return ${expr}`,
      );

      return fn(
        evalContext.facts,
        evalContext.flags,
        evalContext.actionType,
        evalContext.payload,
        evalContext.isQuietHours,
        evalContext.getRiskBand,
        evalContext.IRREVERSIBLE_QUEUES,
        evalContext.RISK_BANDS,
      );
    } catch (e: any) {
      this.logger.warn(`Policy expr evaluation failed: ${expr} - ${e.message}`);
      return false;
    }
  }

  /**
   * Convenience method: evaluate with auto-fetched snapshot
   */
  async evaluateAction(
    caseId: string,
    actionType: string,
    payload: Record<string, any>,
  ): Promise<PolicyEvalResult> {
    const snapshot = await this.factStore.getSnapshot(caseId);
    return this.evaluate({ caseId, actionType, payload, snapshot });
  }

  /**
   * Risk band'ı hesaplar
   */
  getRiskBand(score: number): 'LOW' | 'MED' | 'HIGH' {
    if (score >= RISK_BANDS.HIGH.min) return 'HIGH';
    if (score >= RISK_BANDS.MED.min) return 'MED';
    return 'LOW';
  }

  /**
   * Quiet hours kontrolü
   */
  isQuietHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    return hour >= QUIET_HOURS.start || hour < QUIET_HOURS.end;
  }

  /**
   * Irreversible queue kontrolü
   */
  isIrreversibleQueue(queue: string): boolean {
    return IRREVERSIBLE_QUEUES.includes(queue);
  }

  /**
   * Tüm kuralları döner
   */
  getRules(): PolicyRule[] {
    return [...this.rules];
  }

  /**
   * Kural ekler
   */
  async addRule(rule: Omit<PolicyRule, 'id'>): Promise<PolicyRule> {
    const created = await (this.prisma as any).icrabotPolicyRule.create({
      data: {
        name: rule.name,
        priority: rule.priority,
        actionType: rule.actionType,
        expr: rule.expr,
        decision: rule.decision,
        manualActionType: rule.manualActionType,
        manualPayload: rule.manualPayload,
        note: rule.note,
        isActive: rule.isActive,
      },
    });

    await this.loadRules();
    return created;
  }

  /**
   * Kuralı günceller
   */
  async updateRule(id: string, updates: Partial<PolicyRule>): Promise<PolicyRule> {
    const updated = await (this.prisma as any).icrabotPolicyRule.update({
      where: { id },
      data: updates,
    });

    await this.loadRules();
    return updated;
  }

  /**
   * Kuralı siler
   */
  async deleteRule(id: string): Promise<void> {
    await (this.prisma as any).icrabotPolicyRule.delete({ where: { id } });
    await this.loadRules();
  }

  /**
   * Kuralı devre dışı bırakır
   */
  async disableRule(id: string): Promise<void> {
    await (this.prisma as any).icrabotPolicyRule.update({
      where: { id },
      data: { isActive: false },
    });
    await this.loadRules();
  }

  /**
   * Kuralı aktif eder
   */
  async enableRule(id: string): Promise<void> {
    await (this.prisma as any).icrabotPolicyRule.update({
      where: { id },
      data: { isActive: true },
    });
    await this.loadRules();
  }

  /**
   * Kuralları yeniden yükler
   */
  async reloadRules(): Promise<number> {
    await this.loadRules();
    return this.rules.length;
  }
}
