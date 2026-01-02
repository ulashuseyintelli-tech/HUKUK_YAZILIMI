"use client";

import React, { useState } from "react";
import { 
  Truck, Mail, Calendar, CheckCircle, XCircle, Clock, 
  AlertCircle, Edit2, Save, X, Barcode, Users, Scroll 
} from "lucide-react";
import { DebtorType, EstateHeir } from "@/types/debtor";

// Tebligat durumu
export type NotificationStatus = 
  | "BEKLEMEDE"      // Henüz gönderilmedi
  | "GONDERILDI"     // PTT'ye verildi
  | "YOLDA"          // Dağıtımda
  | "TEBLIG_EDILDI"  // Tebliğ edildi
  | "IADE"           // İade geldi
  | "ILANEN";        // İlanen tebligata geçildi

const statusLabels: Record<NotificationStatus, string> = {
  BEKLEMEDE: "Beklemede",
  GONDERILDI: "Gönderildi",
  YOLDA: "Dağıtımda",
  TEBLIG_EDILDI: "Tebliğ Edildi",
  IADE: "İade",
  ILANEN: "İlanen Tebligat",
};

const statusColors: Record<NotificationStatus, string> = {
  BEKLEMEDE: "bg-gray-100 text-gray-700",
  GONDERILDI: "bg-blue-100 text-blue-700",
  YOLDA: "bg-amber-100 text-amber-700",
  TEBLIG_EDILDI: "bg-green-100 text-green-700",
  IADE: "bg-red-100 text-red-700",
  ILANEN: "bg-purple-100 text-purple-700",
};

const statusIcons: Record<NotificationStatus, React.ReactNode> = {
  BEKLEMEDE: <Clock className="h-3 w-3" />,
  GONDERILDI: <Truck className="h-3 w-3" />,
  YOLDA: <Truck className="h-3 w-3" />,
  TEBLIG_EDILDI: <CheckCircle className="h-3 w-3" />,
  IADE: <XCircle className="h-3 w-3" />,
  ILANEN: <AlertCircle className="h-3 w-3" />,
};

interface NotificationData {
  notificationBarcode?: string;
  notificationSentDate?: string;
  notificationDeliveredDate?: string;
  notificationStatus?: NotificationStatus;
  notificationNote?: string;
}

interface CaseDebtorWithNotification {
  id: string;
  debtorId: string;
  role: string;
  debtor: {
    id: string;
    name: string;
    type: DebtorType;
    estateHeirs?: EstateHeir[];
  };
  notificationBarcode?: string;
  notificationSentDate?: string;
  notificationDeliveredDate?: string;
  notificationStatus?: string;
  notificationNote?: string;
}

interface NotificationTrackingPanelProps {
  caseDebtors: CaseDebtorWithNotification[];
  onUpdate: (caseDebtorId: string, data: NotificationData) => Promise<void>;
  readOnly?: boolean;
}

export function NotificationTrackingPanel({ 
  caseDebtors, 
  onUpdate,
  readOnly = false 
}: NotificationTrackingPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<NotificationData>({});
  const [saving, setSaving] = useState(false);

  const handleEdit = (cd: CaseDebtorWithNotification) => {
    setEditingId(cd.id);
    setEditData({
      notificationBarcode: cd.notificationBarcode || "",
      notificationSentDate: cd.notificationSentDate?.split("T")[0] || "",
      notificationDeliveredDate: cd.notificationDeliveredDate?.split("T")[0] || "",
      notificationStatus: (cd.notificationStatus as NotificationStatus) || "BEKLEMEDE",
      notificationNote: cd.notificationNote || "",
    });
  };

  const handleSave = async (caseDebtorId: string) => {
    setSaving(true);
    try {
      await onUpdate(caseDebtorId, editData);
      setEditingId(null);
    } catch (error) {
      console.error("Tebligat bilgisi kaydedilemedi:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditData({});
  };

  // Tereke borçluları için mirasçı bazlı görünüm
  const renderEstateHeirs = (cd: CaseDebtorWithNotification) => {
    const heirs = cd.debtor.estateHeirs || [];
    if (heirs.length === 0) return null;

    return (
      <div className="mt-2 space-y-1">
        <div className="text-xs font-medium text-amber-700 flex items-center gap-1">
          <Users className="h-3 w-3" /> Mirasçı Tebligatları ({heirs.length})
        </div>
        {heirs.map((heir, idx) => (
          <div key={idx} className="bg-amber-50 border border-amber-200 rounded p-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium">{heir.name}</span>
              <span className="text-amber-600">{heir.shareRatio || "-"}</span>
            </div>
            <div className="text-gray-500 mt-1">
              {heir.city}{heir.district ? ` / ${heir.district}` : ""} 
              {heir.address && <span className="block truncate">{heir.address}</span>}
            </div>
            {heir.phone && (
              <div className="text-gray-500 mt-0.5">📞 {heir.phone}</div>
            )}
            {/* Her mirasçı için ayrı tebligat takibi yapılabilir - ileri seviye */}
            <div className="mt-1 pt-1 border-t border-amber-200 flex items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${statusColors.BEKLEMEDE}`}>
                {statusIcons.BEKLEMEDE} Beklemede
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (caseDebtors.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Henüz borçlu eklenmemiş</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Truck className="h-4 w-4 text-blue-600" />
          Tebligat Takibi
        </h3>
        <span className="text-xs text-gray-500">
          {caseDebtors.length} borçlu
        </span>
      </div>

      {caseDebtors.map((cd) => {
        const isEditing = editingId === cd.id;
        const isEstate = cd.debtor.type === DebtorType.ESTATE;
        const status = (cd.notificationStatus as NotificationStatus) || "BEKLEMEDE";

        return (
          <div key={cd.id} className="border rounded-lg p-3 bg-white">
            {/* Borçlu Başlık */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {isEstate ? (
                  <Scroll className="h-4 w-4 text-amber-500" />
                ) : (
                  <Users className="h-4 w-4 text-gray-500" />
                )}
                <span className="font-medium text-sm">{cd.debtor.name}</span>
              </div>
              {!readOnly && !isEditing && (
                <button
                  onClick={() => handleEdit(cd)}
                  className="text-gray-400 hover:text-blue-500 p-1"
                  title="Düzenle"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Tereke için mirasçı listesi */}
            {isEstate && renderEstateHeirs(cd)}

            {/* Normal borçlu için tebligat bilgileri */}
            {!isEstate && (
              <>
                {isEditing ? (
                  /* Düzenleme Modu */
                  <div className="space-y-2 bg-gray-50 rounded p-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium mb-1">
                          <Barcode className="inline h-3 w-3 mr-1" />
                          PTT Barkod No
                        </label>
                        <input
                          type="text"
                          value={editData.notificationBarcode || ""}
                          onChange={(e) => setEditData({ ...editData, notificationBarcode: e.target.value })}
                          placeholder="RR123456789TR"
                          className="w-full border rounded px-2 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Durum</label>
                        <select
                          value={editData.notificationStatus || "BEKLEMEDE"}
                          onChange={(e) => setEditData({ ...editData, notificationStatus: e.target.value as NotificationStatus })}
                          className="w-full border rounded px-2 py-1.5 text-xs"
                        >
                          {Object.entries(statusLabels).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">
                          <Calendar className="inline h-3 w-3 mr-1" />
                          Gönderim Tarihi
                        </label>
                        <input
                          type="date"
                          value={editData.notificationSentDate || ""}
                          onChange={(e) => setEditData({ ...editData, notificationSentDate: e.target.value })}
                          className="w-full border rounded px-2 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">
                          <CheckCircle className="inline h-3 w-3 mr-1" />
                          Tebliğ Tarihi
                        </label>
                        <input
                          type="date"
                          value={editData.notificationDeliveredDate || ""}
                          onChange={(e) => setEditData({ ...editData, notificationDeliveredDate: e.target.value })}
                          className="w-full border rounded px-2 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Not (İade sebebi vb.)</label>
                      <input
                        type="text"
                        value={editData.notificationNote || ""}
                        onChange={(e) => setEditData({ ...editData, notificationNote: e.target.value })}
                        placeholder="Ör: Adreste bulunamadı, komşuya tebliğ edildi..."
                        className="w-full border rounded px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={handleCancel}
                        className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
                      >
                        <X className="inline h-3 w-3 mr-1" />
                        İptal
                      </button>
                      <button
                        onClick={() => handleSave(cd.id)}
                        disabled={saving}
                        className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                      >
                        <Save className="inline h-3 w-3 mr-1" />
                        {saving ? "Kaydediliyor..." : "Kaydet"}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Görüntüleme Modu */
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded ${statusColors[status]}`}>
                        {statusIcons[status]}
                        {statusLabels[status]}
                      </span>
                    </div>
                    {cd.notificationBarcode && (
                      <div className="flex items-center gap-1 text-gray-600">
                        <Barcode className="h-3 w-3" />
                        <span className="font-mono">{cd.notificationBarcode}</span>
                      </div>
                    )}
                    {cd.notificationSentDate && (
                      <div className="flex items-center gap-1 text-gray-600">
                        <Truck className="h-3 w-3" />
                        <span>Gönderim: {new Date(cd.notificationSentDate).toLocaleDateString("tr-TR")}</span>
                      </div>
                    )}
                    {cd.notificationDeliveredDate && (
                      <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-3 w-3" />
                        <span>Tebliğ: {new Date(cd.notificationDeliveredDate).toLocaleDateString("tr-TR")}</span>
                      </div>
                    )}
                    {cd.notificationNote && (
                      <div className="col-span-2 text-gray-500 italic">
                        📝 {cd.notificationNote}
                      </div>
                    )}
                    {!cd.notificationBarcode && !cd.notificationSentDate && (
                      <div className="col-span-2 text-gray-400 italic">
                        Henüz tebligat bilgisi girilmedi
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {/* Özet */}
      <div className="bg-slate-50 rounded p-2 text-xs">
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <div className="font-semibold text-gray-700">
              {caseDebtors.filter(cd => !cd.notificationStatus || cd.notificationStatus === "BEKLEMEDE").length}
            </div>
            <div className="text-gray-500">Beklemede</div>
          </div>
          <div>
            <div className="font-semibold text-blue-600">
              {caseDebtors.filter(cd => cd.notificationStatus === "GONDERILDI" || cd.notificationStatus === "YOLDA").length}
            </div>
            <div className="text-gray-500">Yolda</div>
          </div>
          <div>
            <div className="font-semibold text-green-600">
              {caseDebtors.filter(cd => cd.notificationStatus === "TEBLIG_EDILDI").length}
            </div>
            <div className="text-gray-500">Tebliğ</div>
          </div>
          <div>
            <div className="font-semibold text-red-600">
              {caseDebtors.filter(cd => cd.notificationStatus === "IADE").length}
            </div>
            <div className="text-gray-500">İade</div>
          </div>
        </div>
      </div>
    </div>
  );
}
