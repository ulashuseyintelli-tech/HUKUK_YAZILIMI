// P3-2C — Guided-Edge confirm GATE (CHANGE_STATUS structured-200 wiring; VARSAYILAN OFF).
//
// Bir guarded-edge aksiyonu için: (a) kararı EffectivePermissionResolver'dan alır,
// (b) CONFIRM_REQUIRED ise ConfirmationTokenService.issue + GuardedEdgeOutcomeEnvelope (structured-200) döndürür,
// (c) retry'da confirmation token'ı consume eder.
//
// KESİN: ENFORCEMENT GLOBAL DEĞİL. Yalnız per-action flag (GUIDED_OPEN_CONFIRM_GATE) AÇIKKEN devreye girer.
//   FLAG KAPALI (varsayılan) → HER ZAMAN PROCEED → caller mevcut davranışı AYNEN sürdürür (resolve/issue/consume YOK;
//   latency/response/DB-yan-etki DEĞİŞMEZ). P3-2D global enable AYRI karardır.
//   Guided-Open: hard-deny YOK (unlinked/unknown user engellenmez); yalnız CONFIRM_REQUIRED zarflanır, gerisi PROCEED.
//   Validity (AXIS-V/CPE) ile ALAKASIZ; hukuki geçerlilik bu hatta KARIŞMAZ.

import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EffectivePermissionResolver } from '../../policy-engine/effective-permission-resolver.service';
import { GuidedOpenDecision } from '../../policy-engine/types/effective-permission.types';
import { ActionCode } from '../../policy-engine/types/action-code.enum';
import { ConfirmationTokenService, ConfirmTokenBinding } from './confirmation-token.service';
import { buildGuardedEdgeOutcome, GuardedEdgeOutcomeEnvelope } from './guarded-edge-outcome.envelope';
import { stableJsonHash } from './canonical-json';

export interface GuardedEdgeGateInput {
  actorUserId: string;
  tenantId: string;
  actionCode: ActionCode;
  caseId: string;
  /** Sabit yüzey kimliği (issue↔consume aynı olmalı). Ör. 'POST /case-status/:caseId/change'. */
  surface: string;
  /** Confirm'in koruduğu istek alanları (issue↔consume payloadHash eşleşmeli). Ham body audit/log'a YAZILMAZ. */
  payload: unknown;
  /** Retry'da gelir; verilirse consume yolu çalışır. */
  confirmationToken?: string;
  message?: string;
  resourceType?: string;
}

export type GuardedEdgeGateResult =
  | { kind: 'PROCEED' }
  | { kind: 'ENVELOPE'; envelope: GuardedEdgeOutcomeEnvelope };

@Injectable()
export class GuidedEdgeGateService {
  constructor(
    private readonly config: ConfigService,
    private readonly resolver: EffectivePermissionResolver,
    private readonly tokens: ConfirmationTokenService,
  ) {}

  /**
   * Per-action confirm gate flag. VARSAYILAN 'off' → gate devre dışı.
   * GUIDED_OPEN_CONFIRM_GATE: 'off' (default) | 'on' (gate'li tüm aksiyonlar) | '<ActionCode>' (yalnız o aksiyon).
   * (Shadow/test açma içindir; canlı global enable P3-2D.)
   */
  gateEnabled(actionCode: string): boolean {
    const v = String(this.config.get('GUIDED_OPEN_CONFIRM_GATE') ?? '').trim().toLowerCase();
    return v === 'on' || v === String(actionCode).toLowerCase();
  }

  async evaluate(input: GuardedEdgeGateInput): Promise<GuardedEdgeGateResult> {
    // VARSAYILAN OFF → mevcut davranış. resolver/token HİÇ çağrılmaz.
    if (!this.gateEnabled(input.actionCode)) return { kind: 'PROCEED' };

    const binding: ConfirmTokenBinding = {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      actionCode: input.actionCode,
      surface: input.surface,
      targetRef: input.caseId,
      payloadHash: stableJsonHash(input.payload),
    };

    // RETRY/CONSUME: token geldiyse doğrula. CONSUMED → PROCEED; aksi (EXPIRED/MISMATCH/FORGED/REPLAY) → typed 400.
    if (input.confirmationToken) {
      const res = await this.tokens.consume(input.confirmationToken, binding);
      if (res.ok) return { kind: 'PROCEED' };
      throw new BadRequestException(`Onay doğrulanamadı (${res.result}); işlem yapılmadı.`);
    }

    // ISSUE: kararı al. Yalnız CONFIRM_REQUIRED zarflanır; diğer outcome'lar (ALLOW dahil) → PROCEED.
    // (tenant-boundary changeStatus'ta zaten tenant-scoped 404 ile kapalı; hard-deny ÜRETİLMEZ.)
    const decision = await this.resolver.resolve({
      actorUserId: input.actorUserId,
      tenantId: input.tenantId,
      caseId: input.caseId,
      actionCode: input.actionCode,
    });

    if (decision.decision !== GuidedOpenDecision.CONFIRM_REQUIRED) {
      return { kind: 'PROCEED' };
    }

    const issued = await this.tokens.issue(binding, {
      decisionSource: String(decision.decisionSource),
      outcome: String(decision.decision),
    });
    const envelope = buildGuardedEdgeOutcome({
      outcome: GuidedOpenDecision.CONFIRM_REQUIRED,
      actionCode: input.actionCode,
      target: { resourceType: input.resourceType ?? 'LegalCase', caseId: input.caseId },
      reasonCode: String(decision.decisionSource),
      message: input.message ?? 'Bu işlem için onay gerekiyor.',
      confirmation: { token: issued.token, expiresAt: issued.expiresAt, bindingHash: issued.bindingHash },
    });
    return { kind: 'ENVELOPE', envelope };
  }
}
