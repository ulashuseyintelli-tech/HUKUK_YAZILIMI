"use client";

// WP-1d-4c-2: Case detail "Sorumluluk Değişim Geçmişi" timeline (READ-ONLY).
// Mevcut endpoint: GET /cases/:id/responsibility-history. Mutasyon/atama/devir YOK.
// Mevcut "Sorumluluk Geçmişi" (point-in-time) panelini DEĞİŞTİRMEZ; bu ayrı bir liste bölümüdür.

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { confidenceLabel, confidenceTooltip, confidenceBadgeClass } from "@/lib/responsibility-at";
import {
  type ResponsibilityHistoryResult,
  changeTypeLabel,
  formatParty,
} from "@/lib/responsibility-history";

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR");
}

export function ResponsibilityHistoryPanel({ caseId }: { caseId: string }) {
  const [includeInferred, setIncludeInferred] = useState(true);
  const [data, setData] = useState<ResponsibilityHistoryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nameById, setNameById] = useState<Record<string, string>>({});
  const [userById, setUserById] = useState<Record<string, string>>({});

  // İsim çözüm tabloları (best-effort; hata panel'i bozmaz).
  useEffect(() => {
    let active = true;
    api
      .get<{ data: { id: string; displayName: string }[] }>("/cases/responsible-candidates")
      .then((res) => {
        if (!active) return;
        const map: Record<string, string> = {};
        for (const c of res?.data?.data ?? []) map[c.id] = c.displayName;
        setNameById(map);
      })
      .catch(() => {});
    api
      .get<{ data: { id: string; name: string; surname: string }[] }>("/users")
      .then((res) => {
        if (!active) return;
        const map: Record<string, string> = {};
        for (const u of res?.data?.data ?? []) map[u.id] = `${u.name} ${u.surname}`.trim();
        setUserById(map);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // includeInferred değişince (mount dahil) yeniden çek.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getCaseResponsibilityHistory(caseId, { type: "all", includeInferred })
      .then((res) => {
        if (active) setData(res);
      })
      .catch((e: any) => {
        if (active) setError(e?.message || "Sorumluluk değişim geçmişi alınamadı.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [caseId, includeInferred]);

  const changedByName = (uid?: string | null): string => {
    if (!uid) return "—";
    return userById[uid] ?? "Kullanıcı kaydı";
  };

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="px-2 py-1 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
        <div>
          <span className="font-semibold text-slate-800 text-[11px]">Sorumluluk Değişim Geçmişi</span>
          <p className="text-[9px] text-slate-500">
            Dosya Operasyon Sorumlusu ve Hukuki Sorumlu Avukat değişiklikleri.
          </p>
        </div>
        <label className="flex items-center gap-1 text-[9px] text-slate-600 whitespace-nowrap">
          <input
            type="checkbox"
            checked={includeInferred}
            onChange={(e) => setIncludeInferred(e.target.checked)}
            aria-label="Çıkarımsal kayıtları göster"
            className="rounded border-gray-300"
          />
          Çıkarımsal kayıtları göster
        </label>
      </div>

      <div className="p-2 space-y-2">
        {loading && <div className="text-[11px] text-gray-400 py-2">Yükleniyor…</div>}

        {!loading && error && (
          <div className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded p-2">{error}</div>
        )}

        {!loading && !error && data && data.events.length === 0 && (
          <div className="text-[11px] text-gray-500 py-2">
            Bu dosya için sorumluluk değişim kaydı bulunamadı.
            {!includeInferred && (
              <p className="text-[10px] text-gray-400 mt-1">
                Çıkarımsal kayıtlar gizlendiği için bazı eski kayıtlar görünmeyebilir.
              </p>
            )}
          </div>
        )}

        {!loading && !error && data && data.events.length > 0 && (
          <ol className="space-y-2">
            {data.events.map((ev) => (
              <li key={ev.id} className="rounded-md border border-gray-100 p-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-gray-600 uppercase">{changeTypeLabel(ev.type)}</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${confidenceBadgeClass(ev.confidence)}`}
                    title={confidenceTooltip(ev.confidence)}
                  >
                    {confidenceLabel(ev.confidence)}
                  </span>
                </div>
                <div className="text-[12px] font-medium text-gray-800">
                  {formatParty(ev.oldValue, nameById)} <span className="text-gray-400">→</span> {formatParty(ev.newValue, nameById)}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-500">
                  <span>Geçerlilik Tarihi: {formatDateTime(ev.effectiveAt)}</span>
                  <span>Değiştiren Kullanıcı: {changedByName(ev.changedByUserId)}</span>
                </div>
                {ev.note && <div className="text-[9px] text-gray-400">Kaynak: {ev.note}</div>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
