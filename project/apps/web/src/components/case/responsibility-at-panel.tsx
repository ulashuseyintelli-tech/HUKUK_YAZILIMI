"use client";

// WP-1d-4a: Case detail "Sorumluluk Geçmişi" paneli (READ-ONLY).
// Mevcut endpoint: GET /cases/:id/responsibility-at?asOf=. Mutasyon / atama / devir / timeline YOK.
// İsim çözümü best-effort (responsible-candidates + users); çözülemezse dürüst fallback gösterilir.

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  type CombinedResponsibilityResult,
  RESPONSIBILITY_FIELD_LABELS as L,
  confidenceLabel,
  confidenceTooltip,
  confidenceBadgeClass,
  localInputToIso,
} from "@/lib/responsibility-at";

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR");
}

const TYPE_LABEL: Record<string, string> = { LAWYER: "Avukat", STAFF: "Personel" };

export function ResponsibilityAtPanel({
  caseId,
  reloadToken,
  asOfResetToken,
}: {
  caseId: string;
  reloadToken?: number;
  asOfResetToken?: number;
}) {
  const [asOfLocal, setAsOfLocal] = useState<string>(nowLocalInput());
  const [data, setData] = useState<CombinedResponsibilityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidateMap, setCandidateMap] = useState<Record<string, string>>({});
  const [userMap, setUserMap] = useState<Record<string, string>>({});

  // İsim çözüm tabloları (best-effort; hata panel'i bozmaz).
  useEffect(() => {
    let active = true;
    api
      .get<{ data: { type: string; id: string; displayName: string }[] }>("/cases/responsible-candidates")
      .then((res) => {
        if (!active) return;
        const map: Record<string, string> = {};
        for (const c of res?.data?.data ?? []) map[c.id] = c.displayName;
        setCandidateMap(map);
      })
      .catch(() => {});
    api
      .get<{ data: { id: string; name: string; surname: string }[] }>("/users")
      .then((res) => {
        if (!active) return;
        const map: Record<string, string> = {};
        for (const u of res?.data?.data ?? []) map[u.id] = `${u.name} ${u.surname}`.trim();
        setUserMap(map);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // WP-1d-5-6: mutasyon (hukuki sorumlu / operasyon sorumlusu değişikliği) sonrası point-in-time görünümünü
  // "şimdi"ye çek. Aksi halde panel eski asOf'ta kalıp yeni yapılan değişikliği gizler (backend asOf<=now filtreler).
  useEffect(() => {
    if (asOfResetToken && asOfResetToken > 0) {
      setAsOfLocal(nowLocalInput());
    }
  }, [asOfResetToken]);

  // asOf değişince (mount dahil) yeniden çek.
  useEffect(() => {
    let active = true;
    const iso = localInputToIso(asOfLocal) ?? undefined;
    setLoading(true);
    setError(null);
    api
      .getCaseResponsibilityAt(caseId, iso)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((e: any) => {
        if (active) setError(e?.message || "Sorumluluk bilgisi alınamadı.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // reloadToken: dış mutasyon (hukuki sorumlu değişikliği) sonrası yeniden çek.
  }, [caseId, asOfLocal, reloadToken]);

  // İsim DÜRÜSTÇE confidence-first çözülür: UNKNOWN_BEFORE_HORIZON'da "Atanmamış"/"—" gösterilemez
  // (atanmış olabilir, bilmiyoruz). NONE (gerçekten atanmamış) ile UNKNOWN (bilinemez) ayrı tutulur.
  const ownerName = (() => {
    if (!data) return "—";
    const o = data.operationOwner;
    if (o.confidence === "UNKNOWN_BEFORE_HORIZON") return "Bu tarih için kesin kayıt yok";
    if (o.type === "NONE") return "Atanmamış";
    if (o.id && candidateMap[o.id]) return candidateMap[o.id];
    if (o.type === "LAWYER" || o.type === "STAFF") return `${TYPE_LABEL[o.type]} (kayıt)`;
    return "Bilinmiyor";
  })();

  const lawyerName = (() => {
    if (!data) return "—";
    const l = data.legalResponsibleLawyer;
    if (l.confidence === "UNKNOWN_BEFORE_HORIZON") return "Bu tarih için kesin kayıt yok";
    if (!l.lawyerId) return "Atanmamış";
    return candidateMap[l.lawyerId] ?? "Avukat (kayıt)";
  })();

  const changedByName = (uid?: string | null): string => {
    if (!uid) return "—";
    return userMap[uid] ?? "Kullanıcı kaydı";
  };

  const Block = ({
    label,
    person,
    confidence,
    effectiveAt,
    changedByUserId,
  }: {
    label: string;
    person: string;
    confidence?: string;
    effectiveAt?: string;
    changedByUserId?: string | null;
  }) => (
    <div className="rounded-md border border-gray-100 p-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-gray-500 uppercase">{label}</span>
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${confidenceBadgeClass(confidence)}`}
          title={confidenceTooltip(confidence)}
        >
          {confidenceLabel(confidence)}
        </span>
      </div>
      <div className="text-[12px] font-medium text-gray-800">{person}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-500">
        <span>{L.effectiveAt}: {formatDateTime(effectiveAt)}</span>
        <span>{L.changedByUser}: {changedByName(changedByUserId)}</span>
      </div>
      {confidenceTooltip(confidence) && (
        <div className="text-[9px] text-gray-400">Kaynak: {confidenceTooltip(confidence)}</div>
      )}
    </div>
  );

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="px-2 py-1 bg-slate-50 border-b border-slate-100">
        <span className="font-semibold text-slate-800 text-[11px]">Sorumluluk Geçmişi</span>
        <p className="text-[9px] text-slate-500">
          Seçilen tarihte dosyanın operasyon sorumlusu ve hukuki sorumlu avukatı.
        </p>
      </div>
      <div className="p-2 space-y-2">
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5" htmlFor="responsibility-asof">
            Tarih / saat
          </label>
          <input
            id="responsibility-asof"
            aria-label="Sorumluluk tarihi"
            type="datetime-local"
            value={asOfLocal}
            onChange={(e) => setAsOfLocal(e.target.value)}
            className="w-full rounded border px-2 py-1 text-xs outline-none focus:border-primary"
          />
        </div>

        {loading && <div className="text-[11px] text-gray-400 py-2">Yükleniyor…</div>}

        {!loading && error && (
          <div className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded p-2">{error}</div>
        )}

        {!loading && !error && data && (
          <div className="space-y-2">
            <Block
              label={L.operationOwner}
              person={ownerName}
              confidence={data.operationOwner.confidence}
              effectiveAt={data.operationOwner.effectiveAt}
              changedByUserId={data.operationOwner.changedByUserId}
            />
            <Block
              label={L.legalResponsibleLawyer}
              person={lawyerName}
              confidence={data.legalResponsibleLawyer.confidence}
              effectiveAt={data.legalResponsibleLawyer.effectiveAt}
              changedByUserId={data.legalResponsibleLawyer.changedByUserId}
            />
            {data.horizon?.note && (
              <p className="text-[9px] text-gray-400">{data.horizon.note}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
