// P4-3 / A1-c — clientMatch UI rozeti. SADECE GÖSTERİM: müvekkilin instrument'taki KONUMU + DURUMU.
// A1-c GÜVENLİ MOD: otomatik KESİN rol ATAMAZ; borçlu önerisini engellemez (gate = A1-a ayrı).
// Durumlar: none(—) · not-found(Yok, amber) · ANOMALY(keşideci ters-yön, kırmızı) ·
//           REVIEW(ciroda bulundu, pozisyon belirsiz, mavi) · VERIFY(olası lehtar, payee güvenilmez, amber).

"use client";

import { AlertTriangle, Eye } from "lucide-react";
import { clientRoleSignal, type ClientMatchResult } from "@/lib/client-match";

const STATUS_STYLE: Record<string, string> = {
  ANOMALY: "bg-red-50 text-red-700 border-red-200",
  REVIEW: "bg-sky-50 text-sky-700 border-sky-200",
  VERIFY: "bg-amber-50 text-amber-700 border-amber-200",
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

  // Müvekkil(ler) var ama hiçbiri belgede eşleşmedi → yumuşak uyarı (blok DEĞİL; A1-a clientAnchorWarning de devrede).
  if (!result.primaryMatch) {
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

  // A1-c: konum+durum SİNYALİ (ANOMALY/REVIEW/VERIFY) — kilitli güvenli-mod rol haritası; otomatik rol YOK.
  const sig = clientRoleSignal(result)!;
  const Icon = sig.status === "REVIEW" ? Eye : AlertTriangle;
  return (
    <span
      data-testid="client-match-badge"
      data-state={sig.status.toLowerCase()}
      data-location={sig.location}
      data-reliable={String(sig.reliable)}
      title={sig.message}
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] border ${STATUS_STYLE[sig.status]}`}
    >
      <Icon className="h-3 w-3" /> {sig.label}
    </span>
  );
}
