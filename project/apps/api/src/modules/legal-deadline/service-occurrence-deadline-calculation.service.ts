import { Injectable, Logger } from "@nestjs/common";
import { Prisma, LegalDeadlineSnapshot, LegalDeadlineType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { determineOccurrenceLegalServiceDate } from "./service-occurrence-deadline-rule";
import { serviceOccurrenceDeadlineCalculationLockKey } from "./service-occurrence-deadline-calculation-lock";
import {
  OccurrenceNotFoundError,
  OccurrenceTenantMismatchError,
  OccurrenceSupersededError,
  DeadlineInputIncompleteError,
  RuleVersionUnavailableError,
  SnapshotIdempotencyConflictError,
  ConcurrentRecalculationConflictError,
  SnapshotWriteFailedError,
} from "./service-occurrence-deadline-calculation.errors";

/**
 * DEBTOR-OF01-HISTORY-P04-B — occurrence-driven, idempotent legal deadline calculation.
 *
 * Reads ONLY immutable ServiceOccurrence facts (serviceRegimeCode, serviceCompletionMode,
 * substituteRecipientBasis, addressTypeAtOccurrence, occurredOn — DEBTOR-OF01-HISTORY-P04-B-R2-I03
 * itibarıyla serviceDateRole yerine bunlar okunur, bkz. service-occurrence-deadline-rule.ts) —
 * never re-reads mutable Tebligat fields (tk21Type, muhtarlikDate, ilanDate,
 * deliveredAt, pttResult, pttResultDate, addressType). Does not register with
 * ActionHandlerService, does not consume the outbox, does not touch the read-path — a future
 * consumer (P04-C, NOT this task) will call `calculateForOccurrence` given a resolved
 * serviceOccurrenceId (e.g. via ServiceOccurrenceRecordedEventAccessor, P04-A2).
 */

const CALCULATION_VERSION = "occurrence-deadline-v1";
const MAX_TRANSACTION_ATTEMPTS = 3;
const MAX_OBJECTION_PERIOD_DAYS = 365;

export interface CalculateForOccurrenceCommand {
  tenantId: string;
  serviceOccurrenceId: string;
  calculationVersion: string;
  /**
   * `LegalDeadlineService.calculateDeadline`'ın kendi sözleşmesiyle aynı gerekçe (owner brief
   * MPB-028(a) PR-2 Decision A): CaseType/subType → itiraz günü eşleştirmesi canonical olarak
   * çözülmedikçe bu servis de itiraz gün sayısını TAHMİN ETMEZ. Çağıran tarafından sağlanan,
   * doğrulanmış bir girdidir.
   */
  objectionPeriodDays: number;
  /** Owner brief §5: systemActor / executionContext — şu an yalnız gelecekteki audit/log
   * genişletmesi için taşınır, calculation çıktısını etkilemez. */
  systemActor?: string;
}

@Injectable()
export class ServiceOccurrenceDeadlineCalculationService {
  private readonly logger = new Logger(ServiceOccurrenceDeadlineCalculationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async calculateForOccurrence(
    command: CalculateForOccurrenceCommand,
  ): Promise<LegalDeadlineSnapshot> {
    this.assertValidObjectionPeriodDays(command.objectionPeriodDays);

    if (command.calculationVersion !== CALCULATION_VERSION) {
      throw new RuleVersionUnavailableError(command.calculationVersion);
    }

    // Pre-read (outside the lock/transaction): only to learn sourceTebligatId for lock-key
    // construction. NOT authoritative — the authoritative re-read happens under the advisory
    // lock below (same "pre-check then locked re-check" shape as ServiceOccurrenceService's own
    // create/supersede paths).
    const preRead = await (this.prisma as any).serviceOccurrence.findFirst({
      where: { id: command.serviceOccurrenceId },
    });
    if (!preRead) {
      throw new OccurrenceNotFoundError();
    }
    if (preRead.tenantId !== command.tenantId) {
      throw new OccurrenceTenantMismatchError();
    }

    const lockKey = serviceOccurrenceDeadlineCalculationLockKey(
      command.tenantId,
      preRead.sourceTebligatId,
    );

    return this.withRetryableTransaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      // Authoritative re-read UNDER the lock (owner brief §10 step 3-4).
      const occurrence = await (tx as any).serviceOccurrence.findFirst({
        where: { id: command.serviceOccurrenceId },
      });
      if (!occurrence) {
        throw new OccurrenceNotFoundError();
      }
      if (occurrence.tenantId !== command.tenantId) {
        throw new OccurrenceTenantMismatchError();
      }
      if (occurrence.status === "SUPERSEDED") {
        throw new OccurrenceSupersededError();
      }

      const regime = determineOccurrenceLegalServiceDate({
        serviceRegimeCode: occurrence.serviceRegimeCode,
        serviceCompletionMode: occurrence.serviceCompletionMode,
        substituteRecipientBasis: occurrence.substituteRecipientBasis,
        addressTypeAtOccurrence: occurrence.addressTypeAtOccurrence,
        occurredOn: occurrence.occurredOn,
      });
      const dueDate = addDays(regime.legalServiceDate, command.objectionPeriodDays);

      // Existing ACTIVE snapshot check — Tebligat-scoped (owner brief §8/§12; same scope
      // LegalDeadlineService.calculateDeadline already uses for its own existingActive lookup).
      const existingActive = await tx.legalDeadlineSnapshot.findFirst({
        where: {
          tenantId: command.tenantId,
          sourceTebligatId: occurrence.sourceTebligatId,
          status: "ACTIVE",
        },
      });

      if (existingActive) {
        const sameOccurrenceAndVersion =
          existingActive.sourceServiceOccurrenceId === command.serviceOccurrenceId &&
          existingActive.calculationVersion === CALCULATION_VERSION;

        if (sameOccurrenceAndVersion) {
          const sameOutput =
            existingActive.legalServiceDate.getTime() === regime.legalServiceDate.getTime() &&
            existingActive.dueDate.getTime() === dueDate.getTime() &&
            existingActive.deadlineReasonCode === regime.deadlineReasonCode;

          if (sameOutput) {
            // Idempotent no-op — aynı occurrence + aynı version + aynı çıktı.
            return existingActive;
          }
          // Aynı occurrence + aynı version, FARKLI çıktı — deterministik bir fonksiyon için bu
          // asla olmamalı; sessizce üzerine yazmak yerine fail-closed.
          throw new SnapshotIdempotencyConflictError();
        }
        // else: farklı occurrence VEYA farklı version → meşru yeni hesaplama, supersede + create.
      }

      if (existingActive) {
        await tx.legalDeadlineSnapshot.update({
          where: { id: existingActive.id },
          data: { status: "SUPERSEDED" },
        });
      }

      const created = await tx.legalDeadlineSnapshot.create({
        data: {
          tenantId: command.tenantId,
          caseId: occurrence.caseId,
          caseDebtorId: occurrence.caseDebtorId,
          sourceTebligatId: occurrence.sourceTebligatId,
          sourceServiceOccurrenceId: occurrence.id,
          deadlineType: LegalDeadlineType.OBJECTION_PERIOD,
          legalServiceDate: regime.legalServiceDate,
          dueDate,
          calculationRule: regime.calculationRule,
          calculationVersion: CALCULATION_VERSION,
          deadlineReasonCode: regime.deadlineReasonCode,
          supersedesSnapshotId: existingActive?.id ?? null,
          status: "ACTIVE",
        },
      });

      this.logger.log(
        `Occurrence-driven LegalDeadlineSnapshot oluşturuldu: occurrence=${occurrence.id}, reasonCode=${regime.deadlineReasonCode}`,
      );

      return created;
    });
  }

  private assertValidObjectionPeriodDays(objectionPeriodDays: number): void {
    if (
      typeof objectionPeriodDays !== "number" ||
      !Number.isInteger(objectionPeriodDays) ||
      objectionPeriodDays <= 0
    ) {
      throw new RangeError(
        "objectionPeriodDays pozitif bir tam sayı olmalıdır (eksik/sıfır/negatif değer kabul edilmez)",
      );
    }
    if (objectionPeriodDays > MAX_OBJECTION_PERIOD_DAYS) {
      throw new RangeError(
        `objectionPeriodDays makul üst sınırı (${MAX_OBJECTION_PERIOD_DAYS} gün) aşıyor`,
      );
    }
  }

  /** §15: yalnız retryable Postgres hataları (serialization/deadlock), bounded, validation/unique
   * conflict retry edilmez. `ServiceOccurrenceService.withRetryableTransaction` ile aynı desen. */
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return true;
    }
    return error instanceof Error && /deadlock detected/i.test(error.message);
  }

  /** Raw Prisma/Postgres hataları module dışına sızdırılmaz; zaten typed olan domain error'lar
   * aynen iletilir (owner brief §14). */
  private mapWriteError(error: unknown): Error {
    if (
      error instanceof OccurrenceNotFoundError ||
      error instanceof OccurrenceTenantMismatchError ||
      error instanceof OccurrenceSupersededError ||
      error instanceof DeadlineInputIncompleteError ||
      error instanceof RuleVersionUnavailableError ||
      error instanceof SnapshotIdempotencyConflictError ||
      error instanceof RangeError
    ) {
      return error;
    }

    if (this.isRetryableTransientError(error)) {
      return new ConcurrentRecalculationConflictError();
    }

    this.logger.error(`Snapshot write failed: ${error instanceof Error ? error.message : String(error)}`);
    return new SnapshotWriteFailedError();
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
