// CHANGE_STATUS savedIntent -> minimal özet.
// Kaynak şekil (doğrulandı): case-status.controller.ts tek üretici satır -> { status, reason }.
import type { ApprovalSummaryField, ApprovalSummaryProjector, ApprovalSummaryResult } from "./types";
import { UNSAFE_SUMMARY_REASON } from "./types";
import { isRecord, isNonEmptyString } from "./guards";

const unsafe = (): ApprovalSummaryResult => ({ kind: "unsafe", fields: [], reason: UNSAFE_SUMMARY_REASON });

export const projectChangeStatus: ApprovalSummaryProjector = (savedIntent) => {
  if (!isRecord(savedIntent) || typeof savedIntent.status !== "string") return unsafe();

  const fields: ApprovalSummaryField[] = [{ label: "Yeni Durum", value: savedIntent.status }];
  if (isNonEmptyString(savedIntent.reason)) {
    fields.push({ label: "Gerekçe", value: savedIntent.reason });
  }

  return { kind: "summary", fields };
};
