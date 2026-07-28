import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UyapAttempt, UyapAttemptCpeDecisionLink, UyapOperation } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { UyapOperationWriterService } from './uyap-operation-writer.service';
import { UyapCpeDecisionLinkWriterService } from './uyap-cpe-decision-link-writer.service';
import { deriveUyapOperationIdempotencyKeyFromHttpToken } from './uyap-operation-writer.types';
import {
  UyapAuthoritySnapshotReadClient,
  UyapAuthoritySnapshotService,
} from '../authority/uyap-authority-snapshot.service';
import { UyapAuthoritySnapshot } from '../authority/uyap-authority-snapshot.types';
import { UyapAuthorityStaleError } from '../authority/uyap-authority-stale.error';
import {
  UYAP_AUTHORITY_COORDINATION_HOOK,
  UyapAuthorityCoordinationHook,
} from '../authority/uyap-authority-coordination.hook';

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
  /**
   * UYAP-AUTHORITY-FRESHNESS-TX-I01 — Phase 1'de SERVER-SIDE üretilmiş authority snapshot.
   * TX-1 içinde aynı kaynaklar yeniden okunur ve bu snapshot ile karşılaştırılır.
   * İstemciden gelen bir snapshot/digest ASLA kabul edilmez (FR-05/FR-06); bu alan
   * hiçbir DTO'dan doldurulmaz.
   */
  authoritySnapshot: UyapAuthoritySnapshot;
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
    private readonly authoritySnapshots: UyapAuthoritySnapshotService,
    /**
     * UYAP-AUTHORITY-FRESHNESS-TX-I01 test barrier'ı. `UyapModule` bu token'ı KAYDETMEZ →
     * production'da `undefined` gelir ve bütün çağrılar no-op'tur.
     */
    @Optional()
    @Inject(UYAP_AUTHORITY_COORDINATION_HOOK)
    private readonly coordination?: UyapAuthorityCoordinationHook,
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
      // ── TX-1 AŞAMA 0: AUTHORITY REVALIDATION (UYAP-AUTHORITY-FRESHNESS-TX-I01) ──
      //
      // Phase 1'in "allowed" sonucu TX-1 authority'si DEĞİLDİR (FR-01). Bütün mutable
      // authority kaynakları BU transaction içinde yeniden okunur; yetki artık geçerli
      // değilse veya snapshot ile kaynak değişmişse HİÇBİR YAZMA YAPILMADAN atılır →
      // operation/attempt/link için 0 satır, orphan 0 (FR-03/FR-10).
      //
      // Okuma sırası snapshot servisinde TEK yerde kodludur; Phase 1 ile Phase 2 aynı
      // fonksiyonu çağırdığı için lock/ordering farkı OLUŞAMAZ (owner §7).
      await this.coordination?.wait('beforeTxRevalidation');

      const revalidation = await this.authoritySnapshots.revalidate(
        command.authoritySnapshot,
        tx as unknown as UyapAuthoritySnapshotReadClient,
        // Commit anı — snapshot'ın evaluatedAt'i DEĞİL. Phase 1'den sonra açılan masraf
        // bloğu ve araya giren süre dolumu ancak böyle görülebilir.
        new Date(),
      );

      await this.coordination?.wait('afterTxRevalidation');

      if (!revalidation.fresh) {
        throw new UyapAuthorityStaleError({
          failureCode: revalidation.failureCode,
          changedSources: revalidation.changedSources,
          revalidationFailureCode: revalidation.revalidationFailureCode,
        });
      }

      await this.coordination?.wait('beforeOperationCreate');

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
