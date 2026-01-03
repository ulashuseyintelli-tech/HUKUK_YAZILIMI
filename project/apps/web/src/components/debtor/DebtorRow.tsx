"use client";

import { DebtorListItemDTO, DebtorRoleLabels } from "@/lib/api";
import { ServiceStatusBadge } from "./ServiceStatusBadge";
import { AlertBadge } from "./AlertBadge";
import { Building2, User, ChevronRight, Car, Home, Landmark, Briefcase, Calendar } from "lucide-react";

interface DebtorRowProps {
  debtor: DebtorListItemDTO;
  onClick?: () => void;
}

export function DebtorRow({ debtor, onClick }: DebtorRowProps) {
  const PersonIcon = debtor.personType === "LEGAL" ? Building2 : User;

  // Asset flags - only show if we have data
  const hasAssetData = debtor.assets && (
    debtor.assets.vehicle !== "UNKNOWN" ||
    debtor.assets.realEstate !== "UNKNOWN" ||
    debtor.assets.bank !== "UNKNOWN" ||
    debtor.assets.sgkWage !== "UNKNOWN"
  );

  // Format delivery date
  const formattedDeliveryDate = debtor.deliveredAt 
    ? new Date(debtor.deliveredAt).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors text-left group"
    >
      {/* Person type icon */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5 ${
        debtor.personType === "LEGAL" ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-600"
      }`}>
        <PersonIcon className="w-4 h-4" />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Top row: Name + Role */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-[12px] text-slate-900 truncate">{debtor.displayName}</span>
          <span className="flex-shrink-0 px-1.5 py-0.5 text-[9px] font-medium rounded bg-slate-100 text-slate-600">
            {DebtorRoleLabels[debtor.role] || debtor.role}
          </span>
        </div>

        {/* Middle row: Identity + Address */}
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
          {debtor.identityMasked && (
            <span>{debtor.identityMasked}</span>
          )}
          {debtor.identityMasked && debtor.addressShort && (
            <span className="text-slate-300">•</span>
          )}
          {debtor.addressShort && (
            <span className="truncate">{debtor.addressShort}</span>
          )}
        </div>

        {/* TEBLİĞ TARİHİ - Kritik bilgi, belirgin göster */}
        {formattedDeliveryDate && (
          <div className="flex items-center gap-1 mt-1 px-1.5 py-0.5 bg-green-100 rounded text-[10px] text-green-700 font-medium w-fit">
            <Calendar className="w-3 h-3" />
            Tebliğ: {formattedDeliveryDate}
          </div>
        )}

        {/* Bottom row: Asset flags (if available and no delivery date shown) */}
        {hasAssetData && !formattedDeliveryDate && (
          <div className="flex items-center gap-2 mt-1 text-[9px]">
            {debtor.assets.vehicle !== "UNKNOWN" && (
              <span className={`flex items-center gap-0.5 ${debtor.assets.vehicle === "YES" ? "text-emerald-600" : "text-slate-400"}`}>
                <Car className="w-3 h-3" />
                {debtor.assets.vehicle === "YES" ? "Var" : "Yok"}
              </span>
            )}
            {debtor.assets.realEstate !== "UNKNOWN" && (
              <span className={`flex items-center gap-0.5 ${debtor.assets.realEstate === "YES" ? "text-emerald-600" : "text-slate-400"}`}>
                <Home className="w-3 h-3" />
                {debtor.assets.realEstate === "YES" ? "Var" : "Yok"}
              </span>
            )}
            {debtor.assets.bank !== "UNKNOWN" && (
              <span className={`flex items-center gap-0.5 ${debtor.assets.bank === "YES" ? "text-emerald-600" : "text-slate-400"}`}>
                <Landmark className="w-3 h-3" />
                {debtor.assets.bank === "YES" ? "Var" : "Yok"}
              </span>
            )}
            {debtor.assets.sgkWage !== "UNKNOWN" && (
              <span className={`flex items-center gap-0.5 ${debtor.assets.sgkWage === "YES" ? "text-emerald-600" : "text-slate-400"}`}>
                <Briefcase className="w-3 h-3" />
                {debtor.assets.sgkWage === "YES" ? "Var" : "Yok"}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right side: Service status + Alert */}
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        {/* Service status badge with label (includes date if delivered) */}
        <ServiceStatusBadge 
          status={debtor.serviceStatus} 
          serviceLabel={debtor.serviceLabel}
          size="sm" 
        />

        {/* Alert badge - shows issue count with tooltip */}
        <AlertBadge 
          alertCount={debtor.alertCount} 
          alertLevel={debtor.alertLevel}
          issues={debtor.issues}
        />
      </div>

      {/* Chevron */}
      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors flex-shrink-0 mt-2" />
    </button>
  );
}
