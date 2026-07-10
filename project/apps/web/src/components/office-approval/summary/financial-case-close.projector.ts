import type { ApprovalSummaryField, ApprovalSummaryProjector, ApprovalSummaryResult } from "./types";
import { UNSAFE_SUMMARY_REASON } from "./types";
import { isRecord, isNonEmptyString } from "./guards";

const INTENT_VERSION = "OWN29C_FINANCIAL_CASE_CLOSE_V1";
const unsafe = (): ApprovalSummaryResult => ({ kind: "unsafe", fields: [], reason: UNSAFE_SUMMARY_REASON });

export const projectFinancialCaseClose: ApprovalSummaryProjector = (savedIntent) => {
  if (
    !isRecord(savedIntent) ||
    savedIntent.version !== INTENT_VERSION ||
    !isNonEmptyString(savedIntent.caseId) ||
    !isNonEmptyString(savedIntent.status)
  ) {
    return unsafe();
  }

  const fields: ApprovalSummaryField[] = [
    { label: "Dosya", value: savedIntent.caseId },
    { label: "Kapanış Durumu", value: savedIntent.status },
  ];
  if (isNonEmptyString(savedIntent.reason)) {
    fields.push({ label: "Gerekçe", value: savedIntent.reason });
  }

  return { kind: "summary", fields };
};
