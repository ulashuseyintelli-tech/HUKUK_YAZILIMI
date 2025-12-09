"use client";

import { Zap, Clock, Settings, Play, Pause } from "lucide-react";

interface AutomationPanelProps {
  isAutomationEnabled: boolean;
  isAutoMode: boolean;
  daysLeft?: number;
  nextAutoAction?: string;
  nextActionAt?: string;
  automationConfig?: {
    autoTimeTracking?: boolean;
    autoSeizureRequest?: boolean;
    autoDocumentGeneration?: boolean;
    autoUyapSubmit?: boolean;
  };
  onToggleAutoMode: () => void;
  onConfigChange?: (config: any) => void;
  disabled?: boolean;
}

export function AutomationPanel({
  isAutomationEnabled,
  isAutoMode,
  daysLeft,
  nextAutoAction,
  nextActionAt,
  automationConfig = {},
  onToggleAutoMode,
  onConfigChange,
  disabled,
}: AutomationPanelProps) {
  const isDisabled = disabled || !isAutomationEnabled;

  const handleConfigToggle = (key: string) => {
    if (onConfigChange && !isDisabled) {
      onConfigChange({
        ...automationConfig,
        [key]: !automationConfig[key as keyof typeof automationConfig],
      });
    }
  };

  return (
    <div className={`bg-white rounded-xl border p-4 ${isDisabled ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Otomasyon Paneli
        </h3>
        <button
          onClick={onToggleAutoMode}
          disabled={isDisabled}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
            isAutoMode
              ? "bg-green-100 text-green-700 hover:bg-green-200"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          } ${isDisabled ? "cursor-not-allowed" : ""}`}
        >
          {isAutoMode ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          {isAutoMode ? "Otomatik Mod Açık" : "Otomatik Mod Kapalı"}
        </button>
      </div>

      {!isAutomationEnabled && (
        <div className="bg-amber-50 text-amber-700 p-3 rounded-lg mb-4 text-sm">
          Mevcut statü nedeniyle otomasyon devre dışı.
        </div>
      )}

      {/* Gün Sayacı (H.38) */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center gap-2 text-blue-700 mb-1">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">Kalan Süre</span>
          </div>
          <p className="text-2xl font-bold text-blue-700">
            {daysLeft !== undefined ? `${daysLeft} Gün` : "-"}
          </p>
        </div>
        <div className="p-3 bg-purple-50 rounded-lg">
          <div className="flex items-center gap-2 text-purple-700 mb-1">
            <Settings className="h-4 w-4" />
            <span className="text-sm font-medium">Sıradaki İşlem</span>
          </div>
          <p className="text-sm font-medium text-purple-700 truncate">
            {nextAutoAction || "Planlanmadı"}
          </p>
          {nextActionAt && (
            <p className="text-xs text-purple-600 mt-1">
              {new Date(nextActionAt).toLocaleDateString("tr-TR")}
            </p>
          )}
        </div>
      </div>

      {/* Otomasyon Ayarları (H.37) */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">Otomasyon Ayarları</h4>
        
        <label className={`flex items-center justify-between p-3 border rounded-lg ${isDisabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"}`}>
          <span className="text-sm">Otomatik Zaman Takibi</span>
          <input
            type="checkbox"
            checked={automationConfig.autoTimeTracking ?? true}
            onChange={() => handleConfigToggle("autoTimeTracking")}
            disabled={isDisabled}
            className="h-4 w-4 rounded border-gray-300"
          />
        </label>

        <label className={`flex items-center justify-between p-3 border rounded-lg ${isDisabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"}`}>
          <span className="text-sm">Otomatik Haciz Talebi</span>
          <input
            type="checkbox"
            checked={automationConfig.autoSeizureRequest ?? false}
            onChange={() => handleConfigToggle("autoSeizureRequest")}
            disabled={isDisabled}
            className="h-4 w-4 rounded border-gray-300"
          />
        </label>

        <label className={`flex items-center justify-between p-3 border rounded-lg ${isDisabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"}`}>
          <span className="text-sm">Otomatik Yazı Üretimi</span>
          <input
            type="checkbox"
            checked={automationConfig.autoDocumentGeneration ?? false}
            onChange={() => handleConfigToggle("autoDocumentGeneration")}
            disabled={isDisabled}
            className="h-4 w-4 rounded border-gray-300"
          />
        </label>

        <label className={`flex items-center justify-between p-3 border rounded-lg ${isDisabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"}`}>
          <span className="text-sm">UYAP'a Otomatik Gönder</span>
          <input
            type="checkbox"
            checked={automationConfig.autoUyapSubmit ?? false}
            onChange={() => handleConfigToggle("autoUyapSubmit")}
            disabled={isDisabled}
            className="h-4 w-4 rounded border-gray-300"
          />
        </label>
      </div>
    </div>
  );
}
