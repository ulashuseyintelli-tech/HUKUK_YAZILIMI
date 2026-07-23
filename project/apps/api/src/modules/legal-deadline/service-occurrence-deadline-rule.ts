/**
 * DEBTOR-OF01-HISTORY-P04-B — occurrence-driven legal service date rule.
 *
 * Pure, side-effect-free, deterministic function: ServiceOccurrence immutable facts →
 * legalServiceDate + calculationRule + deadlineReasonCode. Mirrors the architectural pattern of
 * `LegalDeadlineService.determineLegalServiceDate()` (same "raw facts → regime → result" shape),
 * but is NOT the same function — the regime table itself is deliberately narrower, per an
 * explicit owner product decision made during this task (see below), not a refactor/extraction
 * of the legacy Tebligat-based table.
 *
 * OWNER DECISION (DEBTOR-OF01-HISTORY-P04-B, resolves this task's own STOP-02 finding):
 * `ServiceOccurrence.serviceDateRole = MUHTAR_DELIVERY` collapses THREE legacy legal regimes
 * (TK m.21/1 bilinen adres, TK m.21/2 MERNİS, TK m.20 muvakkaten başka yere gitme — the last of
 * which legally carries a +15 day rule) into one value, and the TK m.20 explicit-override signal
 * that would normally distinguish it is NOT persisted anywhere on ServiceOccurrence (P04-A1's own
 * deliberate exclusion). The owner explicitly decided NOT to model this distinction in P04-B:
 * MUHTAR_DELIVERY always resolves to `legalServiceDate = occurredOn` with NO added days, exactly
 * like DIRECT_DELIVERY. This is a KNOWINGLY ACCEPTED RISK (a real TK m.20 occurrence recorded as
 * MUHTAR_DELIVERY would be under-calculated by 15 days) — not a silent technical assumption. No
 * schema change, no new override column, no re-read of mutable Tebligat.tk21Type were authorized
 * or made to resolve this; `addressTypeAtOccurrence` is preserved on ServiceOccurrence for
 * tenant/audit/context purposes only and is NOT used to branch this regime table.
 *
 * PUBLICATION (ilanen tebliğ, TK m.31) is deliberately kept as its own, separate regime — not
 * conflated with MUHTAR_DELIVERY — matching the +7 day rule already established in
 * `LegalDeadlineService.determineLegalServiceDate()`'s ILANEN branch. `recordPttResult()` never
 * produces PUBLICATION today (P04-A1 finding); the branch exists for forward-compatibility with a
 * possible future ilanen-completion write path, not because real data currently exercises it.
 */
import { ServiceOccurrenceServiceDateRole } from "@prisma/client";
import { DeadlineInputIncompleteError } from "./service-occurrence-deadline-calculation.errors";

/** TK m.31 ilanen tebliğ: ilan tarihinden 7 gün sonra tebliğ edilmiş sayılır. */
const PUBLICATION_DELAY_DAYS = 7;

export interface OccurrenceLegalServiceDateResult {
  legalServiceDate: Date;
  calculationRule: string;
  deadlineReasonCode: string;
}

export interface OccurrenceDeadlineFacts {
  serviceDateRole: ServiceOccurrenceServiceDateRole | null;
  addressTypeAtOccurrence: string | null;
  occurredOn: Date;
}

/**
 * Fails closed (`DeadlineInputIncompleteError`) rather than guessing when:
 * - `addressTypeAtOccurrence` is missing (owner brief §17 TEST-05 — a basic completeness gate;
 *   this field is no longer used to branch the regime table per the owner decision above, but its
 *   presence is still required as a documented context fact for every non-legacy occurrence).
 * - `serviceDateRole` is null (failed/redirect PTT outcome — no delivery/deposit mechanism
 *   occurred; there is genuinely nothing to calculate a legal service date FROM).
 * - `serviceDateRole` is a value this function doesn't recognize (exhaustiveness-checked;
 *   fail-closed on a hypothetical future enum value added without updating this function).
 */
export function determineOccurrenceLegalServiceDate(
  facts: OccurrenceDeadlineFacts,
): OccurrenceLegalServiceDateResult {
  if (!facts.addressTypeAtOccurrence) {
    throw new DeadlineInputIncompleteError("addressTypeAtOccurrence is missing");
  }
  if (!facts.serviceDateRole) {
    throw new DeadlineInputIncompleteError(
      "serviceDateRole is null (no delivery/deposit mechanism occurred for this occurrence)",
    );
  }

  switch (facts.serviceDateRole) {
    case ServiceOccurrenceServiceDateRole.DIRECT_DELIVERY:
      return {
        legalServiceDate: facts.occurredOn,
        calculationRule: "OCCURRENCE_DIRECT_DELIVERY_NO_DELAY",
        deadlineReasonCode: "DIRECT_DELIVERY",
      };

    case ServiceOccurrenceServiceDateRole.MUHTAR_DELIVERY:
      // Owner decision (see file header): no TK 20/21-1/21-2 split, no added days.
      return {
        legalServiceDate: facts.occurredOn,
        calculationRule: "OCCURRENCE_MUHTAR_DELIVERY_NO_DELAY",
        deadlineReasonCode: "MUHTAR_DELIVERY",
      };

    case ServiceOccurrenceServiceDateRole.PUBLICATION:
      return {
        legalServiceDate: addDays(facts.occurredOn, PUBLICATION_DELAY_DAYS),
        calculationRule: "OCCURRENCE_PUBLICATION_PLUS_7_DAYS",
        deadlineReasonCode: "ILANEN_M31",
      };

    default: {
      const exhaustiveCheck: never = facts.serviceDateRole;
      throw new DeadlineInputIncompleteError(
        `unsupported serviceDateRole: ${String(exhaustiveCheck)}`,
      );
    }
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
