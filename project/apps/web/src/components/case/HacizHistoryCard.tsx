"use client";

import { useState } from "react";
import { CaseHistoryPanel } from "./CaseHistoryPanel";

/**
 * CASEDETAILTABS-MIGRATION-C1: #123 "Haciz Gönderim Geçmişi"ni canlı dosya detayına
 * collapsible + lazy yüzeyler. Kapalı gelir; YALNIZ açılınca CaseHistoryPanel mount → GET /audit/logs.
 * Salt görüntüleme. CaseHistoryPanel değiştirilmez (drop-in). Eski (ölü) CaseDetailTabs'a dokunulmaz.
 */
export function HacizHistoryCard({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2"
      >
        <div className="text-left">
          <h4 className="text-[11px] font-semibold text-gray-700">Haciz Gönderim Geçmişi</h4>
          <p className="text-[9px] text-gray-400">Haciz talebi gönderildiği andaki risk ve işlem izi. Salt görüntüleme.</p>
        </div>
        <span className="text-[10px] text-blue-600 whitespace-nowrap">{open ? "▲ Gizle" : "▼ Göster"}</span>
      </button>
      {open && (
        <div className="mt-2">
          <CaseHistoryPanel caseId={caseId} />
        </div>
      )}
    </div>
  );
}
