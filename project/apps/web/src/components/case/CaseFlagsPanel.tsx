"use client";

import { Archive, Eye, EyeOff, Shield, AlertCircle } from "lucide-react";
import { useState } from "react";

interface CaseFlagsPanelProps {
  isArchived: boolean;
  showToClient: boolean;
  allowUyapActions: boolean;
  onFlagChange: (flags: { isArchived?: boolean; showToClient?: boolean; allowUyapActions?: boolean }) => void;
}

export function CaseFlagsPanel({
  isArchived,
  showToClient,
  allowUyapActions,
  onFlagChange,
}: CaseFlagsPanelProps) {
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const handleArchiveToggle = () => {
    if (!isArchived) {
      // Arşive alırken onay iste (K.48)
      setShowArchiveConfirm(true);
    } else {
      onFlagChange({ isArchived: false });
    }
  };

  const confirmArchive = (changeStatus: boolean) => {
    onFlagChange({ isArchived: true });
    setShowArchiveConfirm(false);
    // changeStatus true ise statüyü de değiştir (K.48)
    // Bu parent component'te handle edilecek
  };

  return (
    <div className="bg-white rounded-xl border p-4">
      <h3 className="font-semibold mb-4">Dosya Yönetim Ayarları</h3>

      <div className="space-y-3">
        {/* Arşiv Dosyası (K.47) */}
        <div
          onClick={handleArchiveToggle}
          className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
            isArchived ? "bg-gray-100 border-gray-300" : "hover:bg-gray-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <Archive className={`h-5 w-5 ${isArchived ? "text-gray-600" : "text-gray-400"}`} />
            <div>
              <p className="font-medium">Arşiv Dosyası</p>
              <p className="text-xs text-muted-foreground">Dosyayı arşive taşı</p>
            </div>
          </div>
          <div
            className={`w-10 h-6 rounded-full transition-colors ${
              isArchived ? "bg-primary" : "bg-gray-200"
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform mt-0.5 ${
                isArchived ? "translate-x-4 ml-0.5" : "translate-x-0.5"
              }`}
            />
          </div>
        </div>

        {/* Müvekkil Portalında Gösterme (K.47, K.49) */}
        <div
          onClick={() => onFlagChange({ showToClient: !showToClient })}
          className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
            !showToClient ? "bg-amber-50 border-amber-200" : "hover:bg-gray-50"
          }`}
        >
          <div className="flex items-center gap-3">
            {showToClient ? (
              <Eye className="h-5 w-5 text-green-500" />
            ) : (
              <EyeOff className="h-5 w-5 text-amber-500" />
            )}
            <div>
              <p className="font-medium">Müvekkil Portalında Göster</p>
              <p className="text-xs text-muted-foreground">
                {showToClient ? "Müvekkil bu dosyayı görebilir" : "Müvekkil bu dosyayı göremez"}
              </p>
            </div>
          </div>
          <div
            className={`w-10 h-6 rounded-full transition-colors ${
              showToClient ? "bg-green-500" : "bg-gray-200"
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform mt-0.5 ${
                showToClient ? "translate-x-4 ml-0.5" : "translate-x-0.5"
              }`}
            />
          </div>
        </div>

        {/* UYAP İşlemi Yapma (K.47, K.50) */}
        <div
          onClick={() => onFlagChange({ allowUyapActions: !allowUyapActions })}
          className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
            !allowUyapActions ? "bg-red-50 border-red-200" : "hover:bg-gray-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <Shield className={`h-5 w-5 ${allowUyapActions ? "text-green-500" : "text-red-500"}`} />
            <div>
              <p className="font-medium">UYAP İşlemleri</p>
              <p className="text-xs text-muted-foreground">
                {allowUyapActions ? "UYAP işlemleri aktif" : "UYAP işlemleri devre dışı"}
              </p>
            </div>
          </div>
          <div
            className={`w-10 h-6 rounded-full transition-colors ${
              allowUyapActions ? "bg-green-500" : "bg-gray-200"
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform mt-0.5 ${
                allowUyapActions ? "translate-x-4 ml-0.5" : "translate-x-0.5"
              }`}
            />
          </div>
        </div>
      </div>

      {/* Arşiv Onay Dialog (K.48) */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-100 rounded-full">
                <AlertCircle className="h-6 w-6 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold">Dosyayı Arşivle</h3>
            </div>
            <p className="text-muted-foreground mb-4">
              Dosyayı arşive almak istediğinize emin misiniz?
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Statüyü otomatik olarak uygun kapanış statüsüne (Hitam/Batak/Aciz) taşımak ister misiniz?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowArchiveConfirm(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={() => confirmArchive(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Sadece Arşivle
              </button>
              <button
                onClick={() => confirmArchive(true)}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
              >
                Arşivle ve Statü Değiştir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
