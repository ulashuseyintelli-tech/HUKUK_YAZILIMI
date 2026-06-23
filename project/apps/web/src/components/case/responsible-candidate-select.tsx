"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// M2-G3c: Yeni takip wizard'ı için "create-mode" Dosya Sorumlusu seçici.
// Yalnız aday listesi (G2) + controlled değer; caseId/PATCH YOK (wizard create sonrası PATCH eder).

interface Candidate {
  type: "LAWYER" | "STAFF";
  id: string;
  displayName: string;
  subtitle: string;
}

export type ResponsibleSelection = { type: "LAWYER" | "STAFF"; id: string };

// create-then-PATCH gövdesi (G3a uç noktası bekler). Wizard submit'inde kullanılır + testlenir.
export function buildAssignBody(rp: ResponsibleSelection) {
  return rp.type === "LAWYER"
    ? { responsibleLawyerId: rp.id }
    : { responsibleStaffId: rp.id };
}

export function ResponsibleCandidateSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: ResponsibleSelection | null;
  onChange: (v: ResponsibleSelection | null) => void;
  disabled?: boolean;
  className?: string; // G5d-1: filtre çubuğu gibi farklı bağlamlarda stil override'ı
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .get<{ data: Candidate[] }>("/cases/responsible-candidates")
      .then((res) => {
        if (active) setCandidates(res?.data?.data ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const lawyers = candidates.filter((c) => c.type === "LAWYER");
  const staff = candidates.filter((c) => c.type === "STAFF");
  const selected = value ? `${value.type}:${value.id}` : "";

  return (
    <select
      name="responsiblePerson"
      aria-label="Dosya Operasyon Sorumlusu seç"
      value={selected}
      disabled={disabled || loading}
      onChange={(e) => {
        const v = e.target.value;
        if (!v) {
          onChange(null);
          return;
        }
        const [type, id] = v.split(":");
        onChange({ type: type as "LAWYER" | "STAFF", id });
      }}
      className={className ?? "w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-primary disabled:opacity-60"}
    >
      <option value="">{loading ? "Yükleniyor…" : "Seçiniz"}</option>
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
  );
}
