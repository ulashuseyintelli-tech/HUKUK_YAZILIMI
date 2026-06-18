"use client";

// PR-3b — Çoklu borç enstrümanı inceleme tablosu (controlled).
// Kullanıcı seçer/düzenler (tutar/vade); seçilen enstrümanlar → N alacak kalemi (page wiring).
// Yalnız wizardResult.instruments.length > 1 iken gösterilir (veri-bazlı kapı).

import React from "react";
import { AlertTriangle } from "lucide-react";
import { Instrument, INSTRUMENT_TYPE_LABELS, ReviewRow } from "./ocr-instrument";

interface InstrumentReviewTableProps {
  rows: ReviewRow[];
  onChange: (rows: ReviewRow[]) => void;
}

function pageLabel(inst: Instrument): string {
  if (inst.pageRange) {
    const [from, to] = inst.pageRange;
    return from === to ? `Sayfa ${from}` : `Sayfa ${from}-${to}`;
  }
  if (inst.sourcePages && inst.sourcePages.length > 0) {
    return `Sayfa ${inst.sourcePages.join(", ")}`;
  }
  return "-";
}

function confidenceLabel(inst: Instrument): string {
  const parts: string[] = [];
  if (inst.confidence != null) parts.push(`%${inst.confidence}`);
  if (inst.groupConfidence != null) parts.push(`grup ${Math.round(inst.groupConfidence * 100)}%`);
  return parts.join(" · ") || "-";
}

export function InstrumentReviewTable({ rows, onChange }: InstrumentReviewTableProps) {
  const update = (index: number, mut: (row: ReviewRow) => ReviewRow) => {
    onChange(rows.map((r, i) => (i === index ? mut(r) : r)));
  };
  const toggle = (index: number) => update(index, (r) => ({ ...r, selected: !r.selected }));
  const editAmount = (index: number, value: string) =>
    update(index, (r) => ({
      ...r,
      instrument: { ...r.instrument, amount: value === "" ? undefined : Number(value) },
    }));
  const editDueDate = (index: number, value: string) =>
    update(index, (r) => ({ ...r, instrument: { ...r.instrument, dueDate: value || undefined } }));

  return (
    <div className="overflow-x-auto rounded border border-amber-200 bg-white">
      <table className="w-full text-xs" data-testid="instrument-review-table">
        <thead>
          <tr className="bg-amber-100 text-amber-900 text-left">
            <th className="px-2 py-1">Seç</th>
            <th className="px-2 py-1">Tür</th>
            <th className="px-2 py-1">No</th>
            <th className="px-2 py-1">Vade</th>
            <th className="px-2 py-1">Tutar</th>
            <th className="px-2 py-1">Keşideci</th>
            <th className="px-2 py-1">Sayfa</th>
            <th className="px-2 py-1">Güven</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const inst = row.instrument;
            const review = inst.needsReview === true;
            return (
              <React.Fragment key={index}>
                <tr className={review ? "bg-amber-50" : ""} data-testid={`instrument-row-${index}`}>
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={() => toggle(index)}
                      aria-label={`Satır ${index + 1} seç`}
                    />
                  </td>
                  <td className="px-2 py-1">
                    {INSTRUMENT_TYPE_LABELS[inst.type] ?? inst.type}
                    {review && (
                      <span title={inst.duplicateCandidateReason} className="ml-1 inline-flex align-middle">
                        <AlertTriangle className="h-3 w-3 text-amber-600" />
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1">{inst.documentNo ?? "-"}</td>
                  <td className="px-2 py-1">
                    <input
                      type="date"
                      value={inst.dueDate ?? ""}
                      onChange={(e) => editDueDate(index, e.target.value)}
                      className="border rounded px-1 py-0.5 text-xs"
                      aria-label={`Satır ${index + 1} vade`}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      value={inst.amount ?? ""}
                      onChange={(e) => editAmount(index, e.target.value)}
                      className="border rounded px-1 py-0.5 text-xs w-24"
                      aria-label={`Satır ${index + 1} tutar`}
                    />
                  </td>
                  <td className="px-2 py-1">{inst.drawerName ?? "-"}</td>
                  <td className="px-2 py-1">{pageLabel(inst)}</td>
                  <td className="px-2 py-1">{confidenceLabel(inst)}</td>
                </tr>
                {(inst.evidenceText || (review && inst.duplicateCandidateReason)) && (
                  <tr className={review ? "bg-amber-50" : ""}>
                    <td />
                    <td colSpan={7} className="px-2 pb-1 text-[10px] text-slate-500">
                      {review && inst.duplicateCandidateReason && (
                        <div className="text-amber-700">⚠ {inst.duplicateCandidateReason}</div>
                      )}
                      {inst.evidenceText && (
                        <div title="AI bunu nereden çıkardı?">Kanıt: {inst.evidenceText}</div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
