import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  LinkCpeDecisionCommand,
  LinkCpeDecisionResult,
} from './uyap-cpe-decision-link-writer.types';
import {
  UyapCpeDecisionLinkConflictError,
  UyapCpeDecisionLinkIntegrityError,
  UyapCpeDecisionLinkValidationError,
} from './uyap-cpe-decision-link-writer.errors';

const MAX_TRANSACTION_ATTEMPTS = 3;

/** Saf, side-effect'siz advisory-lock key uretici. `@@unique([cpeDecisionLogId])` serilestirme
 *  noktasi oldugundan lock scope'u da yalniz cpeDecisionLogId'dir; farkli kararlar kilitlenmez. */
function linkLockKey(cpeDecisionLogId: string): string {
  return `uyap-cpe-link:${cpeDecisionLogId}`;
}

/**
 * UYAP-CPE-DECISION-LINK-WRITER-P05C-P03 — UyapAttemptCpeDecisionLink write-side foundation.
 *
 * DORMANT internal application service (Karar C, RATIFIED):
 *   - UyapModule provider/export kaydi YOK; controller/DTO/HTTP endpoint YOK; wiring YOK.
 *   - Actor/lawyer/signer input ALMAZ (referential linkage; "kim" bilgisi UyapOperation kaydinda
 *     implicit'tir, link'te DEGIL). Karar C.
 *   - M5 composite FK + @@unique([cpeDecisionLogId]) AUTHORITATIVE; schema/migration EKLEMEZ.
 *   - P-E5D/P-E5E/P-E6 karari uretmez; retry eligibility / authority resolution YAPMAZ.
 *
 * Emsal: `uyap-operation-writer.service.ts` — standalone + WithinTransaction TEK core primitive'i
 * paylasir; bounded retry yalniz serialization/deadlock ve yalniz standalone giriste.
 *
 * DUPLICATE SEMANTICS (owner-ratified):
 *   1. Ayni cpeDecisionLogId + EXACT ayni (tenant,case,operation,attempt) → IDEMPOTENT_REPLAY.
 *   2. Ayni cpeDecisionLogId + FARKLI iliski → UyapCpeDecisionLinkConflictError (fail-closed).
 *   3. FK/tenant/case uyusmazligi → UyapCpeDecisionLinkIntegrityError (otomatik duzeltme YOK).
 */
@Injectable()
export class UyapCpeDecisionLinkWriterService {
  constructor(private readonly prisma: PrismaService) {}

  /** Standalone giris — kendi transaction'i + bounded retry. */
  async linkAttempt(command: LinkCpeDecisionCommand): Promise<LinkCpeDecisionResult> {
    this.validate(command);
    return this.withRetryableTransaction((tx) => this.linkCore(tx, command));
  }

  /**
   * Caller-supplied transaction icinde link. Nested transaction ACMAZ, retry YAPMAZ —
   * transaction'in sahibi cagirandir. Orchestration (op+attempt -> CPE -> link) buradan kompoze
   * edilecektir; ANCAK bu faz o wiring'i KURMAZ (ayri owner GO).
   */
  async linkWithinTransaction(
    tx: Prisma.TransactionClient,
    command: LinkCpeDecisionCommand,
  ): Promise<LinkCpeDecisionResult> {
    this.validate(command);
    try {
      return await this.linkCore(tx, command);
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  /** Standalone + WithinTransaction arasinda paylasilan TEK internal primitive. */
  private async linkCore(
    tx: Prisma.TransactionClient,
    command: LinkCpeDecisionCommand,
  ): Promise<LinkCpeDecisionResult> {
    const { tenantId, caseId, operationId, attemptId, cpeDecisionLogId } = command;

    // cpeDecisionLogId scope'unda esszamanli link'leri bu tx suresince serilestir.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${linkLockKey(cpeDecisionLogId)}))`;

    const existing = await tx.uyapAttemptCpeDecisionLink.findUnique({ where: { cpeDecisionLogId } });
    if (existing) {
      if (this.isSameRelation(existing, command)) {
        return { link: existing, created: false, reason: 'IDEMPOTENT_REPLAY' };
      }
      // Ayni karar farkli iliskiye — HARD CONFLICT (UYAP-CONST-002 tasima yasagi).
      throw new UyapCpeDecisionLinkConflictError();
    }

    // Yeni satir. Composite FK'lar (tenant/case/operation/attempt tutarliligi) + @@unique DB'de
    // dogrular; uyusmazlik reddedilir (fail-closed) ve mapWriteError ile typed'a cevrilir.
    const link = await tx.uyapAttemptCpeDecisionLink.create({
      data: { tenantId, caseId, operationId, attemptId, cpeDecisionLogId },
    });
    return { link, created: true, reason: 'CREATED' };
  }

  private isSameRelation(
    existing: {
      tenantId: string;
      caseId: string;
      operationId: string;
      attemptId: string;
    },
    command: LinkCpeDecisionCommand,
  ): boolean {
    return (
      existing.tenantId === command.tenantId &&
      existing.caseId === command.caseId &&
      existing.operationId === command.operationId &&
      existing.attemptId === command.attemptId
    );
  }

  private validate(command: LinkCpeDecisionCommand): void {
    if (!command) {
      throw new UyapCpeDecisionLinkValidationError('command zorunludur');
    }
    for (const field of ['tenantId', 'caseId', 'operationId', 'attemptId', 'cpeDecisionLogId'] as const) {
      const v = command[field];
      if (!v || !v.trim()) {
        throw new UyapCpeDecisionLinkValidationError(`${field} zorunludur`);
      }
    }
  }

  private async withRetryableTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(fn);
      } catch (error) {
        lastError = error;
        if (attempt < MAX_TRANSACTION_ATTEMPTS && this.isRetryableTransientError(error)) {
          continue;
        }
        throw this.mapWriteError(error);
      }
    }
    throw this.mapWriteError(lastError);
  }

  private isRetryableTransientError(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return true;
    }
    return error instanceof Error && /deadlock detected/i.test(error.message);
  }

  private mapWriteError(error: unknown): Error {
    if (
      error instanceof UyapCpeDecisionLinkValidationError ||
      error instanceof UyapCpeDecisionLinkConflictError ||
      error instanceof UyapCpeDecisionLinkIntegrityError
    ) {
      return error;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002: advisory lock'a ragmen ayni cpeDecisionLogId unique ihlali (esszamanli create yarisi).
      if (error.code === 'P2002') {
        return new UyapCpeDecisionLinkConflictError();
      }
      // P2003: composite FK ihlali (yanlis case/tenant/operation/attempt kombinasyonu).
      if (error.code === 'P2003') {
        return new UyapCpeDecisionLinkIntegrityError();
      }
    }
    return error instanceof Error ? error : new UyapCpeDecisionLinkIntegrityError();
  }
}
