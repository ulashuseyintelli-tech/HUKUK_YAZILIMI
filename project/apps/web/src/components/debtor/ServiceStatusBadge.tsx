"use client";

import { ServiceStatus } from "@/lib/api";
import {
  AlertTriangle,
  FileText,
  Send,
  CheckCircle,
  RotateCcw,
  Home,
  Megaphone,
  XCircle,
  HelpCircle,
  Clock,
  ShieldCheck
} from "lucide-react";

interface ServiceStatusBadgeProps {
  status: ServiceStatus;
  /** Pre-computed label with date from backend, e.g. "Tebliğ Edildi — 12.01.2026" */
  serviceLabel?: string;
  size?: "sm" | "md";
  /**
   * ⚠️ LEGACY COMPATIBILITY ALANI — değiştirilmez. GERÇEK bir kesinleşme olgusu DEĞİLDİR
   * (yalnız tebliğ + sabit 7 gün tahmini). Owner kararı (2026-07-14, "PR-4 final scope"):
   * `finalizationEligibilitySource` CANONICAL ise (flag açık) bu alan "FINALIZED"/"Kesinleşti"
   * geçişini TETİKLEMEZ — yalnız LEGACY (flag kapalı, backward-compat) durumunda mevcut
   * gösterim için kullanılır.
   */
  finalizationDate?: string;
  /**
   * MPB-028(a) PR-4: kanonik süre motorundan gelen READ-ONLY PROJECTION tarihi — GERÇEK bir
   * kesinleşme olgusu DEĞİLDİR, `finalizationDate` İLE KARIŞTIRILMAZ. Bu prop yalnızca
   * tooltip'e ek, nötr bir bilgi eklemek için kullanılır; ASLA "Kesinleşti"/"FINALIZED"
   * durumuna geçiş TETİKLEMEZ (owner: "yalnız eligibility hesabına dayanarak 'Kesinleşti'
   * gösterme").
   */
  finalizationRequestEligibleDate?: string;
  finalizationEligibilitySource?: "LEGACY" | "CANONICAL" | "UNRESOLVED";
}

const statusConfig: Record<ServiceStatus, {
  icon: typeof AlertTriangle;
  bg: string;
  text: string;
  border: string;
  defaultLabel: string;
}> = {
  // 🔴 Kırmızı - Acil eksik
  NOT_STARTED: { icon: AlertTriangle, bg: "bg-red-50", text: "text-red-600", border: "border-red-200", defaultLabel: "Tebligat Başlatılmadı" },
  // 🔵 Mavi - Hazır
  READY: { icon: FileText, bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200", defaultLabel: "Hazırlandı" },
  // 🟠 Turuncu - Takip et
  SENT: { icon: Send, bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-200", defaultLabel: "Gönderildi" },
  // 🟡 Sarı - Süre akıyor (kesinleşmedi)
  DELIVERED: { icon: Clock, bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200", defaultLabel: "Tebliğ Edildi" },
  // 🟣 Mor - Yeniden aksiyon gerekli
  RETURNED: { icon: RotateCcw, bg: "bg-purple-50", text: "text-purple-600", border: "border-purple-200", defaultLabel: "İade" },
  // 🟡 Sarı - Süre akıyor
  MUHTAR: { icon: Home, bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200", defaultLabel: "Muhtara Teslim" },
  // 🟡 Sarı - Süre akıyor
  ANNOUNCEMENT: { icon: Megaphone, bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200", defaultLabel: "İlan Yoluyla" },
  // 🔴 Kırmızı - Başarısız
  FAILED: { icon: XCircle, bg: "bg-red-50", text: "text-red-600", border: "border-red-200", defaultLabel: "Başarısız" },
  // ⚪ Gri - Bilinmiyor
  UNKNOWN: { icon: HelpCircle, bg: "bg-gray-50", text: "text-gray-500", border: "border-gray-200", defaultLabel: "Bilinmiyor" },
  // 🟢 Yeşil - Kesinleşti (güvenli)
  FINALIZED: { icon: ShieldCheck, bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200", defaultLabel: "Kesinleşti" },
};

export function ServiceStatusBadge({
  status,
  serviceLabel,
  size = "sm",
  finalizationDate,
  finalizationRequestEligibleDate,
  finalizationEligibilitySource,
}: ServiceStatusBadgeProps) {
  // MPB-028(a) PR-4 (owner kararı, 2026-07-14): "Kesinleşti" hükmü YALNIZ flag kapalıyken
  // (LEGACY, backward-compat) `finalizationDate`'e dayanarak üretilir. Flag açıkken
  // (finalizationEligibilitySource CANONICAL/UNRESOLVED), itiraz/durdurucu-etki fact'i henüz
  // kanonik olarak modellenmediği için `finalizationDate` (eski bir tahmin) ARTIK "Kesinleşti"
  // hükmü üretmek için KULLANILMAZ — sistem bunu bilerek UNRESOLVED/nötr bırakır.
  const isFlagOn = finalizationEligibilitySource !== undefined && finalizationEligibilitySource !== "LEGACY";

  let effectiveStatus = status;
  let effectiveLabel = serviceLabel;

  if (
    !isFlagOn &&
    (status === "DELIVERED" || status === "MUHTAR" || status === "ANNOUNCEMENT") &&
    finalizationDate
  ) {
    const finDate = new Date(finalizationDate);
    const now = new Date();
    if (finDate <= now) {
      effectiveStatus = "FINALIZED" as ServiceStatus;
      effectiveLabel = `Kesinleşti — ${finDate.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })}`;
    }
  }

  const config = statusConfig[effectiveStatus] || statusConfig.UNKNOWN;
  const Icon = config.icon;

  // Use serviceLabel if provided (includes date), otherwise use default
  const label = effectiveLabel || config.defaultLabel;

  const sizeClasses = size === "sm"
    ? "px-2 py-0.5 text-[10px] gap-1"
    : "px-2.5 py-1 text-xs gap-1.5";

  const iconSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";

  // Tooltip: flag kapalıyken (LEGACY) mevcut davranış; flag açıkken (CANONICAL/UNRESOLVED)
  // ASLA "Kesinleşti" ifadesi kullanılmaz, yalnız nötr bir projeksiyon tarihi bağlamı
  // gösterilir.
  let tooltip = label;
  if (!isFlagOn && status === "DELIVERED" && finalizationDate) {
    const finDate = new Date(finalizationDate);
    const now = new Date();
    const daysLeft = Math.ceil((finDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft > 0) {
      tooltip = `${label}\nKesinleşme: ${finDate.toLocaleDateString("tr-TR")}\nKalan: ${daysLeft} gün`;
    }
  } else if (
    status === "DELIVERED" &&
    finalizationEligibilitySource === "CANONICAL" &&
    finalizationRequestEligibleDate
  ) {
    const eligibleDate = new Date(finalizationRequestEligibleDate);
    const now = new Date();
    const daysLeft = Math.ceil((eligibleDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    tooltip =
      daysLeft > 0
        ? `${label}\nKesinleştirme talebine ${daysLeft} gün`
        : `${label}\nKesinleştirme talebi için uygun tarih: ${eligibleDate.toLocaleDateString("tr-TR")}`;
  } else if (status === "DELIVERED" && finalizationEligibilitySource === "UNRESOLVED") {
    // MPB-028(a) PR-4: fail-closed — tahmini bir tarih göstermek yerine durumu şeffaf belirt.
    tooltip = `${label}\nKesinleştirme talebi için uygunluk hesaplanamadı`;
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium whitespace-nowrap ${config.bg} ${config.text} ${config.border} ${sizeClasses}`}
      title={tooltip}
    >
      <Icon className={`${iconSize} flex-shrink-0`} />
      <span className="truncate max-w-[140px]">{label}</span>
    </span>
  );
}
