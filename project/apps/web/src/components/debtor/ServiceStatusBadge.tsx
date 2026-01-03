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
  HelpCircle
} from "lucide-react";

interface ServiceStatusBadgeProps {
  status: ServiceStatus;
  /** Pre-computed label with date from backend, e.g. "Tebliğ Edildi — 12.01.2026" */
  serviceLabel?: string;
  size?: "sm" | "md";
}

const statusConfig: Record<ServiceStatus, { 
  icon: typeof AlertTriangle; 
  bg: string; 
  text: string; 
  border: string;
  defaultLabel: string;
}> = {
  NOT_STARTED: { icon: AlertTriangle, bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200", defaultLabel: "Tebligat Başlatılmadı" },
  READY: { icon: FileText, bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200", defaultLabel: "Hazırlandı" },
  SENT: { icon: Send, bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200", defaultLabel: "Gönderildi" },
  DELIVERED: { icon: CheckCircle, bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200", defaultLabel: "Tebliğ Edildi" },
  RETURNED: { icon: RotateCcw, bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-200", defaultLabel: "İade" },
  MUHTAR: { icon: Home, bg: "bg-purple-50", text: "text-purple-600", border: "border-purple-200", defaultLabel: "Muhtara" },
  ANNOUNCEMENT: { icon: Megaphone, bg: "bg-indigo-50", text: "text-indigo-600", border: "border-indigo-200", defaultLabel: "İlan" },
  FAILED: { icon: XCircle, bg: "bg-red-50", text: "text-red-600", border: "border-red-200", defaultLabel: "Başarısız" },
  UNKNOWN: { icon: HelpCircle, bg: "bg-gray-50", text: "text-gray-500", border: "border-gray-200", defaultLabel: "Bilinmiyor" },
};

export function ServiceStatusBadge({ status, serviceLabel, size = "sm" }: ServiceStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.UNKNOWN;
  const Icon = config.icon;
  
  // Use serviceLabel if provided (includes date), otherwise use default
  const label = serviceLabel || config.defaultLabel;
  
  const sizeClasses = size === "sm" 
    ? "px-2 py-0.5 text-[10px] gap-1" 
    : "px-2.5 py-1 text-xs gap-1.5";
  
  const iconSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";

  return (
    <span 
      className={`inline-flex items-center rounded-full border font-medium whitespace-nowrap ${config.bg} ${config.text} ${config.border} ${sizeClasses}`}
      title={label}
    >
      <Icon className={`${iconSize} flex-shrink-0`} />
      <span className="truncate max-w-[140px]">{label}</span>
    </span>
  );
}
