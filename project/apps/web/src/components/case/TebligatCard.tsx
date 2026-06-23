"use client";

import { useState } from "react";
import { TebligatPanel } from "@/components/tebligat/TebligatPanel";

/**
 * CASEDETAILTABS-MIGRATION-C2a/C2b-manuel: zengin tebligat/TebligatPanel'i canlı dosya detayına
 * collapsible + lazy yüzeyler. Kapalı gelir; YALNIZ açılınca panel mount →
 * GET /tebligat/case/:caseId (+ summary). Dosya-seviyesi (caseDebtorId YOK → priority-check çağrılmaz).
 * readOnly (default true) = salt görüntüleme. readOnly=false (C2b-manuel) = YALNIZ güvenli manuel
 * aksiyonlar (oluştur / gönder / PTT sonucu / MERNİS). UETS/KEP elektronik gönderim + mock sorgu uçları
 * UI'ya BAĞLANMAZ (guardrail testiyle zorlanır). case/TebligatPanel ve (ölü) CaseDetailTabs'a DOKUNULMAZ.
 */
export function TebligatCard({ caseId, readOnly = true }: { caseId: string; readOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2"
      >
        <div className="text-left">
          <h4 className="text-[11px] font-semibold text-gray-700">Tebligat</h4>
          <p className="text-[9px] text-gray-400">
            {readOnly
              ? "Dosya tebligatları ve durumları. Salt görüntüleme."
              : "Dosya tebligatları — manuel işlemler (oluştur / gönder / PTT sonucu / MERNİS)."}
          </p>
        </div>
        <span className="text-[10px] text-blue-600 whitespace-nowrap">{open ? "▲ Gizle" : "▼ Göster"}</span>
      </button>
      {open && (
        <div className="mt-2">
          <TebligatPanel caseId={caseId} readOnly={readOnly} />
        </div>
      )}
    </div>
  );
}
