import { Injectable } from "@nestjs/common";
import { Prisma, ServiceOccurrence, ServiceOccurrenceType } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  CreateServiceOccurrenceCommand,
  CreateServiceOccurrenceResult,
  IdempotencyMode,
  ServiceOccurrenceReplacementFields,
  SupersedeServiceOccurrenceCommand,
  SupersedeServiceOccurrenceResult,
} from "./service-occurrence.types";
import {
  ServiceOccurrenceAlreadySupersededError,
  ServiceOccurrenceConcurrentWriteConflictError,
  ServiceOccurrenceIdempotencyConflictError,
  ServiceOccurrenceNotActiveError,
  ServiceOccurrenceParentNotFoundError,
  ServiceOccurrenceValidationError,
} from "./service-occurrence.errors";
import { serviceOccurrenceCreateLockKey, serviceOccurrenceSupersedeLockKey } from "./service-occurrence-lock";

/** occurrenceType parametresi kasıtlı olarak GENİŞ (ServiceOccurrenceType) tipte — çağıran taraf
 * NormalServiceOccurrenceType (LEGACY_BASELINE hariç) ile tiplenmiş olsa da, bu runtime guard
 * unchecked cast/JS çağrısı gibi tip sisteminin dışına çıkan senaryolara karşı savunma katmanıdır. */
function isLegacyBaselineType(value: ServiceOccurrenceType): boolean {
  return value === ServiceOccurrenceType.LEGACY_BASELINE;
}

const MAX_TRANSACTION_ATTEMPTS = 3;

/**
 * DEBTOR-OF01-HISTORY-P02 — ServiceOccurrence write-side / idempotency foundation.
 * Internal application service. P02'de public controller/DTO/HTTP endpoint YOKTUR;
 * hiçbir runtime call graph'a bağlı değildir (bkz. DEBTOR-DBP-04 §12.2, PR #1498/#1503).
 */
@Injectable()
export class ServiceOccurrenceService {
  constructor(private readonly prisma: PrismaService) {}

  async createOccurrence(command: CreateServiceOccurrenceCommand): Promise<CreateServiceOccurrenceResult> {
    this.validateFactualFields(
      command.occurrenceType,
      command.timePrecision,
      command.occurredAt,
      command.actor,
      command.sourceSystemCode,
      command.sourceCode,
      command.sourceNote,
    );
    if (!command.idempotencyMode) {
      throw new ServiceOccurrenceValidationError("idempotencyMode zorunludur, örtük NONE varsayılamaz");
    }
    if (command.idempotencyMode === IdempotencyMode.STRONG_SOURCE_HASH && !command.sourcePayloadHash?.trim()) {
      throw new ServiceOccurrenceValidationError("STRONG_SOURCE_HASH modu sourcePayloadHash gerektirir");
    }

    const parent = await this.loadParentTebligat(command.tenantId, command.sourceTebligatId);
    const data = this.buildCreateData(command, parent);

    if (command.idempotencyMode === IdempotencyMode.NONE) {
      const occurrence = await this.prisma.serviceOccurrence.create({ data });
      return { occurrence, created: true };
    }

    return this.createWithStrongSourceHash(command, data);
  }

  async supersedeOccurrence(command: SupersedeServiceOccurrenceCommand): Promise<SupersedeServiceOccurrenceResult> {
    this.validateFactualFields(
      command.replacement.occurrenceType,
      command.replacement.timePrecision,
      command.replacement.occurredAt,
      command.actor,
      command.replacement.sourceSystemCode,
      command.replacement.sourceCode,
      command.replacement.sourceNote,
    );
    if (!command.correctionReasonCode?.trim()) {
      throw new ServiceOccurrenceValidationError("correctionReasonCode zorunludur");
    }
    if (!command.idempotencyMode) {
      throw new ServiceOccurrenceValidationError("idempotencyMode zorunludur");
    }
    if (command.idempotencyMode === IdempotencyMode.STRONG_SOURCE_HASH && !command.replacement.sourcePayloadHash?.trim()) {
      throw new ServiceOccurrenceValidationError("STRONG_SOURCE_HASH modu sourcePayloadHash gerektirir");
    }

    // Hızlı ön-kontrol (kilitsiz) — açıkça geçersiz istekleri transaction açmadan reddeder.
    const precheck = await this.prisma.serviceOccurrence.findFirst({
      where: { id: command.previousOccurrenceId, tenantId: command.tenantId },
    });
    if (!precheck || precheck.status !== "ACTIVE") {
      throw new ServiceOccurrenceNotActiveError();
    }

    const lockKey = serviceOccurrenceSupersedeLockKey(command.tenantId, command.previousOccurrenceId);

    return this.withRetryableTransaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      // Yetkili yeniden-kontrol (kilit altında) — ön-kontrol ile burası arasında kazanan bir
      // eşzamanlı istek varsa burada yakalanır (ALREADY_SUPERSEDED).
      const previous = await tx.serviceOccurrence.findFirst({
        where: { id: command.previousOccurrenceId, tenantId: command.tenantId },
      });
      if (!previous || previous.status !== "ACTIVE") {
        throw new ServiceOccurrenceAlreadySupersededError();
      }

      // Owner brief §10: yeni occurrence aynı tenantId/sourceTebligatId/caseId/caseDebtorId
      // scope'unda oluşturulur — bunlar Tebligat'tan DEĞİL, previous occurrence'ın kendisinden
      // kopyalanır (previous zaten doğru şekilde türetilmişti).
      const createData: Prisma.ServiceOccurrenceUncheckedCreateInput = {
        tenantId: command.tenantId,
        caseId: previous.caseId,
        caseDebtorId: previous.caseDebtorId,
        sourceTebligatId: previous.sourceTebligatId,
        occurrenceType: command.replacement.occurrenceType,
        sourceSystemCode: command.replacement.sourceSystemCode,
        sourceCode: command.replacement.sourceCode,
        occurredOn: command.replacement.occurredOn,
        occurredAt: command.replacement.occurredAt ?? null,
        timePrecision: command.replacement.timePrecision,
        receivedAt: command.replacement.receivedAt ?? null,
        recordedByUserId: command.actor.userId ?? null,
        recordedBySystem: command.actor.systemCode ?? null,
        barcodeNo: command.replacement.barcodeNo ?? null,
        sourceNote: command.replacement.sourceNote ?? null,
        sourcePayloadHash: command.replacement.sourcePayloadHash ?? null,
        evidenceReference: command.replacement.evidenceReference ?? null,
        supersedesOccurrenceId: previous.id,
        correctionReasonCode: command.correctionReasonCode,
      };

      // Owner brief §10 sıralaması: INSERT önce, sonra eski kaydın ACTIVE→SUPERSEDED güncellemesi,
      // AYNI transaction içinde (P01 trigger'ı yalnız bu tek geçişe izin verir).
      const newOccurrence = await tx.serviceOccurrence.create({ data: createData });
      const updatedPrevious = await tx.serviceOccurrence.update({
        where: { id: previous.id },
        data: { status: "SUPERSEDED" },
      });

      return { newOccurrence, previousOccurrence: updatedPrevious };
    });
  }

  private validateFactualFields(
    occurrenceType: ServiceOccurrenceType,
    timePrecision: string,
    occurredAt: Date | null | undefined,
    actor: { userId?: string | null; systemCode?: string | null },
    sourceSystemCode: string,
    sourceCode: string,
    sourceNote: string | null | undefined,
  ): void {
    if (isLegacyBaselineType(occurrenceType)) {
      throw new ServiceOccurrenceValidationError("occurrenceType=LEGACY_BASELINE normal create/supersede metodunda kullanılamaz");
    }
    if (timePrecision === "DATE_ONLY" && occurredAt != null) {
      throw new ServiceOccurrenceValidationError("timePrecision=DATE_ONLY iken occurredAt dolu olamaz");
    }
    if (timePrecision === "EXACT_TIME" && (occurredAt == null || Number.isNaN(occurredAt.getTime()))) {
      throw new ServiceOccurrenceValidationError("timePrecision=EXACT_TIME iken occurredAt zorunlu ve geçerli bir UTC timestamp olmalı");
    }
    if (!actor?.userId && !actor?.systemCode) {
      throw new ServiceOccurrenceValidationError("actor.userId veya actor.systemCode alanlarından en az biri zorunludur");
    }
    if (!sourceSystemCode?.trim()) {
      throw new ServiceOccurrenceValidationError("sourceSystemCode boş veya yalnız whitespace olamaz");
    }
    if (!sourceCode?.trim()) {
      throw new ServiceOccurrenceValidationError("sourceCode boş veya yalnız whitespace olamaz");
    }
    if (sourceNote != null && sourceNote.length > 500) {
      throw new ServiceOccurrenceValidationError("sourceNote 500 karakteri aşamaz");
    }
  }

  private async loadParentTebligat(tenantId: string, sourceTebligatId: string) {
    const parent = await this.prisma.tebligat.findFirst({
      where: { id: sourceTebligatId, tenantId },
      select: { id: true, caseId: true, caseDebtorId: true },
    });
    if (!parent) {
      // Genel NOT_FOUND — başka tenant'ta var olup olmadığı açıklanmaz (cross-tenant probing yok).
      throw new ServiceOccurrenceParentNotFoundError();
    }
    return parent;
  }

  private buildCreateData(
    command: CreateServiceOccurrenceCommand,
    parent: { id: string; caseId: string; caseDebtorId: string | null },
  ): Prisma.ServiceOccurrenceUncheckedCreateInput {
    return {
      tenantId: command.tenantId,
      caseId: parent.caseId,
      caseDebtorId: parent.caseDebtorId,
      sourceTebligatId: parent.id,
      occurrenceType: command.occurrenceType,
      sourceSystemCode: command.sourceSystemCode,
      sourceCode: command.sourceCode,
      occurredOn: command.occurredOn,
      occurredAt: command.occurredAt ?? null,
      timePrecision: command.timePrecision,
      receivedAt: command.receivedAt ?? null,
      recordedByUserId: command.actor.userId ?? null,
      recordedBySystem: command.actor.systemCode ?? null,
      barcodeNo: command.barcodeNo ?? null,
      sourceNote: command.sourceNote ?? null,
      sourcePayloadHash: command.sourcePayloadHash ?? null,
      evidenceReference: command.evidenceReference ?? null,
    };
  }

  private async createWithStrongSourceHash(
    command: CreateServiceOccurrenceCommand,
    data: Prisma.ServiceOccurrenceUncheckedCreateInput,
  ): Promise<CreateServiceOccurrenceResult> {
    const sourcePayloadHash = command.sourcePayloadHash as string; // validated non-empty önce
    const lockKey = serviceOccurrenceCreateLockKey(
      command.tenantId,
      command.sourceTebligatId,
      command.sourceSystemCode,
      sourcePayloadHash,
    );

    return this.withRetryableTransaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const existing = await tx.serviceOccurrence.findFirst({
        where: {
          tenantId: command.tenantId,
          sourceTebligatId: command.sourceTebligatId,
          sourceSystemCode: command.sourceSystemCode,
          sourcePayloadHash,
        },
      });

      if (existing) {
        if (this.isFactualPayloadEqual(existing, command)) {
          return { occurrence: existing, created: false, reason: "IDEMPOTENT_REUSE" as const };
        }
        throw new ServiceOccurrenceIdempotencyConflictError();
      }

      const occurrence = await tx.serviceOccurrence.create({ data });
      return { occurrence, created: true as const };
    });
  }

  private isFactualPayloadEqual(existing: ServiceOccurrence, command: CreateServiceOccurrenceCommand): boolean {
    return (
      existing.occurrenceType === command.occurrenceType &&
      existing.sourceCode === command.sourceCode &&
      existing.occurredOn.getTime() === command.occurredOn.getTime() &&
      this.datesEqual(existing.occurredAt, command.occurredAt) &&
      existing.timePrecision === command.timePrecision &&
      this.datesEqual(existing.receivedAt, command.receivedAt) &&
      (existing.barcodeNo ?? null) === (command.barcodeNo ?? null) &&
      (existing.evidenceReference ?? null) === (command.evidenceReference ?? null)
    );
  }

  private datesEqual(a: Date | null, b: Date | null | undefined): boolean {
    const bNorm = b ?? null;
    if (a === null && bNorm === null) return true;
    if (a === null || bNorm === null) return false;
    return a.getTime() === bNorm.getTime();
  }

  /** §13: yalnız retryable Postgres hataları (serialization/deadlock), bounded, validation/unique conflict retry edilmez. */
  private async withRetryableTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return true;
    }
    return error instanceof Error && /deadlock detected/i.test(error.message);
  }

  /** Raw Prisma/Postgres hataları module dışına sızdırılmaz; zaten typed olan domain error'lar aynen iletilir. */
  private mapWriteError(error: unknown): Error {
    if (
      error instanceof ServiceOccurrenceIdempotencyConflictError ||
      error instanceof ServiceOccurrenceParentNotFoundError ||
      error instanceof ServiceOccurrenceValidationError ||
      error instanceof ServiceOccurrenceNotActiveError ||
      error instanceof ServiceOccurrenceAlreadySupersededError ||
      error instanceof ServiceOccurrenceConcurrentWriteConflictError
    ) {
      return error;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return new ServiceOccurrenceConcurrentWriteConflictError();
    }

    if (
      error instanceof Error &&
      /service_occurrence_illegal_status_transition|service_occurrence_immutable_violation|immutable_violation/i.test(error.message)
    ) {
      return new ServiceOccurrenceConcurrentWriteConflictError();
    }

    return error instanceof Error ? error : new ServiceOccurrenceConcurrentWriteConflictError();
  }
}

export type { ServiceOccurrenceReplacementFields };
