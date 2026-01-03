"use client";

import { AssetQueryStatus, AssetQueryStatusLabels } from "@/lib/api";
import { Car, Home, Landmark, Briefcase, HelpCircle, Check, X, Loader2, AlertCircle } from "lucide-react";

interface AssetFlagsProps {
  vehicle: AssetQueryStatus;
  realEstate: AssetQueryStatus;
  bank: AssetQueryStatus;
  sgkWage: AssetQueryStatus;
  lastQueryAt?: string | null;
  size?: "sm" | "md";
  showLabels?: boolean;
}

const statusConfig: Record<AssetQueryStatus, { color: string; bgColor: string; icon: typeof Check }> = {
  YES: { color: "text-emerald-600", bgColor: "bg-emerald-50", icon: Check },
  NO: { color: "text-red-500", bgColor: "bg-red-50", icon: X },
  UNKNOWN: { color: "text-slate-400", bgColor: "bg-slate-50", icon: HelpCircle },
  PENDING: { color: "text-blue-500", bgColor: "bg-blue-50", icon: Loader2 },
  ERROR: { color: "text-amber-500", bgColor: "bg-amber-50", icon: AlertCircle },
};

const assetIcons = {
  vehicle: Car,
  realEstate: Home,
  bank: Landmark,
  sgkWage: Briefcase,
};

const assetLabels = {
  vehicle: "Araç",
  realEstate: "Tapu",
  bank: "Banka",
  sgkWage: "Maaş",
};

export function AssetFlags({
  vehicle,
  realEstate,
  bank,
  sgkWage,
  lastQueryAt,
  size = "sm",
  showLabels = false,
}: AssetFlagsProps) {
  const assets = [
    { key: "vehicle", status: vehicle },
    { key: "realEstate", status: realEstate },
    { key: "bank", status: bank },
    { key: "sgkWage", status: sgkWage },
  ] as const;

  const iconSize = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  const containerSize = size === "sm" ? "w-5 h-5" : "w-6 h-6";

  return (
    <div className="flex items-center gap-1">
      {assets.map(({ key, status }) => {
        const config = statusConfig[status];
        const AssetIcon = assetIcons[key];
        const StatusIcon = config.icon;
        const label = assetLabels[key];

        return (
          <div
            key={key}
            className={`relative flex items-center justify-center ${containerSize} rounded ${config.bgColor} ${config.color}`}
            title={`${label}: ${AssetQueryStatusLabels[status]}`}
          >
            <AssetIcon className={iconSize} />
            {/* Status indicator dot */}
            <div className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
              status === "YES" ? "bg-emerald-500" :
              status === "NO" ? "bg-red-500" :
              status === "PENDING" ? "bg-blue-500" :
              status === "ERROR" ? "bg-amber-500" :
              "bg-slate-300"
            }`} />
          </div>
        );
      })}
      
      {showLabels && lastQueryAt && (
        <span className="text-[9px] text-slate-400 ml-1">
          {new Date(lastQueryAt).toLocaleDateString("tr-TR")}
        </span>
      )}
    </div>
  );
}

// Compact version for DebtorRow
export function AssetFlagsCompact({
  vehicle,
  realEstate,
  bank,
  sgkWage,
}: Pick<AssetFlagsProps, "vehicle" | "realEstate" | "bank" | "sgkWage">) {
  // Count how many assets are found
  const foundCount = [vehicle, realEstate, bank, sgkWage].filter(s => s === "YES").length;
  const unknownCount = [vehicle, realEstate, bank, sgkWage].filter(s => s === "UNKNOWN").length;
  const pendingCount = [vehicle, realEstate, bank, sgkWage].filter(s => s === "PENDING").length;

  // If all unknown, show nothing or minimal indicator
  if (unknownCount === 4) {
    return (
      <span className="text-[9px] text-slate-400" title="Malvarlığı sorgusu yapılmadı">
        —
      </span>
    );
  }

  // If any pending
  if (pendingCount > 0) {
    return (
      <span className="flex items-center gap-0.5 text-[9px] text-blue-500" title="Sorgu devam ediyor">
        <Loader2 className="w-3 h-3 animate-spin" />
        {pendingCount}
      </span>
    );
  }

  // Show found count
  return (
    <span 
      className={`text-[9px] font-medium ${foundCount > 0 ? "text-emerald-600" : "text-slate-400"}`}
      title={`${foundCount} malvarlığı bulundu`}
    >
      {foundCount > 0 ? `🎯 ${foundCount}` : "—"}
    </span>
  );
}
