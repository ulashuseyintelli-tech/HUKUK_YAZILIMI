// P4-3 (A1-V1b) — clientMatch UI rozeti. SADECE GÖSTERİM: müvekkilin instrument'taki konumunu yüzeyler.
// Karar/guard YOK (borçlu önerisini engellemez = K8 ayrı iş). P4-2 computeClientMatch sonucunu çizer.
//
// 4 durum: bulundu@Ciro/Lehtar (yeşil) · keşideci tarafında (amber ters-yön) · bulunamadı (amber yumuşak) · seçili-değil (nötr).

"use client";

import { CheckCircle, AlertTriangle } from "lucide-react";
import type { ClientMatchResult } from "@/lib/client-match";

const LOCATION_LABEL: Record<string, string> = {
  ENDORSEMENT: "Ciro",
  FRONT_PAYEE: "Lehtar",
};

export function ClientMatchBadge({ result }: { result: ClientMatchResult | null }) {
  // Müvekkil seçili değil / değerlendirilmedi → nötr (badge yok, sadece tire).
  if (!result || result.allMatches.length === 0) {
    return (
      <span data-testid="client-match-badge" data-state="none" className="text-slate-300 text-[10px]">
        —
      </span>
    );
  }

  const m = result.primaryMatch;

  // Müvekkil(ler) var ama hiçbiri belgede eşleşmedi → yumuşak uyarı (K8; blok DEĞİL).
  if (!m) {
    return (
      <span
        data-testid="client-match-badge"
        data-state="not-found"
        title="Müvekkil belgede bulunamadı — kontrol edin (öneri, blok değil)"
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700 border border-amber-200"
      >
        <AlertTriangle className="h-3 w-3" /> Yok
      </span>
    );
  }

  // Müvekkil KEŞİDECİ (borçlu) tarafında görünüyor → ters-yön riski (amber).
  if (m.location === "FRONT_DRAWER") {
    return (
      <span
        data-testid="client-match-badge"
        data-state="front-drawer"
        title={`Müvekkil (${m.client.name}) KEŞİDECİ tarafında görünüyor — ters-yön riski, kontrol edin`}
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700 border border-amber-200"
      >
        <AlertTriangle className="h-3 w-3" /> Keşideci
      </span>
    );
  }

  // Bulundu: ENDORSEMENT→Ciro / FRONT_PAYEE→Lehtar (yeşil).
  const label = LOCATION_LABEL[m.location] ?? "Bulundu";
  return (
    <span
      data-testid="client-match-badge"
      data-state="found"
      title={`Müvekkil (${m.client.name}) ${label.toLowerCase()} tarafında bulundu · ${m.matchType}`}
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200"
    >
      <CheckCircle className="h-3 w-3" /> {label}
    </span>
  );
}
