"use client";

// Approval Inbox — savedIntent/replacementSavedIntent için insan-okur özet + "Onaylanırsa ne değişir?"
// + ham JSON'ı "Advanced" olarak (kaldırmadan) collapsible tutar. summary üretilemezse (unsafe) JSON
// varsayılan olarak AÇIK gelir (gösterilecek başka bir şey yok); summary varsa varsayılan KAPALI.
import { useState } from "react";
import { CopyButton } from "@/components/error/CopyButton";
import { getApprovalSummary } from "./summary/registry";
import type { ApprovalSummaryContext } from "./summary/types";

interface Props {
  title: string;
  actionCode: string;
  savedIntent: unknown;
  context: ApprovalSummaryContext;
  copyAriaLabel: string;
}

function toneClass(tone?: "default" | "warning" | "danger"): string {
  if (tone === "danger") return "text-red-700";
  if (tone === "warning") return "text-amber-700";
  return "text-gray-900";
}

export function ApprovalIntentSummary({ title, actionCode, savedIntent, context, copyAriaLabel }: Props) {
  const json = JSON.stringify(savedIntent, null, 2);
  const result = getApprovalSummary(actionCode, savedIntent, context);
  const [jsonOpen, setJsonOpen] = useState(result.kind !== "summary");

  return (
    <div className="mt-4">
      <div className="mb-1">
        <span className="text-xs text-gray-500">{title}</span>
      </div>

      {result.kind === "summary" ? (
        <div className="rounded border bg-gray-50 p-3 text-sm space-y-2" data-testid="approval-summary">
          <dl className="space-y-1">
            {result.fields.map((field, index) => (
              <div key={`${field.label}-${index}`} className="flex justify-between gap-3">
                <dt className="text-xs text-gray-500 shrink-0">{field.label}</dt>
                <dd className={`text-right break-words text-sm ${toneClass(field.tone)}`}>{field.value}</dd>
              </div>
            ))}
          </dl>
          {result.impactNotes && result.impactNotes.length > 0 && (
            <div className="border-t pt-2">
              <div className="text-xs font-medium text-gray-500 mb-1">Onaylanırsa ne değişir?</div>
              <ul className="list-disc list-inside text-xs text-gray-700 space-y-0.5">
                {result.impactNotes.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div
          className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
          data-testid="approval-summary-unsafe"
        >
          {result.reason}
        </div>
      )}

      <div className="mt-2">
        <button
          type="button"
          onClick={() => setJsonOpen((v) => !v)}
          className="text-xs text-gray-500 underline"
          aria-expanded={jsonOpen}
        >
          {jsonOpen ? "Ham JSON'ı gizle" : "Advanced / Ham JSON"}
        </button>
        {jsonOpen && (
          <div className="mt-1">
            <div className="flex items-center justify-end mb-1">
              <CopyButton value={json} ariaLabel={copyAriaLabel} />
            </div>
            <pre className="max-h-96 overflow-auto bg-gray-50 text-xs p-3 rounded border">{json}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
