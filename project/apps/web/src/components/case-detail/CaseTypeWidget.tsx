"use client";

import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";

interface CaseTypeWidgetProps {
  type: string;
  subType?: string;
  executionPath: string;
  subCategory?: string;
}

export function CaseTypeWidget({ type, subType, executionPath, subCategory }: CaseTypeWidgetProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors text-sm"
      >
        <FileText className="w-4 h-4 text-blue-600" />
        <span className="font-medium text-blue-700">{type}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-blue-500 transition-transform ${showDetails ? "rotate-180" : ""}`} />
      </button>

      {showDetails && (
        <div className="absolute top-full right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-slate-200 p-3 z-20">
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-slate-500">Takip Türü:</span>
              <span className="ml-2 font-medium text-slate-700">{type}</span>
            </div>
            {subType && (
              <div>
                <span className="text-slate-500">Alt Tip:</span>
                <span className="ml-2 font-medium text-slate-700">{subType}</span>
              </div>
            )}
            <div>
              <span className="text-slate-500">Yol:</span>
              <span className="ml-2 font-medium text-slate-700">{executionPath}</span>
            </div>
            {subCategory && (
              <div>
                <span className="text-slate-500">Alt Kategori:</span>
                <span className="ml-2 font-medium text-slate-700">{subCategory}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
