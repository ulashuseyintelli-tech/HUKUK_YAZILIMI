"use client";

import { useState, useEffect } from "react";
import { ShieldAlert, AlertTriangle, User } from "lucide-react";
import { api, PreHacizRiskLevel } from "@/lib/api";
import { riskLabel, riskBadge } from "@/lib/haciz-audit-format";

/**
 * CASEDETAILTABS-MIGRATION-C3a: #116 haciz-öncesi istihbarat/risk sinyallerini canlı dosya detayına
 * SALT-OKUMA collapsible + lazy kart olarak yüzeyler. Kapalı gelir; YALNIZ açılınca PreHacizRiskPanel mount →
 * GET /validation-gate/:caseId/pre-haciz-intelligence (api.getPreHacizIntelligence).
 * UYAP gönderimi YAPMAZ · mutation YOK · status/history/submit YOK. UyapPanel ve (ölü) CaseDetailTabs'a DOKUNULMAZ.
 */
export function PreHacizRiskCard({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2"
      >
        <div className="text-left">
          <h4 className="text-[11px] font-semibold text-gray-700">Haciz Öncesi Risk Kontrolü</h4>
          <p className="text-[9px] text-gray-400">Haciz öncesi istihbarat ve risk sinyalleri. UYAP gönderimi yapmaz.</p>
        </div>
        <span className="text-[10px] text-blue-600 whitespace-nowrap">{open ? "▲ Gizle" : "▼ Göster"}</span>
      </button>
      {open && (
        <div className="mt-2">
          <PreHacizRiskPanel caseId={caseId} />
        </div>
      )}
    </div>
  );
}

type DebtorRisk = {
  debtorId: string;
  name: string;
  level: PreHacizRiskLevel;
  reasons: { id: string; message: string; severity: string }[];
};

// Salt-okuma risk gövdesi — yalnız getPreHacizIntelligence okur, yan etki/yazma YOK.
function PreHacizRiskPanel({ caseId }: { caseId: string }) {
  const [data, setData] = useState<{ debtors: DebtorRisk[]; overallLevel: PreHacizRiskLevel } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getPreHacizIntelligence(caseId)
      .then((r) => {
        if (alive) setData({ debtors: (r.debtors as DebtorRisk[]) || [], overallLevel: r.overallLevel || "YOK" });
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [caseId]);

  if (error) return <div className="text-sm text-gray-500 p-4">Risk bilgisi yüklenemedi.</div>;
  if (data === null) return <div className="text-sm text-gray-400 p-4">Yükleniyor…</div>;

  if (data.debtors.length === 0) {
    return (
      <div className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg p-6 text-center">
        Bu dosyada haciz öncesi risk sinyali yok.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <ShieldAlert className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-800">Haciz öncesi değerlendirme</span>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${riskBadge(data.overallLevel)}`}>
          Genel: {riskLabel(data.overallLevel)}
        </span>
      </div>
      <ul className="space-y-3">
        {data.debtors.map((d) => (
          <li key={d.debtorId} className="border-l-2 border-amber-300 pl-2">
            <div className="flex items-center gap-2 mb-1">
              <User className="w-3 h-3 text-gray-400" />
              <span className="text-sm font-medium text-gray-800">{d.name}</span>
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${riskBadge(d.level)}`}>
                {riskLabel(d.level)} risk
              </span>
            </div>
            <ul className="space-y-0.5">
              {d.reasons.map((r, i) => (
                <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                  <span>{r.message.split("\n").slice(1).join(" ").trim() || r.message}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-gray-400">Karar desteği amaçlıdır; haciz işlemini engellemez. UYAP gönderimi yapmaz.</p>
    </div>
  );
}
