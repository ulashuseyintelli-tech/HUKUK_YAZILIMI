"use client";

import { useState } from "react";
import { Check, AlertCircle } from "lucide-react";

interface StatusCardsProps {
  currentStatus: string;
  onStatusChange: (status: string) => void;
  disabled?: boolean;
  isNewCase?: boolean; // Yeni dosya mı? Kapanış statüleri gizlenir
}

const STATUS_GROUPS = {
  ACTIVE: {
    label: "Aktif Süreçler",
    statuses: [
      { value: "DERDEST", label: "Derdest", desc: "Aktif takip, otomasyon açık" },
      { value: "ISLEMDE", label: "İşlemde", desc: "İşlem yapılıyor, otomasyon açık" },
      { value: "DERKENAR", label: "Derkenar", desc: "Beklemede, otomasyon açık" },
    ],
  },
  COMPLETED: {
    label: "Sonuçlanan Dosyalar",
    statuses: [
      { value: "HITAM", label: "Hitam", desc: "Sonuçlandı, otomasyon kapalı" },
      { value: "INFAZ", label: "İnfaz", desc: "İnfaz edildi, otomasyon kapalı" },
      { value: "MUVEKKILE_IADE", label: "Müvekkile İade", desc: "Müvekkile iade, otomasyon kapalı" },
    ],
  },
  IMPOSSIBLE: {
    label: "Tahsil İmkânsız / Özel",
    statuses: [
      { value: "ACIZ", label: "Aciz", desc: "Aciz vesikası, otomasyon kapalı" },
      { value: "BATAK", label: "Batak", desc: "Tahsil imkansız, otomasyon kapalı" },
      { value: "MAHSUP", label: "Mahsup", desc: "Mahsup edildi, otomasyon kapalı" },
      { value: "TEMLIK", label: "Temlik", desc: "Temlik edildi, otomasyon kapalı" },
    ],
  },
};

// Otomasyon kapatan statüler
const AUTOMATION_OFF_STATUSES = ["HITAM", "INFAZ", "MUVEKKILE_IADE", "ACIZ", "BATAK", "MAHSUP", "TEMLIK"];

export function StatusCards({ currentStatus, onStatusChange, disabled, isNewCase }: StatusCardsProps) {
  const [confirmStatus, setConfirmStatus] = useState<string | null>(null);

  // Yeni dosyada sadece aktif statüler gösterilir (C.10)
  const visibleGroups = isNewCase 
    ? { ACTIVE: STATUS_GROUPS.ACTIVE }
    : STATUS_GROUPS;

  const handleStatusClick = (status: string) => {
    if (disabled) return;
    
    // Otomasyon kapatan statüye geçişte onay iste (G.36)
    if (AUTOMATION_OFF_STATUSES.includes(status) && !AUTOMATION_OFF_STATUSES.includes(currentStatus)) {
      setConfirmStatus(status);
    } else {
      onStatusChange(status);
    }
  };

  const confirmChange = () => {
    if (confirmStatus) {
      onStatusChange(confirmStatus);
      setConfirmStatus(null);
    }
  };

  return (
    <div className="space-y-6">
      {Object.entries(visibleGroups).map(([groupKey, group]) => (
        <div key={groupKey}>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">{group.label}</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {group.statuses.map((status) => {
              const isSelected = currentStatus === status.value;
              const isAutomationOff = AUTOMATION_OFF_STATUSES.includes(status.value);
              
              return (
                <button
                  key={status.value}
                  onClick={() => handleStatusClick(status.value)}
                  disabled={disabled}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-gray-200 hover:border-gray-300"
                  } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-medium ${isSelected ? "text-primary" : ""}`}>
                      {status.label}
                    </span>
                    {isSelected && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{status.desc}</p>
                  {isAutomationOff && (
                    <span className="inline-block mt-1 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                      Otomasyon kapatır
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Onay Dialog (G.36) */}
      {confirmStatus && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-100 rounded-full">
                <AlertCircle className="h-6 w-6 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold">Statü Değişikliği</h3>
            </div>
            <p className="text-muted-foreground mb-6">
              Bu statü otomasyonu kapatacaktır. Devam etmek istediğinize emin misiniz?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmStatus(null)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={confirmChange}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
              >
                Onayla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
