"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// M2-G3b: Dosya detayında "Dosya Sorumlusu" seçici. Aday listesi (G2) + mevcut (G3b GET) okur,
// seçimde PATCH (G3a) ile gerçek kişiye yazar. case.service.ts'e dokunmaz.

interface Candidate {
  type: "LAWYER" | "STAFF";
  id: string;
  displayName: string;
  subtitle: string;
}

interface CurrentPerson {
  type: "LAWYER" | "STAFF" | "LEGACY_USER";
  id: string;
  displayName: string;
  subtitle: string;
  isLegacy: boolean;
}

export function ResponsiblePersonPicker({
  caseId,
  onChanged,
}: {
  caseId: string;
  onChanged?: () => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [current, setCurrent] = useState<CurrentPerson | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [candRes, curRes] = await Promise.all([
        api.get<{ data: Candidate[] }>("/cases/responsible-candidates"),
        api.get<CurrentPerson | null>(`/cases/${caseId}/responsible-person`),
      ]);
      setCandidates(candRes?.data?.data ?? []);
      setCurrent(curRes?.data ?? null);
    } catch {
      // aday/mevcut yüklenemezse sessizce boş bırak
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const handleSelect = async (value: string) => {
    if (!value) return;
    const [type, id] = value.split(":");
    setSaving(true);
    setError(null);
    try {
      const body =
        type === "LAWYER" ? { responsibleLawyerId: id } : { responsibleStaffId: id };
      await api.patch(`/cases/${caseId}/responsible-person`, body);
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e?.message || "Atama başarısız oldu.");
    } finally {
      setSaving(false);
    }
  };

  const lawyers = candidates.filter((c) => c.type === "LAWYER");
  const staff = candidates.filter((c) => c.type === "STAFF");
  // Mevcut gerçek kişiyse select onu seçili gösterir; legacy/none ise placeholder.
  const selectedValue =
    current && !current.isLegacy ? `${current.type}:${current.id}` : "";

  return (
    <div className="px-2 py-1.5 bg-indigo-50/60">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-semibold text-indigo-600 uppercase">
          Dosya Sorumlusu
        </span>
        {current ? (
          <span
            className="font-medium text-[11px] text-indigo-900 truncate"
            title={`${current.displayName} · ${current.subtitle}`}
          >
            {current.displayName}
            {current.isLegacy && (
              <span className="ml-1 text-[8px] text-amber-600">(eski)</span>
            )}
          </span>
        ) : (
          <span className="text-[10px] text-gray-400">Atanmamış</span>
        )}
      </div>
      <select
        aria-label="Dosya Sorumlusu seç"
        aria-invalid={!!error}
        className={`mt-1 w-full rounded border bg-white px-1.5 py-1 text-[10px] outline-none disabled:opacity-60 ${
          error
            ? "border-red-400 focus:border-red-500"
            : "border-indigo-200 focus:border-indigo-500"
        }`}
        value={selectedValue}
        disabled={loading || saving}
        onChange={(e) => handleSelect(e.target.value)}
      >
        <option value="">
          {loading
            ? "Yükleniyor…"
            : current?.isLegacy
              ? `${current.displayName} (eski — gerçek kişi seç)`
              : "Sorumlu seç…"}
        </option>
        {lawyers.length > 0 && (
          <optgroup label="Avukatlar">
            {lawyers.map((c) => (
              <option key={c.id} value={`LAWYER:${c.id}`}>
                {c.displayName} · {c.subtitle}
              </option>
            ))}
          </optgroup>
        )}
        {staff.length > 0 && (
          <optgroup label="Personel">
            {staff.map((c) => (
              <option key={c.id} value={`STAFF:${c.id}`}>
                {c.displayName} · {c.subtitle}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {saving && (
        <span className="mt-1 block text-[10px] font-medium text-indigo-600">
          Kaydediliyor…
        </span>
      )}
      {error && (
        <div
          role="alert"
          className="mt-1 flex items-start gap-1 rounded border border-red-300 bg-red-50 px-1.5 py-1 text-[10px] font-medium leading-tight text-red-700"
        >
          <span aria-hidden="true">⚠</span>
          <span>
            <span className="font-semibold">Kaydedilemedi.</span> Seçim uygulanmadı —
            tekrar deneyin. <span className="font-normal text-red-600">({error})</span>
          </span>
        </div>
      )}
    </div>
  );
}
