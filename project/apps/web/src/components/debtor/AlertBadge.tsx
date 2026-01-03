"use client";

import { AlertLevel, DebtorIssue } from "@/lib/api";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import { useState } from "react";

interface AlertBadgeProps {
  alertCount: number;
  alertLevel: AlertLevel;
  issues?: DebtorIssue[];
}

const levelConfig: Record<AlertLevel, { 
  icon: typeof AlertTriangle; 
  bg: string; 
  text: string;
  hoverBg: string;
}> = {
  NONE: { icon: Info, bg: "bg-slate-100", text: "text-slate-500", hoverBg: "hover:bg-slate-200" },
  INFO: { icon: Info, bg: "bg-blue-100", text: "text-blue-600", hoverBg: "hover:bg-blue-200" },
  WARN: { icon: AlertCircle, bg: "bg-amber-100", text: "text-amber-600", hoverBg: "hover:bg-amber-200" },
  DANGER: { icon: AlertTriangle, bg: "bg-red-100", text: "text-red-600", hoverBg: "hover:bg-red-200" },
};

export function AlertBadge({ alertCount, alertLevel, issues }: AlertBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  
  if (alertCount === 0 || alertLevel === "NONE") return null;

  const config = levelConfig[alertLevel];
  const Icon = config.icon;

  return (
    <div className="relative">
      <div
        role="button"
        tabIndex={0}
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${config.bg} ${config.text} ${config.hoverBg} transition-colors cursor-pointer`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={(e) => {
          e.stopPropagation();
          setShowTooltip(!showTooltip);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            setShowTooltip(!showTooltip);
          }
        }}
      >
        {alertCount}
      </div>
      
      {showTooltip && issues && issues.length > 0 && (
        <div className="absolute right-0 top-full mt-1 z-50 w-56 p-2 bg-white rounded-lg shadow-lg border border-slate-200">
          <div className="text-xs font-medium text-slate-500 mb-1.5 px-1">Eksik / Uyarılar</div>
          <ul className="space-y-1">
            {issues.map((issue, idx) => {
              const issueConfig = levelConfig[issue.level];
              const IssueIcon = issueConfig.icon;
              return (
                <li 
                  key={idx} 
                  className={`flex items-start gap-1.5 text-xs px-1 py-0.5 rounded ${issueConfig.bg} ${issueConfig.text}`}
                >
                  <IssueIcon className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{issue.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
