"use client";

import { AlertTriangle, Info, Lightbulb, X, Zap, HelpCircle } from "lucide-react";
import { useState } from "react";

interface QuickFilterHelpText {
  title: string;
  effect: string;
  solution: string;
  tip?: string;
}

interface QuickFilterHelpBannerProps {
  filterId: string;
  filterLabel: string;
  count: number;
  helpText: QuickFilterHelpText;
  color: "default" | "warning" | "danger" | "success" | "info" | "purple";
  onClose?: () => void;
  onShowGuide?: () => void;
}

const colorClasses = {
  default: "bg-gray-50 border-gray-200 text-gray-800",
  warning: "bg-amber-50 border-amber-200 text-amber-900",
  danger: "bg-red-50 border-red-200 text-red-900",
  success: "bg-green-50 border-green-200 text-green-900",
  info: "bg-blue-50 border-blue-200 text-blue-900",
  purple: "bg-purple-50 border-purple-200 text-purple-900",
};

const iconColors = {
  default: "text-gray-500",
  warning: "text-amber-500",
  danger: "text-red-500",
  success: "text-green-500",
  info: "text-blue-500",
  purple: "text-purple-500",
};

export function QuickFilterHelpBanner({
  filterId,
  filterLabel,
  count,
  helpText,
  color,
  onClose,
  onShowGuide,
}: QuickFilterHelpBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const IconComponent = color === "danger" ? AlertTriangle : color === "warning" ? AlertTriangle : Info;

  return (
    <div className={`rounded-lg border p-3 mb-3 ${colorClasses[color]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <IconComponent className={`h-5 w-5 mt-0.5 flex-shrink-0 ${iconColors[color]}`} />
          
          <div className="flex-1 min-w-0">
            {/* Başlık ve Sayaç */}
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-sm">{helpText.title}</h3>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                color === "danger" ? "bg-red-100 text-red-700" :
                color === "warning" ? "bg-amber-100 text-amber-700" :
                color === "success" ? "bg-green-100 text-green-700" :
                "bg-gray-100 text-gray-700"
              }`}>
                {count} dosya
              </span>
            </div>
            
            {/* Etki */}
            <p className="text-sm opacity-90 mb-1">{helpText.effect}</p>
            
            {/* Çözüm */}
            <div className="flex items-start gap-1.5 text-sm">
              <Zap className="h-4 w-4 mt-0.5 flex-shrink-0 opacity-70" />
              <span><strong>Çözüm:</strong> {helpText.solution}</span>
            </div>
            
            {/* İpucu (varsa ve expanded ise) */}
            {helpText.tip && (
              <div className={`flex items-start gap-1.5 text-sm mt-1 ${isExpanded ? '' : 'hidden'}`}>
                <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0 opacity-70" />
                <span><strong>İpucu:</strong> {helpText.tip}</span>
              </div>
            )}
          </div>
        </div>
        
        {/* Sağ taraf aksiyonlar */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {helpText.tip && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs px-2 py-1 rounded hover:bg-black/5 transition-colors"
            >
              {isExpanded ? "Daha az" : "Daha fazla"}
            </button>
          )}
          
          {onShowGuide && (
            <button
              onClick={onShowGuide}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-black/5 transition-colors"
            >
              <HelpCircle className="h-3 w-3" />
              Rehber
            </button>
          )}
          
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-black/10 transition-colors"
              title="Kapat"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Eksiklik rozeti - liste satırlarında kullanılacak
interface MissingBadgeProps {
  label: string;
  color?: "warning" | "danger" | "info";
  onFix?: () => void;
}

export function MissingBadge({ label, color = "warning", onFix }: MissingBadgeProps) {
  const badgeColors = {
    warning: "bg-amber-100 text-amber-700 border-amber-200",
    danger: "bg-red-100 text-red-700 border-red-200",
    info: "bg-blue-100 text-blue-700 border-blue-200",
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border ${badgeColors[color]}`}>
      {label}
      {onFix && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFix();
          }}
          className="ml-1 p-0.5 rounded hover:bg-black/10 transition-colors"
          title="Düzelt"
        >
          <Zap className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
