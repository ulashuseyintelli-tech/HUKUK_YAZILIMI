"use client";

import { AlertTriangle, CheckCircle2, Info, RefreshCw } from "lucide-react";
import { useBalanceShadowDiff } from "@/hooks/useBalanceShadowDiff";
import type {
  BalanceDisplayShadowDiffReport,
  ShadowAmountDiff,
  ShadowDiffSeverity,
} from "@/lib/api/balance-shadow-diff";

interface BalanceShadowDiffPanelProps {
  caseId: string;
  asOfDate?: string;
  enabled: boolean;
}

function formatAmount(amount: number | null, currency: string | null): string {
  if (amount === null || !Number.isFinite(amount)) return "n/a";

  try {
    return new Intl.NumberFormat("tr-TR", {
      style: currency ? "currency" : "decimal",
      currency: currency || undefined,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return amount.toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}

function severityClass(severity: ShadowDiffSeverity): string {
  switch (severity) {
    case "RED":
      return "bg-red-50 text-red-700 border-red-200";
    case "YELLOW":
      return "bg-yellow-50 text-yellow-700 border-yellow-200";
    case "GREEN":
      return "bg-green-50 text-green-700 border-green-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function readinessText(report: BalanceDisplayShadowDiffReport): string {
  if (report.cutoverReadiness.safeForPrimaryDisplay) return "Cutover evidence green";
  if (report.cutoverReadiness.safeForOptInShadow) return "Opt-in shadow only";
  return "Shadow blocked";
}

function pickVisibleDiffs(report: BalanceDisplayShadowDiffReport): ShadowAmountDiff[] {
  return [...report.totals.diffs, ...report.bucketDiffs]
    .filter((diff) => diff.severity !== "GREEN")
    .slice(0, 5);
}

function diffLabel(diff: ShadowAmountDiff): string {
  if (diff.code === "HELD_OVERPAYMENT_DIFF" || diff.canonicalField === "canonical.bucket.HELD_OVERPAYMENT") {
    return "Held outside debt total";
  }
  return diff.label;
}

function diffDetail(diff: ShadowAmountDiff): string | null {
  if (diff.code === "HELD_OVERPAYMENT_DIFF" || diff.canonicalField === "canonical.bucket.HELD_OVERPAYMENT") {
    return "Separate evidence; not subtracted from outstanding or applied to another scope.";
  }
  return null;
}

function diagnosticCopy(code: string): { label: string; detail?: string } {
  if (code === "OVERPAYMENT_BLOCKED") {
    return {
      label: "Blocked allocation evidence",
      detail: "Diagnostic only; not a debt, payment, or unrestricted overpayment.",
    };
  }
  if (code === "RESTRICTED_PAYMENT_DISPLAY_UNSAFE") {
    return {
      label: "Restricted payment scope unresolved",
      detail: "PaymentDesignation is required before this can be shown as surplus or applied elsewhere.",
    };
  }
  return { label: code };
}

export function BalanceShadowDiffPanel({
  caseId,
  asOfDate,
  enabled,
}: BalanceShadowDiffPanelProps) {
  const { data, loading, error, refetch } = useBalanceShadowDiff({ caseId, asOfDate, enabled });

  if (!enabled) return null;

  return (
    <section
      data-testid="balance-shadow-diff-panel"
      className="bg-white border border-dashed border-slate-300 rounded-lg p-3 text-xs text-slate-700"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <Info className="h-4 w-4 text-slate-500" />
            <h3 className="text-[12px] font-semibold text-slate-800">Shadow Balance Diff</h3>
            <span className="rounded border border-slate-300 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
              audit only
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">Not used as legal balance</p>
          <p className="text-[10px] text-slate-500">Primary display remains calculation-summary</p>
          <p className="text-[10px] text-slate-500">Canonical display is shadow evidence only</p>
          <p className="text-[10px] text-slate-500">Cutover readiness is audit evidence only</p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={loading}
          aria-label="Refresh shadow diff"
          className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && (
        <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Shadow diff yukleniyor...
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2 text-[10px] text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {data && !loading && !error && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${severityClass(data.comparability.severity)}`}>
              {data.comparability.classification}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">
              {readinessText(data)}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">
              {data.mode}
            </span>
          </div>

          <div className="space-y-1 border-t border-slate-100 pt-2">
            <MetaRow label="Legacy" value={data.sources.legacyCalculationSummary.available ? "available" : "missing"} />
            <MetaRow label="Canonical" value={data.sources.canonicalBalanceDisplay.available ? "available" : "missing"} />
            <MetaRow label="Comparable" value={data.comparability.comparable ? "yes" : "no"} />
            <MetaRow label="Currency" value={data.currency || "n/a"} />
            <MetaRow label="Version" value={data.sourceVersion} />
          </div>

          <div className="space-y-1 border-t border-slate-100 pt-2">
            <MetaRow
              label="Legacy total"
              value={formatAmount(data.totals.legacy?.totalDebtAmount ?? null, data.currency)}
            />
            <MetaRow
              label="Canonical total"
              value={formatAmount(data.totals.canonical?.totalDebtAmount ?? null, data.currency)}
            />
            <MetaRow
              label="Outstanding"
              value={formatAmount(data.totals.canonical?.outstandingAmount ?? null, data.currency)}
            />
            {(data.totals.canonical?.heldOverpaymentAmount ?? null) !== null && (
              <div data-testid="held-overpayment-wording" className="space-y-0.5">
                <MetaRow
                  label="Held outside debt total"
                  value={formatAmount(data.totals.canonical?.heldOverpaymentAmount ?? null, data.currency)}
                />
                <p className="text-[10px] text-slate-500">
                  Not subtracted from outstanding; not applied to another scope.
                </p>
              </div>
            )}
          </div>

          {data.comparability.comparable ? (
            <DiffList diffs={pickVisibleDiffs(data)} currency={data.currency} />
          ) : (
            <div className="border-t border-slate-100 pt-2 text-[10px] text-slate-500">
              Amount comparison blocked by context or currency mismatch.
            </div>
          )}

          {(data.cutoverReadiness.blockers.length > 0 || data.comparability.blockers.length > 0) && (
            <div className="border-t border-slate-100 pt-2">
              <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-red-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Blockers
              </div>
              <div className="space-y-1">
                {[...data.cutoverReadiness.blockers, ...data.comparability.blockers.map((blocker) => blocker.code)]
                  .filter((code, index, all) => all.indexOf(code) === index)
                  .map((code) => (
                    <div key={code} className="text-[10px] font-medium text-red-700">
                      {code}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {data.diagnostics.length > 0 && (
            <div className="border-t border-slate-100 pt-2">
              <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-slate-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                Diagnostics
              </div>
              <div className="space-y-1">
                {data.diagnostics.map((diagnostic) => {
                  const copy = diagnosticCopy(diagnostic.code);
                  return (
                    <div key={`${diagnostic.code}-${diagnostic.severity}`} className="text-[10px] text-slate-500">
                      <span className="font-medium text-slate-700">{copy.label}</span>
                      {copy.label !== diagnostic.code && (
                        <span className="ml-1 text-slate-400">{diagnostic.code}</span>
                      )}
                      {" - "}
                      {diagnostic.severity}
                      {copy.detail && (
                        <div className="mt-0.5 text-slate-500">
                          {copy.detail}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center gap-1 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
            <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />
            Primary display unchanged: {String(data.primaryDisplayUnchanged)}
          </div>
        </div>
      )}
    </section>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-slate-700">{value}</span>
    </div>
  );
}

function DiffList({ diffs, currency }: { diffs: ShadowAmountDiff[]; currency: string | null }) {
  if (diffs.length === 0) {
    return (
      <div className="border-t border-slate-100 pt-2 text-[10px] text-slate-500">
        Current report has no visible non-green amount diff.
      </div>
    );
  }

  return (
    <div className="border-t border-slate-100 pt-2">
      <div className="mb-1 text-[10px] font-semibold text-slate-600">Visible diffs</div>
      <div className="space-y-1">
        {diffs.map((diff) => (
          <div key={diff.code} className="text-[10px]">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-medium text-slate-700">{diffLabel(diff)}</span>
              <span className={`rounded border px-1 py-0.5 text-[9px] ${severityClass(diff.severity)}`}>
                {diff.severity}
              </span>
            </div>
            <div className="mt-0.5 flex justify-between gap-2 text-slate-500">
              <span>{formatAmount(diff.legacyAmount, currency)}</span>
              <span>{formatAmount(diff.canonicalAmount, currency)}</span>
            </div>
            {diffDetail(diff) && (
              <div className="mt-0.5 text-slate-500">{diffDetail(diff)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default BalanceShadowDiffPanel;
