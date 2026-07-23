import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UyapAttempt, UyapAttemptCpeDecisionLink, UyapOperation } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { UyapOperationWriterService } from './uyap-operation-writer.service';
import { UyapCpeDecisionLinkWriterService } from './uyap-cpe-decision-link-writer.service';
import { deriveUyapOperationIdempotencyKeyFromHttpToken } from './uyap-operation-writer.types';

/** P05C-P04 eligible action kümesi (yalnız bu ikisi runtime evidence üretir). */
export const UYAP_EVIDENCE_ELIGIBLE_ACTIONS = ['UYAP_SEND', 'TRIGGER_HACIZ'] as const;
export type UyapEvidenceAction = (typeof UYAP_EVIDENCE_ELIGIBLE_ACTIONS)[number];

export interface RecordEvidenceCommand {
  tenantId: string;
  caseId: string;
  /** Server-authoritative — YALNIZ req.user.id (JWT). Body/lawyerId'den türetilmez. */
  actorUserId: string;
  action: UyapEvidenceAction;
  /** Doğrulanmış opaque HTTP `Idempotency-Key` header ham değeri. */
  idempotencyToken: string;
  /** CPE decision.decisionId (CpeDecisionLog.id). */
  cpeDecisionLogId: string;
}

export interface RecordEvidenceResult {
  operation: UyapOperation;
  firstAttempt: UyapAttempt;
  link: UyapAttemptCpeDecisionLink;
  operationReused: boolean;
}

/**
 * UYAP-OPERATION-EVIDENCE-ACTIVATION-P05C-P04 — dormant P-E5B + P05C-P03 writer'larını
 * gerçek CPE karar akışına bağlayan İNCE orchestrator.
 *
 * - TX-1: operation + first attempt (P-E5B) + link (P05C-P03) TEK atomik transaction.
 * - Lock ordering: operation-create → decision-link (kod-sabit).
 * - actorUserId server-authoritative (req.user.id); actingLawyerId/signatureOwnerId NULL (P-E6 HOLD).
 * - Feature flag C: global kill-switch + tenant allowlist + action allowlist, TAMAMI default-OFF.
 * - CPE decision (TX-0) burada YAZILMAZ — bağımsız commit edilmiş bir olgudur; refactor YOK.
 */
@Injectable()
export class UyapOperationEvidenceOrchestrator {
  private readonly logger = new Logger(UyapOperationEvidenceOrchestrator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly operationWriter: UyapOperationWriterService,
    private readonly linkWriter: UyapCpeDecisionLinkWriterService,
  ) {}

  /**
   * Verilen tenant + action için evidence kaydı aktif mi? (global kill-switch + iki allowlist).
   * Hepsi default-OFF; flag OFF iken çağıran mevcut legacy akışı BİREBİR sürdürür.
   */
  isEnabled(tenantId: string, action: UyapEvidenceAction): boolean {
    const enabled = String(this.config.get('UYAP_OPERATION_EVIDENCE_ENABLED') ?? '').toLowerCase() === 'true';
    if (!enabled) return false;
    if (!this.inAllowlist('UYAP_OPERATION_EVIDENCE_TENANT_ALLOWLIST', tenantId)) return false;
    if (!this.inAllowlist('UYAP_OPERATION_EVIDENCE_ACTION_ALLOWLIST', action)) return false;
    return true;
  }

  /** Virgülle ayrılmış allowlist; boş/tanımsız → hiçbir değer allowlisted DEĞİL (fail-closed default). */
  private inAllowlist(key: string, value: string): boolean {
    const raw = String(this.config.get(key) ?? '').trim();
    if (!raw) return false;
    return raw.split(',').map((s) => s.trim()).filter(Boolean).includes(value);
  }

  /**
   * TX-1'i yürütür. Çağıran ÖNCE isEnabled true VE idempotencyToken mevcut olduğunu doğrulamalıdır
   * (fail-closed header kontrolü çağıran katmanda). Envelope aktör/lawyer/signer kararlarını
   * BURADA vermez — actorUserId komuttan gelir; lawyer/signer NULL bırakılır.
   *
   * Duplicate: exact retry → mevcut operation reuse (P-E5B IDEMPOTENT_REUSE). Materially
   * incompatible immutable envelope → P-E5B IdempotencyConflictError (fail-closed). Link her
   * CPE kararı için tekildir (@@unique([cpeDecisionLogId])).
   */
  async recordEvidence(command: RecordEvidenceCommand): Promise<RecordEvidenceResult> {
    const idempotencyKey = deriveUyapOperationIdempotencyKeyFromHttpToken(
      this.namespace(command.tenantId, command.action),
      command.idempotencyToken,
    );

    return this.prisma.$transaction(async (tx) => {
      // Lock ordering: operation-create (P-E5B advisory lock) → decision-link (P05C-P03 advisory lock).
      const op = await this.operationWriter.createOperationWithFirstAttemptWithinTransaction(tx, {
        idempotencyKey,
        envelope: {
          tenantId: command.tenantId,
          caseId: command.caseId,
          operationType: command.action,
          actorUserId: command.actorUserId,
          actingLawyerId: null, // P-E6 HOLD — body/JWT/rol'den türetilmez
          representedPartyId: null,
          approverId: null,
          signatureOwnerId: null, // P-E6 HOLD
        },
      });

      const link = await this.linkWriter.linkWithinTransaction(tx, {
        tenantId: command.tenantId,
        caseId: command.caseId,
        operationId: op.operation.id,
        attemptId: op.firstAttempt.id,
        cpeDecisionLogId: command.cpeDecisionLogId,
      });

      return {
        operation: op.operation,
        firstAttempt: op.firstAttempt,
        link: link.link,
        operationReused: !op.created,
      };
    });
  }

  /** Namespace: aynı token farklı tenant/action için FARKLI key üretir. */
  private namespace(tenantId: string, action: UyapEvidenceAction): string {
    return `${tenantId}:${action}`;
  }
}
