/**
 * UYAP-OPERATION-ATTEMPT-WRITER-P05B — UyapOperation/UyapAttempt write-side foundation.
 *
 * DORMANT internal application service (owner-ratified P-E5B):
 *   - `UyapModule` provider/export kaydı YOKTUR; `UyapService`/controller'a enjekte EDİLMEZ.
 *   - Public controller/DTO/HTTP endpoint YOKTUR; hiçbir runtime call graph'a bağlı değildir.
 *   - `UyapRequestLog` ile dual-write YOKTUR (bu servis o tabloya HİÇ dokunmaz).
 *   - Retry'ın caiz olup olmadığına KARAR VERMEZ; state transition UYGULAMAZ (P-E5D sınırı).
 *   - actor/lawyer authority ÇÖZMEZ (P-E6 sınırı): envelope trusted execution context'ten gelir.
 *
 * Emsal: `tebligat/service-occurrence/service-occurrence.service.ts` (P02/P03) —
 * standalone + WithinTransaction girişleri TEK core primitive'i paylaşır (duplicate validation yok);
 * bounded retry yalnız serialization/deadlock sınıfı için ve YALNIZ standalone girişte yapılır.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AppendRetryAttemptCommand,
  AppendRetryAttemptResult,
  CompareAndBumpVersionCommand,
  CompareAndBumpVersionResult,
  CreateUyapOperationCommand,
  CreateUyapOperationResult,
  UyapOperationEnvelope,
  isCanonicalUyapOperationIdempotencyKey,
} from './uyap-operation-writer.types';
import {
  UyapOperationClaimLostError,
  UyapOperationConcurrentWriteConflictError,
  UyapOperationIdempotencyConflictError,
  UyapOperationNotFoundError,
  UyapOperationWriterValidationError,
} from './uyap-operation-writer.errors';
import { uyapOperationAttemptLockKey, uyapOperationCreateLockKey } from './uyap-operation-writer-lock';

const MAX_TRANSACTION_ATTEMPTS = 3;

@Injectable()
export class UyapOperationWriterService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────────── create + first attempt ─────────────────────────────

  /**
   * Yeni operation + attempt#1'i TEK transaction'da yazar; aynı (tenantId, idempotencyKey)
   * için idempotent reuse döner. Standalone giriş — bounded retry burada uygulanır.
   */
  async createOperationWithFirstAttempt(
    command: CreateUyapOperationCommand,
  ): Promise<CreateUyapOperationResult> {
    this.validateCreateCommand(command);
    return this.withRetryableTransaction((tx) => this.createOperationCore(tx, command));
  }

  /**
   * Caller-supplied transaction içinde create. Nested transaction AÇMAZ, retry YAPMAZ —
   * transaction'ın sahibi çağırandır, retry kararı da onundur.
   */
  async createOperationWithFirstAttemptWithinTransaction(
    tx: Prisma.TransactionClient,
    command: CreateUyapOperationCommand,
  ): Promise<CreateUyapOperationResult> {
    this.validateCreateCommand(command);
    try {
      return await this.createOperationCore(tx, command);
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  /** Standalone + WithinTransaction arasında paylaşılan TEK internal primitive. */
  private async createOperationCore(
    tx: Prisma.TransactionClient,
    command: CreateUyapOperationCommand,
  ): Promise<CreateUyapOperationResult> {
    const { envelope, idempotencyKey } = command;

    const lockKey = uyapOperationCreateLockKey(envelope.tenantId, idempotencyKey);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const existing = await tx.uyapOperation.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: envelope.tenantId, idempotencyKey } },
    });

    if (existing) {
      if (!this.isEnvelopeEqual(existing, envelope)) {
        throw new UyapOperationIdempotencyConflictError();
      }
      const firstAttempt = await tx.uyapAttempt.findFirst({
        where: { operationId: existing.id, tenantId: envelope.tenantId, attemptNumber: 1 },
      });
      if (!firstAttempt) {
        // operation + attempt#1 aynı transaction'da yazıldığı için bu durum veri bütünlüğü ihlalidir.
        throw new UyapOperationWriterValidationError(
          'idempotent reuse: operation mevcut ancak attempt#1 yok (veri bütünlüğü ihlali)',
        );
      }
      return { operation: existing, firstAttempt, created: false, reason: 'IDEMPOTENT_REUSE' };
    }

    const operation = await tx.uyapOperation.create({
      data: {
        tenantId: envelope.tenantId,
        caseId: envelope.caseId,
        operationType: envelope.operationType,
        actorUserId: envelope.actorUserId,
        actingLawyerId: envelope.actingLawyerId,
        representedPartyId: envelope.representedPartyId,
        approverId: envelope.approverId,
        signatureOwnerId: envelope.signatureOwnerId,
        idempotencyKey,
        clientRequestId: command.clientRequestId ?? null,
        httpCorrelationId: command.httpCorrelationId ?? null,
      },
    });

    // pairing CHECK: attempt#1 previousAttemptId NULL olmak ZORUNDA.
    const firstAttempt = await tx.uyapAttempt.create({
      data: {
        tenantId: envelope.tenantId,
        operationId: operation.id,
        attemptNumber: 1,
        previousAttemptId: null,
      },
    });

    return { operation, firstAttempt, created: true };
  }

  // ───────────────────────────── retry attempt lineage ─────────────────────────────

  /**
   * Operation'a sıradaki attempt'i lineage-doğru şekilde ekler (monotonic, gap-free).
   * Retry'ın CAİZ OLUP OLMADIĞINA KARAR VERMEZ (P-E5D); yalnız çağıran istediğinde ekler.
   */
  async appendRetryAttempt(command: AppendRetryAttemptCommand): Promise<AppendRetryAttemptResult> {
    this.validateAppendCommand(command);
    return this.withRetryableTransaction((tx) => this.appendRetryAttemptCore(tx, command));
  }

  /** Caller-supplied transaction içinde append. Retry YAPMAZ. */
  async appendRetryAttemptWithinTransaction(
    tx: Prisma.TransactionClient,
    command: AppendRetryAttemptCommand,
  ): Promise<AppendRetryAttemptResult> {
    this.validateAppendCommand(command);
    try {
      return await this.appendRetryAttemptCore(tx, command);
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  /** Standalone + WithinTransaction arasında paylaşılan TEK internal primitive. */
  private async appendRetryAttemptCore(
    tx: Prisma.TransactionClient,
    command: AppendRetryAttemptCommand,
  ): Promise<AppendRetryAttemptResult> {
    const { tenantId, operationId } = command;

    const lockKey = uyapOperationAttemptLockKey(tenantId, operationId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const operation = await tx.uyapOperation.findFirst({ where: { id: operationId, tenantId } });
    if (!operation) {
      throw new UyapOperationNotFoundError();
    }

    const lastAttempt = await tx.uyapAttempt.findFirst({
      where: { operationId, tenantId },
      orderBy: { attemptNumber: 'desc' },
    });
    if (!lastAttempt) {
      throw new UyapOperationWriterValidationError(
        'operation mevcut ancak hiç attempt yok (veri bütünlüğü ihlali)',
      );
    }

    // pairing CHECK: n>1 için previousAttemptId NOT NULL; composite FK previous attempt'in
    // AYNI operation+tenant'a ait olmasını DB seviyesinde zorlar.
    const attempt = await tx.uyapAttempt.create({
      data: {
        tenantId,
        operationId,
        attemptNumber: lastAttempt.attemptNumber + 1,
        previousAttemptId: lastAttempt.id,
      },
    });

    return { attempt, attemptNumber: attempt.attemptNumber, previousAttemptId: lastAttempt.id };
  }

  // ───────────────────────────── optimistic concurrency ─────────────────────────────

  /**
   * YALNIZ `version += 1` yapar. `internalState`, provider state veya legal-effect state
   * DEĞİŞTİRMEZ (owner-ratified: `claimOperation` adı ve state mutation'ı P-E5D'ye aittir).
   * `count !== 1` → ClaimLostError.
   */
  async compareAndBumpVersion(
    command: CompareAndBumpVersionCommand,
  ): Promise<CompareAndBumpVersionResult> {
    this.validateCompareAndBumpCommand(command);
    return this.withRetryableTransaction((tx) => this.compareAndBumpVersionCore(tx, command));
  }

  /** Caller-supplied transaction içinde compare-and-bump. Retry YAPMAZ. */
  async compareAndBumpVersionWithinTransaction(
    tx: Prisma.TransactionClient,
    command: CompareAndBumpVersionCommand,
  ): Promise<CompareAndBumpVersionResult> {
    this.validateCompareAndBumpCommand(command);
    try {
      return await this.compareAndBumpVersionCore(tx, command);
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  /** Standalone + WithinTransaction arasında paylaşılan TEK internal primitive. */
  private async compareAndBumpVersionCore(
    tx: Prisma.TransactionClient,
    command: CompareAndBumpVersionCommand,
  ): Promise<CompareAndBumpVersionResult> {
    const { id, tenantId, expectedVersion } = command;

    const result = await tx.uyapOperation.updateMany({
      where: { id, tenantId, version: expectedVersion },
      data: { version: { increment: 1 } },
    });

    if (result.count !== 1) {
      throw new UyapOperationClaimLostError();
    }

    return { version: expectedVersion + 1 };
  }

  // ───────────────────────────── validation / helpers ─────────────────────────────

  private validateCreateCommand(command: CreateUyapOperationCommand): void {
    if (!command?.envelope) {
      throw new UyapOperationWriterValidationError('envelope zorunludur');
    }
    const { envelope } = command;
    this.requireNonEmpty(envelope.tenantId, 'tenantId');
    this.requireNonEmpty(envelope.operationType, 'operationType');
    this.requireNonEmpty(envelope.actorUserId, 'actorUserId');

    // Branded tip derleme zamanında korur; bu runtime guard unchecked cast / JS çağrısı gibi
    // tip sisteminin dışına çıkan senaryolara karşı savunma katmanıdır.
    if (!command.idempotencyKey || !isCanonicalUyapOperationIdempotencyKey(command.idempotencyKey)) {
      throw new UyapOperationWriterValidationError(
        'idempotencyKey kanonik "UYAP-OP/v1:<uuid>" biçiminde olmalıdır (client string kabul edilmez)',
      );
    }
  }

  private validateAppendCommand(command: AppendRetryAttemptCommand): void {
    this.requireNonEmpty(command?.tenantId, 'tenantId');
    this.requireNonEmpty(command?.operationId, 'operationId');
  }

  private validateCompareAndBumpCommand(command: CompareAndBumpVersionCommand): void {
    this.requireNonEmpty(command?.id, 'id');
    this.requireNonEmpty(command?.tenantId, 'tenantId');
    if (!Number.isInteger(command?.expectedVersion) || command.expectedVersion < 1) {
      throw new UyapOperationWriterValidationError('expectedVersion >= 1 tam sayı olmalıdır');
    }
  }

  private requireNonEmpty(value: string | undefined | null, field: string): void {
    if (!value || !value.trim()) {
      throw new UyapOperationWriterValidationError(`${field} zorunludur`);
    }
  }

  /** Idempotent reuse karşılaştırması — YALNIZ immutable envelope (payload fingerprint YOK). */
  private isEnvelopeEqual(
    existing: {
      tenantId: string;
      caseId: string | null;
      operationType: string;
      actorUserId: string;
      actingLawyerId: string | null;
      representedPartyId: string | null;
      approverId: string | null;
      signatureOwnerId: string | null;
    },
    envelope: UyapOperationEnvelope,
  ): boolean {
    return (
      existing.tenantId === envelope.tenantId &&
      (existing.caseId ?? null) === (envelope.caseId ?? null) &&
      existing.operationType === envelope.operationType &&
      existing.actorUserId === envelope.actorUserId &&
      (existing.actingLawyerId ?? null) === (envelope.actingLawyerId ?? null) &&
      (existing.representedPartyId ?? null) === (envelope.representedPartyId ?? null) &&
      (existing.approverId ?? null) === (envelope.approverId ?? null) &&
      (existing.signatureOwnerId ?? null) === (envelope.signatureOwnerId ?? null)
    );
  }

  /** Yalnız retryable Postgres hataları (serialization/deadlock), bounded; validation/conflict retry EDİLMEZ. */
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
      error instanceof UyapOperationWriterValidationError ||
      error instanceof UyapOperationIdempotencyConflictError ||
      error instanceof UyapOperationNotFoundError ||
      error instanceof UyapOperationClaimLostError ||
      error instanceof UyapOperationConcurrentWriteConflictError
    ) {
      return error;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // advisory lock'a rağmen unique ihlali → eşzamanlı yazım çakışması.
      return new UyapOperationConcurrentWriteConflictError();
    }

    if (
      error instanceof Error &&
      /UyapAttempt_first_attempt_pairing_check|UyapAttempt_attemptNumber_positive_check|UyapOperation_version_positive_check/i.test(
        error.message,
      )
    ) {
      return new UyapOperationConcurrentWriteConflictError();
    }

    return error instanceof Error ? error : new UyapOperationConcurrentWriteConflictError();
  }
}
