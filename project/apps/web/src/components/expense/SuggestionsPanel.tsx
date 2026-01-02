"use client";

import { useState } from "react";
import { AlertCircle, ChevronRight, X, Lightbulb, Package } from "lucide-react";

interface Suggestion {
  id: string;
  type: "expense" | "balance_low" | "stage_action";
  title: string;
  description: string;
  packageCode?: string;
  priority: "high" | "medium" | "low";
  ctaLabel: string;
  ctaAction: () => void;
}

interface SuggestionsPanelProps {
  suggestions: Suggestion[];
  onDismiss?: (id: string) => void;
}

export function SuggestionsPanel({ suggestions, onDismiss }: SuggestionsPanelProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visibleSuggestions = suggestions.filter((s) => !dismissed.has(s.id));

  if (visibleSuggestions.length === 0) return null;

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set([...prev, id]));
    onDismiss?.(id);
  };

  const getPriorityStyles = (priority: Suggestion["priority"]) => {
    switch (priority) {
      case "high":
        return "bg-red-50 border-red-200 text-red-800";
      case "medium":
        return "bg-amber-50 border-amber-200 text-amber-800";
      case "low":
        return "bg-blue-50 border-blue-200 text-blue-800";
    }
  };

  const getPriorityIcon = (priority: Suggestion["priority"]) => {
    switch (priority) {
      case "high":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "medium":
        return <Lightbulb className="h-4 w-4 text-amber-500" />;
      case "low":
        return <Package className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
        <Lightbulb className="h-3.5 w-3.5" />
        Öneriler
      </h4>
      <div className="space-y-2">
        {visibleSuggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className={`rounded-lg border p-3 ${getPriorityStyles(suggestion.priority)}`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{getPriorityIcon(suggestion.priority)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h5 className="font-medium text-sm">{suggestion.title}</h5>
                    <p className="text-xs mt-0.5 opacity-80">{suggestion.description}</p>
                  </div>
                  <button
                    onClick={() => handleDismiss(suggestion.id)}
                    className="p-1 hover:bg-black/5 rounded"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  onClick={suggestion.ctaAction}
                  className="mt-2 text-xs font-medium flex items-center gap-1 hover:underline"
                >
                  {suggestion.ctaLabel}
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper: Öneri oluşturma fonksiyonları
export function createExpenseSuggestion(
  packageCode: string,
  packageName: string,
  onAction: () => void
): Suggestion {
  return {
    id: `expense-${packageCode}-${Date.now()}`,
    type: "expense",
    title: `${packageName} gerekiyor`,
    description: "Bu işlem için masraf talebi oluşturmanız gerekiyor.",
    packageCode,
    priority: "medium",
    ctaLabel: "Talep Oluştur",
    ctaAction: onAction,
  };
}

export function createBalanceLowSuggestion(
  balance: number,
  threshold: number,
  onAction: () => void
): Suggestion {
  return {
    id: `balance-low-${Date.now()}`,
    type: "balance_low",
    title: "Masraf bakiyesi düşük",
    description: `Mevcut bakiye: ${balance.toLocaleString("tr-TR")} ₺ (Eşik: ${threshold.toLocaleString("tr-TR")} ₺)`,
    priority: balance <= 0 ? "high" : "medium",
    ctaLabel: "Masraf Talebi Oluştur",
    ctaAction: onAction,
  };
}

export function createStageActionSuggestion(
  title: string,
  description: string,
  onAction: () => void
): Suggestion {
  return {
    id: `stage-${Date.now()}`,
    type: "stage_action",
    title,
    description,
    priority: "low",
    ctaLabel: "İşlemi Başlat",
    ctaAction: onAction,
  };
}
