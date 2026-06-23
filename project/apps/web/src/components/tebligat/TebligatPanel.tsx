"use client";

import React, { useState, useEffect } from "react";
import {
  Mail, Send, CheckCircle, XCircle, Clock, AlertTriangle,
  MapPin, Building2, FileText, Plus, ChevronRight, Loader2,
  Home, RefreshCw, Info
} from "lucide-react";
import { api } from "@/lib/api";

// Tebligat Türleri
const TebligatTypeLabels: Record<string, string> = {
  ODEME_EMRI: "Ödeme Emri",
  ICRA_EMRI: "İcra Emri",
  TAHLIYE_EMRI: "Tahliye Emri",
  HACIZ_IHBARNAMESI_89_1: "89/1 Haciz İhbarnamesi",
  HACIZ_IHBARNAMESI_89_2: "89/2 Haciz İhbarnamesi",
  HACIZ_IHBARNAMESI_89_3: "89/3 Haciz İhbarnamesi",
  SATIS_ILANI: "Satış İlanı",
  KIYMET_TAKDIRI: "Kıymet Takdiri",
  DIGER: "Diğer",
};

// Adres Türleri
const AddressTypeLabels: Record<string, string> = {
  BILINEN: "Bilinen Adres",
  MERNIS: "MERNİS Adresi",
  TICARET_SICIL: "Ticaret Sicil",
  KEP: "KEP Adresi",
  VERGI_DAIRESI: "Vergi Dairesi",
};

// Kanal Türleri
const ChannelLabels: Record<string, string> = {
  PTT: "PTT",
  KEP: "KEP",
  UETS: "UETS",
  ILANEN: "İlanen",
  ELDEN: "Elden",
};

// Durum Renkleri
const StatusColors: Record<string, string> = {
  HAZIRLANDI: "bg-gray-100 text-gray-700",
  GONDERILDI: "bg-blue-100 text-blue-700",
  TESLIM_EDILDI: "bg-emerald-100 text-emerald-700",
  IADE_GELDI: "bg-red-100 text-red-700",
  MUHTARLIGA_BIRAKILDI: "bg-amber-100 text-amber-700",
  TEBLIG_EDILMIS_SAYILDI: "bg-emerald-100 text-emerald-700",
  IPTAL: "bg-gray-100 text-gray-500",
};

// Durum Etiketleri
const StatusLabels: Record<string, string> = {
  HAZIRLANDI: "Hazırlandı",
  GONDERILDI: "Gönderildi",
  TESLIM_EDILDI: "Teslim Edildi",
  IADE_GELDI: "İade Geldi",
  MUHTARLIGA_BIRAKILDI: "Muhtarlığa Bırakıldı",
  TEBLIG_EDILMIS_SAYILDI: "Tebliğ Edilmiş Sayıldı",
  IPTAL: "İptal",
};

// PTT Sonuçları
const PttResultLabels: Record<string, string> = {
  TESLIM_EDILDI: "Teslim Edildi",
  AYNI_KONUTTA_TESLIM: "Aynı Konutta Teslim",
  ISYERINDE_TESLIM: "İşyerinde Teslim",
  ADRESTE_BULUNAMADI: "Adreste Bulunamadı",
  TASINMIS: "Taşınmış",
  ADRES_YETERSIZ: "Adres Yetersiz",
  BINA_YIKILMIS: "Bina Yıkılmış",
  ADRES_KAPALI: "Adres Kapalı",
  IMTINA: "İmtina",
  MUHTARLIGA_BIRAKILDI: "Muhtarlığa Bırakıldı",
  VEFAT: "Vefat",
  TANIMIYOR: "Tanınmıyor",
  DIGER: "Diğer",
};

// Sonraki Adım Etiketleri
const NextActionLabels: Record<string, string> = {
  MERNIS_TEBLIGAT: "MERNİS'e Tebligat Çıkar",
  ILANEN_TEBLIGAT: "İlanen Tebligat Başlat",
  TEBLIG_TAMAMLANDI: "Tebliğ Tamamlandı",
  YENI_ADRES_ARA: "Yeni Adres Araştır",
  BEKLE: "Süre Bekleniyor",
};

interface Tebligat {
  id: string;
  tebligatType: string;
  addressType: string;
  addressText: string;
  city?: string;
  recipientName: string;
  recipientTcVkn?: string;
  channel: string;
  status: string;
  preparedAt: string;
  sentAt?: string;
  deliveredAt?: string;
  returnedAt?: string;
  pttResult?: string;
  pttResultDate?: string;
  pttResultNote?: string;
  tk21Type?: string;
  muhtarlikDate?: string;
  tebligSayilmaDate?: string;
  nextAction?: string;
  barcodeNo?: string;
  notes?: string;
}

interface TebligatSummary {
  total: number;
  hazirlanan: number;
  gonderilen: number;
  teslimEdilen: number;
  iadeGelen: number;
  tebligEdilmisSayilan: number;
  bekleyenIslem: number;
}

interface AddressPriorityCheck {
  currentAddressType: string;
  canUseMernis: boolean;
  mustUseBilinen: boolean;
  suggestedAction: string;
  message: string;
  previousAttempts: {
    addressType: string;
    result: string;
    date: string;
  }[];
}

interface TebligatPanelProps {
  caseId: string;
  caseDebtorId?: string;
  debtorName?: string;
  readOnly?: boolean;
}

export function TebligatPanel({ caseId, caseDebtorId, debtorName, readOnly = false }: TebligatPanelProps) {
  const [tebligatlar, setTebligatlar] = useState<Tebligat[]>([]);
  const [summary, setSummary] = useState<TebligatSummary | null>(null);
  const [priorityCheck, setPriorityCheck] = useState<AddressPriorityCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showPttResultModal, setShowPttResultModal] = useState(false);
  const [selectedTebligat, setSelectedTebligat] = useState<Tebligat | null>(null);

  useEffect(() => {
    loadData();
  }, [caseId, caseDebtorId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Tebligatları yükle
      const endpoint = caseDebtorId 
        ? `/tebligat/case-debtor/${caseDebtorId}`
        : `/tebligat/case/${caseId}`;
      const res = await api.get(endpoint);
      setTebligatlar(res.data || []);

      // Özet yükle
      const summaryRes = await api.get(`/tebligat/summary?caseId=${caseId}`);
      setSummary(summaryRes.data);

      // Adres öncelik kontrolü
      if (caseDebtorId) {
        const priorityRes = await api.get(
          `/tebligat/check-priority/${caseId}?caseDebtorId=${caseDebtorId}`
        );
        setPriorityCheck(priorityRes.data);
      }
    } catch (err) {
      console.error("Tebligat verileri yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendTebligat = async (tebligatId: string) => {
    try {
      await api.post(`/tebligat/${tebligatId}/send`, {});
      loadData();
    } catch (err: any) {
      alert(err.message || "Tebligat gönderilemedi");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "HAZIRLANDI":
        return <FileText className="h-4 w-4" />;
      case "GONDERILDI":
        return <Send className="h-4 w-4" />;
      case "TESLIM_EDILDI":
      case "TEBLIG_EDILMIS_SAYILDI":
        return <CheckCircle className="h-4 w-4" />;
      case "IADE_GELDI":
        return <XCircle className="h-4 w-4" />;
      case "MUHTARLIGA_BIRAKILDI":
        return <Clock className="h-4 w-4" />;
      default:
        return <Mail className="h-4 w-4" />;
    }
  };

  const getAddressIcon = (addressType: string) => {
    switch (addressType) {
      case "BILINEN":
        return <Home className="h-4 w-4" />;
      case "MERNIS":
        return <Building2 className="h-4 w-4" />;
      default:
        return <MapPin className="h-4 w-4" />;
    }
  };

  return (
    <div className="border rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5 text-indigo-500" />
            Tebligat İşlemleri
          </h3>
          {debtorName && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {debtorName} için tebligatlar
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (!readOnly) setShowNewModal(true);
          }}
          disabled={readOnly}
          className="px-3 py-1.5 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" /> Yeni Tebligat
        </button>
      </div>
      {readOnly && (
        <div className="mb-4 p-2 rounded bg-gray-50 border border-gray-200 text-xs text-gray-600">
          Pasif kayit: yeni tebligat kapali.
        </div>
      )}

      {/* Adres Öncelik Uyarısı */}
      {priorityCheck && (
        <div className={`p-3 rounded-lg mb-4 ${
          priorityCheck.mustUseBilinen 
            ? "bg-amber-50 border border-amber-200" 
            : priorityCheck.canUseMernis
            ? "bg-blue-50 border border-blue-200"
            : "bg-gray-50 border border-gray-200"
        }`}>
          <div className="flex items-start gap-2">
            {priorityCheck.mustUseBilinen ? (
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
            ) : priorityCheck.canUseMernis ? (
              <Info className="h-5 w-5 text-blue-500 mt-0.5" />
            ) : (
              <CheckCircle className="h-5 w-5 text-emerald-500 mt-0.5" />
            )}
            <div>
              <p className={`text-sm font-medium ${
                priorityCheck.mustUseBilinen 
                  ? "text-amber-700" 
                  : priorityCheck.canUseMernis
                  ? "text-blue-700"
                  : "text-gray-700"
              }`}>
                {priorityCheck.message}
              </p>
              {priorityCheck.suggestedAction && priorityCheck.suggestedAction !== "TEBLIG_TAMAMLANDI" && (
                <p className="text-xs mt-1 text-gray-600">
                  Önerilen: {NextActionLabels[priorityCheck.suggestedAction]}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Özet Kartları */}
      {summary && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <p className="text-2xl font-bold text-gray-700">{summary.total}</p>
            <p className="text-xs text-gray-500">Toplam</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg text-center">
            <p className="text-2xl font-bold text-blue-700">{summary.gonderilen}</p>
            <p className="text-xs text-blue-600">Gönderilen</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-lg text-center">
            <p className="text-2xl font-bold text-emerald-700">
              {summary.teslimEdilen + summary.tebligEdilmisSayilan}
            </p>
            <p className="text-xs text-emerald-600">Tebliğ Edilen</p>
          </div>
          <div className="p-3 bg-red-50 rounded-lg text-center">
            <p className="text-2xl font-bold text-red-700">{summary.bekleyenIslem}</p>
            <p className="text-xs text-red-600">Bekleyen İşlem</p>
          </div>
        </div>
      )}

      {/* Tebligat Listesi */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          Yükleniyor...
        </div>
      ) : tebligatlar.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed rounded-lg">
          <Mail className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">Henüz tebligat oluşturulmadı</p>
          <p className="text-xs text-muted-foreground mt-1">
            Yeni tebligat oluşturmak için yukarıdaki butonu kullanın
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tebligatlar.map((t) => (
            <div key={t.id} className="p-4 border rounded-lg hover:border-indigo-200 transition-colors">
              {/* Üst Kısım */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${StatusColors[t.status]}`}>
                    {getStatusIcon(t.status)}
                  </div>
                  <div>
                    <p className="font-medium">{TebligatTypeLabels[t.tebligatType]}</p>
                    <p className="text-sm text-muted-foreground">{t.recipientName}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${StatusColors[t.status]}`}>
                  {StatusLabels[t.status]}
                </span>
              </div>

              {/* Adres Bilgisi */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                {getAddressIcon(t.addressType)}
                <span className="font-medium">{AddressTypeLabels[t.addressType]}:</span>
                <span className="truncate">{t.addressText}</span>
              </div>

              {/* Timeline */}
              <div className="flex items-center gap-2 text-xs mb-3">
                <div className={`px-2 py-1 rounded ${t.preparedAt ? "bg-gray-100" : "bg-gray-50 text-gray-400"}`}>
                  Hazırlandı
                  {t.preparedAt && (
                    <span className="ml-1 text-gray-500">
                      {new Date(t.preparedAt).toLocaleDateString("tr-TR")}
                    </span>
                  )}
                </div>
                <ChevronRight className="h-3 w-3 text-gray-300" />
                <div className={`px-2 py-1 rounded ${t.sentAt ? "bg-blue-100 text-blue-700" : "bg-gray-50 text-gray-400"}`}>
                  Gönderildi
                  {t.sentAt && (
                    <span className="ml-1">
                      {new Date(t.sentAt).toLocaleDateString("tr-TR")}
                    </span>
                  )}
                </div>
                <ChevronRight className="h-3 w-3 text-gray-300" />
                <div className={`px-2 py-1 rounded ${
                  t.deliveredAt || t.tebligSayilmaDate 
                    ? "bg-emerald-100 text-emerald-700" 
                    : t.returnedAt 
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-50 text-gray-400"
                }`}>
                  {t.returnedAt ? "İade" : "Tebliğ"}
                  {(t.deliveredAt || t.tebligSayilmaDate || t.returnedAt) && (
                    <span className="ml-1">
                      {new Date(t.deliveredAt || t.tebligSayilmaDate || t.returnedAt!).toLocaleDateString("tr-TR")}
                    </span>
                  )}
                </div>
              </div>

              {/* PTT Sonucu */}
              {t.pttResult && (
                <div className="p-2 bg-gray-50 rounded-lg text-sm mb-3">
                  <span className="font-medium">PTT Sonucu:</span>{" "}
                  <span>{PttResultLabels[t.pttResult]}</span>
                  {t.tk21Type && (
                    <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">
                      TK {t.tk21Type.replace("TK_", "").replace("_", "/")}
                    </span>
                  )}
                  {t.pttResultNote && (
                    <p className="text-xs text-gray-500 mt-1">{t.pttResultNote}</p>
                  )}
                </div>
              )}

              {/* Sonraki Adım */}
              {t.nextAction && t.nextAction !== "TEBLIG_TAMAMLANDI" && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-sm mb-3">
                  <span className="font-medium text-amber-700">Sonraki Adım:</span>{" "}
                  <span className="text-amber-600">{NextActionLabels[t.nextAction]}</span>
                </div>
              )}

              {/* Aksiyonlar — C2a: readOnly salt-okuma yüzeyinde TÜM mutation aksiyonları (gönder/PTT/MERNİS) gizlenir */}
              {!readOnly && (
              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                {t.status === "HAZIRLANDI" && (
                  <button
                    type="button"
                    onClick={() => handleSendTebligat(t.id)}
                    className="px-3 py-1.5 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 flex items-center gap-1"
                  >
                    <Send className="h-3 w-3" /> Gönder
                  </button>
                )}
                {t.status === "GONDERILDI" && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTebligat(t);
                      setShowPttResultModal(true);
                    }}
                    className="px-3 py-1.5 bg-amber-500 text-white text-xs rounded-lg hover:bg-amber-600 flex items-center gap-1"
                  >
                    <RefreshCw className="h-3 w-3" /> PTT Sonucu Gir
                  </button>
                )}
                {t.nextAction === "MERNIS_TEBLIGAT" && (
                  <button
                    type="button"
                    onClick={() => {
                      // MERNİS tebligatı oluştur
                      alert("MERNİS tebligatı oluşturma modal'ı açılacak");
                    }}
                    className="px-3 py-1.5 bg-indigo-500 text-white text-xs rounded-lg hover:bg-indigo-600 flex items-center gap-1"
                  >
                    <Building2 className="h-3 w-3" /> MERNİS Tebligatı Oluştur
                  </button>
                )}
              </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Yeni Tebligat Modal */}
      {showNewModal && !readOnly && (
        <NewTebligatModal
          caseId={caseId}
          caseDebtorId={caseDebtorId}
          priorityCheck={priorityCheck}
          onClose={() => setShowNewModal(false)}
          onSaved={() => {
            setShowNewModal(false);
            loadData();
          }}
        />
      )}

      {/* PTT Sonucu Modal */}
      {showPttResultModal && selectedTebligat && (
        <PttResultModal
          tebligat={selectedTebligat}
          onClose={() => {
            setShowPttResultModal(false);
            setSelectedTebligat(null);
          }}
          onSaved={() => {
            setShowPttResultModal(false);
            setSelectedTebligat(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}


// Yeni Tebligat Modal
interface NewTebligatModalProps {
  caseId: string;
  caseDebtorId?: string;
  priorityCheck: AddressPriorityCheck | null;
  onClose: () => void;
  onSaved: () => void;
}

function NewTebligatModal({ caseId, caseDebtorId, priorityCheck, onClose, onSaved }: NewTebligatModalProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    tebligatType: "ODEME_EMRI",
    addressType: priorityCheck?.mustUseBilinen ? "BILINEN" : "BILINEN",
    addressText: "",
    city: "",
    recipientName: "",
    recipientTcVkn: "",
    channel: "PTT",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.addressText.trim()) {
      alert("Lütfen adres girin");
      return;
    }

    if (!formData.recipientName.trim()) {
      alert("Lütfen muhatap adını girin");
      return;
    }

    try {
      setSaving(true);
      await api.post("/tebligat", {
        caseId,
        caseDebtorId,
        ...formData,
      });
      onSaved();
    } catch (err: any) {
      alert(err.message || "Tebligat oluşturulamadı");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">Yeni Tebligat Oluştur</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {/* Uyarı */}
        {priorityCheck?.mustUseBilinen && (
          <div className="mx-4 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              <span>Önce bilinen adrese tebligat çıkarılmalıdır (TK m.10)</span>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Tebligat Türü */}
          <div>
            <label className="block text-sm font-medium mb-1">Tebligat Türü *</label>
            <select
              value={formData.tebligatType}
              onChange={(e) => setFormData({ ...formData, tebligatType: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
            >
              {Object.entries(TebligatTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Adres Türü */}
          <div>
            <label className="block text-sm font-medium mb-1">Adres Türü *</label>
            <select
              value={formData.addressType}
              onChange={(e) => setFormData({ ...formData, addressType: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
              disabled={priorityCheck?.mustUseBilinen}
            >
              <option value="BILINEN">Bilinen Adres (TK m.10)</option>
              <option value="MERNIS" disabled={priorityCheck?.mustUseBilinen}>
                MERNİS Adresi (TK m.10/2)
              </option>
              <option value="TICARET_SICIL">Ticaret Sicil Adresi</option>
              <option value="KEP">KEP Adresi</option>
            </select>
            {formData.addressType === "MERNIS" && (
              <p className="text-xs text-blue-600 mt-1">
                MERNİS adresine tebligat TK 21/2 prosedürü ile işler (ihbar + 15 gün)
              </p>
            )}
          </div>

          {/* Muhatap Adı */}
          <div>
            <label className="block text-sm font-medium mb-1">Muhatap Adı *</label>
            <input
              type="text"
              value={formData.recipientName}
              onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
              placeholder="Borçlu adı/ünvanı"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          {/* TC/VKN */}
          <div>
            <label className="block text-sm font-medium mb-1">TC Kimlik No / VKN</label>
            <input
              type="text"
              value={formData.recipientTcVkn}
              onChange={(e) => setFormData({ ...formData, recipientTcVkn: e.target.value })}
              placeholder="11 haneli TC veya 10 haneli VKN"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Adres */}
          <div>
            <label className="block text-sm font-medium mb-1">Adres *</label>
            <textarea
              value={formData.addressText}
              onChange={(e) => setFormData({ ...formData, addressText: e.target.value })}
              placeholder="Tam adres"
              rows={3}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500 resize-none"
              required
            />
          </div>

          {/* İl */}
          <div>
            <label className="block text-sm font-medium mb-1">İl</label>
            <input
              type="text"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              placeholder="İl"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Kanal */}
          <div>
            <label className="block text-sm font-medium mb-1">Tebligat Kanalı</label>
            <select
              value={formData.channel}
              onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
            >
              <option value="PTT">PTT (Fiziki Tebligat)</option>
              <option value="KEP">KEP (Kayıtlı Elektronik Posta)</option>
              <option value="UETS">UETS (Ulusal Elektronik Tebligat)</option>
              <option value="ILANEN">İlanen Tebligat</option>
              <option value="ELDEN">Elden Tebligat</option>
            </select>
          </div>

          {/* Notlar */}
          <div>
            <label className="block text-sm font-medium mb-1">Notlar</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Ek notlar..."
              rows={2}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Butonlar */}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Kaydediliyor...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Oluştur
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              İptal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// PTT Sonucu Modal
interface PttResultModalProps {
  tebligat: Tebligat;
  onClose: () => void;
  onSaved: () => void;
}

function PttResultModal({ tebligat, onClose, onSaved }: PttResultModalProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    pttResult: "",
    pttResultDate: new Date().toISOString().split("T")[0],
    pttResultNote: "",
    barcodeNo: tebligat.barcodeNo || "",
    tk21Type: "",
    muhtarlikDate: "",
    ilanDate: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.pttResult) {
      alert("Lütfen PTT sonucunu seçin");
      return;
    }

    try {
      setSaving(true);
      const res = await api.post(`/tebligat/${tebligat.id}/ptt-result`, {
        pttResult: formData.pttResult,
        pttResultDate: formData.pttResultDate,
        pttResultNote: formData.pttResultNote,
        barcodeNo: formData.barcodeNo,
        tk21Type: formData.tk21Type || undefined,
        muhtarlikDate: formData.muhtarlikDate || undefined,
        ilanDate: formData.ilanDate || undefined,
      });

      // Sonraki adım mesajını göster
      if (res.data?.message) {
        alert(res.data.message);
      }

      onSaved();
    } catch (err: any) {
      alert(err.message || "PTT sonucu kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  // Muhtarlığa bırakıldı seçildiğinde ek alanları göster
  const showMuhtarlikFields = 
    formData.pttResult === "MUHTARLIGA_BIRAKILDI" || 
    formData.pttResult === "IMTINA";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold text-lg">PTT Sonucu Gir</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {TebligatTypeLabels[tebligat.tebligatType]} - {tebligat.recipientName}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {/* Mevcut Adres Bilgisi */}
        <div className="mx-4 mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm">
            <span className="font-medium">{AddressTypeLabels[tebligat.addressType]}:</span>{" "}
            {tebligat.addressText}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* PTT Sonucu */}
          <div>
            <label className="block text-sm font-medium mb-1">PTT Sonucu (Şerh) *</label>
            <select
              value={formData.pttResult}
              onChange={(e) => setFormData({ ...formData, pttResult: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
              required
            >
              <option value="">Seçin...</option>
              <optgroup label="Başarılı Teslim">
                <option value="TESLIM_EDILDI">Muhataba Teslim Edildi</option>
                <option value="AYNI_KONUTTA_TESLIM">Aynı Konutta Birlikte Oturana Teslim</option>
                <option value="ISYERINDE_TESLIM">İşyerinde Çalışana Teslim</option>
              </optgroup>
              <optgroup label="Muhtarlığa Bırakıldı">
                <option value="MUHTARLIGA_BIRAKILDI">Muhtarlığa Bırakıldı</option>
                <option value="IMTINA">Tebligatı Almaktan İmtina</option>
              </optgroup>
              <optgroup label="Başarısız">
                <option value="ADRESTE_BULUNAMADI">Muhatap Adreste Bulunamadı</option>
                <option value="TASINMIS">Taşınmış</option>
                <option value="ADRES_YETERSIZ">Adres Yetersiz</option>
                <option value="BINA_YIKILMIS">Bina Yıkılmış</option>
                <option value="ADRES_KAPALI">Adres Kapalı</option>
                <option value="TANIMIYOR">Adreste Tanınmıyor</option>
                <option value="VEFAT">Muhatap Vefat Etmiş</option>
                <option value="DIGER">Diğer</option>
              </optgroup>
            </select>
          </div>

          {/* Sonuç Tarihi */}
          <div>
            <label className="block text-sm font-medium mb-1">Sonuç Tarihi</label>
            <input
              type="date"
              value={formData.pttResultDate}
              onChange={(e) => setFormData({ ...formData, pttResultDate: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Barkod No */}
          <div>
            <label className="block text-sm font-medium mb-1">PTT Barkod No</label>
            <input
              type="text"
              value={formData.barcodeNo}
              onChange={(e) => setFormData({ ...formData, barcodeNo: e.target.value })}
              placeholder="PTT takip numarası"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Muhtarlık Bilgileri */}
          {showMuhtarlikFields && (
            <>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-700 font-medium mb-2">
                  TK 21 Bilgileri
                </p>
                
                {/* TK 21 Türü */}
                <div className="mb-3">
                  <label className="block text-sm mb-1">TK 21 Türü</label>
                  <select
                    value={formData.tk21Type}
                    onChange={(e) => setFormData({ ...formData, tk21Type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Otomatik Belirle</option>
                    <option value="TK_21_1">TK 21/1 (Bilinen adres - aynı gün tebliğ)</option>
                    <option value="TK_21_2">TK 21/2 (MERNİS - ihbar + 15 gün)</option>
                  </select>
                </div>

                {/* Muhtarlık Tarihi */}
                <div className="mb-3">
                  <label className="block text-sm mb-1">Muhtarlığa Bırakılma Tarihi</label>
                  <input
                    type="date"
                    value={formData.muhtarlikDate}
                    onChange={(e) => setFormData({ ...formData, muhtarlikDate: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* İhbar Tarihi (21/2 için) */}
                {tebligat.addressType === "MERNIS" && (
                  <div>
                    <label className="block text-sm mb-1">İhbar Yapıştırma Tarihi (21/2)</label>
                    <input
                      type="date"
                      value={formData.ilanDate}
                      onChange={(e) => setFormData({ ...formData, ilanDate: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-amber-500"
                    />
                    <p className="text-xs text-amber-600 mt-1">
                      Tebliğ edilmiş sayılma tarihi: İhbar + 15 gün
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Açıklama */}
          <div>
            <label className="block text-sm font-medium mb-1">Açıklama</label>
            <textarea
              value={formData.pttResultNote}
              onChange={(e) => setFormData({ ...formData, pttResultNote: e.target.value })}
              placeholder="PTT şerhi açıklaması..."
              rows={2}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Butonlar */}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Kaydediliyor...
                </>
              ) : (
                "Kaydet"
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              İptal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
