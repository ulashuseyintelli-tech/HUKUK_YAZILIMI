"use client";

import { DebtorListItemDTO, DebtorRoleLabels, AddressResearchStatus } from "@/lib/api";
import { ServiceStatusBadge } from "./ServiceStatusBadge";
import { AlertBadge } from "./AlertBadge";
import { Building2, User, ChevronRight, FolderSync, Search, CheckCircle2, AlertTriangle } from "lucide-react";

interface DebtorRowProps {
  debtor: DebtorListItemDTO;
  onClick?: () => void;
}

export function DebtorRow({ debtor, onClick }: DebtorRowProps) {
  const PersonIcon = debtor.personType === "LEGAL" ? Building2 : User;

  // Research status indicator config
  const getResearchIndicator = (status?: AddressResearchStatus) => {
    switch (status) {
      case 'IN_PROGRESS':
        return { icon: Search, color: 'text-blue-500', title: 'Adres araştırması devam ediyor' };
      case 'COMPLETED':
        return { icon: CheckCircle2, color: 'text-green-500', title: 'Adres araştırması tamamlandı' };
      case 'EXHAUSTED':
        return { icon: AlertTriangle, color: 'text-orange-500', title: 'Adres kaynakları tükendi' };
      default:
        return null;
    }
  };

  const researchIndicator = getResearchIndicator(debtor.researchStatus);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className="w-full flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer group"
    >
      {/* Person type icon */}
      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
        debtor.personType === "LEGAL" ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-600"
      }`}>
        <PersonIcon className="w-3.5 h-3.5" />
      </div>

      {/* Name + Role */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-[13px] text-slate-900 truncate">{debtor.displayName}</span>
          <span className="flex-shrink-0 px-1.5 py-0.5 text-[9px] font-medium rounded bg-slate-100 text-slate-500">
            {DebtorRoleLabels[debtor.role] || debtor.role}
          </span>
          {/* Cross-file address indicator */}
          {debtor.hasDifferentAddressInOtherCase && (
            <span 
              className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-medium rounded bg-purple-100 text-purple-700"
              title="Bu borçlunun başka dosyalarda farklı adresi var"
            >
              <FolderSync className="w-3 h-3" />
              Farklı Adres
            </span>
          )}
          {/* Research status indicator */}
          {researchIndicator && (
            <span title={researchIndicator.title}>
              <researchIndicator.icon className={`w-3.5 h-3.5 ${researchIndicator.color}`} />
            </span>
          )}
        </div>
        {debtor.addressShort && (
          <div className="text-[10px] text-slate-400 truncate">{debtor.addressShort}</div>
        )}
      </div>

      {/* Service status badge - renk ile süreç yönetimi */}
      <ServiceStatusBadge 
        status={debtor.serviceStatus} 
        serviceLabel={debtor.serviceLabel}
        finalizationDate={debtor.finalizationDate}
        size="sm" 
      />

      {/* Alert badge */}
      <AlertBadge 
        alertCount={debtor.alertCount} 
        alertLevel={debtor.alertLevel}
        issues={debtor.issues}
      />

      {/* Chevron */}
      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
    </div>
  );
}
