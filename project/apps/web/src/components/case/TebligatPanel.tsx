"use client";

import React, { useState, useEffect } from "react";
import { 
  Mail, Send, CheckCircle, XCircle, Clock, AlertTriangle, 
  Plus, RefreshCw, Loader2, ChevronDown, ChevronUp, Search,
  FileText, MapPin, Building2, Smartphone
} from "lucide-react";
import { 
  api, Tebligat, TebligatType, TebligatAddressType, TebligatChannel, 
  TebligatStatus, TebligatPttResult, TebligatSummary, PttTrackingResult 
} from "@/lib/api";

interface TebligatPanelProps {
  caseId: string;
  caseDebtorId?: string;
  readOnly?: boolean;
  onTebligatChange?: () => void;
}

const TEBLIGAT_TYPES: { value: TebligatType; label: string }[] = [
  { value: "ODEME_EMRI", label: "Odeme Emri" },
  { value: "ICRA_EMRI", label: "Icra Emri" },
  { value: "TAHLIYE_EMRI", label: "Tahliye Emri" },
  { value: "HACIZ_IHBARNAMESI_89_1", label: "89/1 Haciz Ihbarnamesi" },
  { value: "HACIZ_IHBARNAMESI_89_2", label: "89/2 Haciz Ihbarnamesi" },
  { value: "HACIZ_IHBARNAMESI_89_3", label: "89/3 Haciz Ihbarnamesi" },
  { value: "SATIS_ILANI", label: "Satis Ilani" },
  { value: "KIYMET_TAKDIRI", label: "Kiymet Takdiri" },
  { value: "DIGER", label: "Diger" },
];

const ADDRESS_TYPES: { value: TebligatAddressType; label: string; icon: React.ReactNode }[] = [
  { value: "BILINEN", label: "Bilinen Adres", icon: <MapPin className="h-4 w-4" /> },
  { value: "MERNIS", label: "MERNİS Adresi", icon: <Building2 className="h-4 w-4" /> },
  { value: "TICARET_SICIL", label: "Ticaret Sicil", icon: <Building2 className="h-4 w-4" /> },
  { value: "KEP", label: "KEP Adresi", icon: <Smartphone className="h-4 w-4" /> },
  { value: "VERGI_DAIRESI", label: "Vergi Dairesi", icon: <Building2 className="h-4 w-4" /> },
];

const CHANNELS: { value: TebligatChannel; label: string }[] = [
  { value: "PTT", label: "PTT" },
  { value: "KEP", label: "KEP" },
  { value: "UETS", label: "UETS" },
  { value: "ILANEN", label: "Ilanen" },
  { value: "ELDEN", label: "Elden" },
];

const PTT_RESULTS: { value: TebligatPttResult; label: string; color: string }[] = [
  { value: "TESLIM_EDILDI", label: "Teslim Edildi", color: "green" },
  { value: "AYNI_KONUTTA_TESLIM", label: "Ayni Konutta Teslim", color: "green" },
  { value: "ISYERINDE_TESLIM", label: "Isyerinde Teslim", color: "green" },
  { value: "ADRESTE_BULUNAMADI", label: "Adreste Bulunamadi", color: "red" },
  { value: "TASINMIS", label: "Tasinmis", color: "red" },
  { value: "ADRES_YETERSIZ", label: "Adres Yetersiz", color: "red" },
  { value: "BINA_YIKILMIS", label: "Bina Yikilmis", color: "red" },
  { value: "ADRES_KAPALI", label: "Adres Kapali", color: "amber" },
  { value: "IMTINA", label: "Imtina (Almak Istemedi)", color: "amber" },
  { value: "MUHTARLIGA_BIRAKILDI", label: "Muhtarliga Birakildi", color: "blue" },
  { value: "VEFAT", label: "Vefat", color: "gray" },
  { value: "TANIMIYOR", label: "Tanimiyor", color: "red" },
  { value: "DIGER", label: "Diger", color: "gray" },
];

const STATUS_COLORS: Record<TebligatStatus, string> = {
  HAZIRLANDI: "bg-gray-100 text-gray-700",
  GONDERILDI: "bg-blue-100 text-blue-700",
  TESLIM_EDILDI: "bg-green-100 text-green-700",
  IADE_GELDI: "bg-red-100 text-red-700",
  MUHTARLIGA_BIRAKILDI: "bg-amber-100 text-amber-700",
  TEBLIG_EDILMIS_SAYILDI: "bg-purple-100 text-purple-700",
  IPTAL: "bg-gray-200 text-gray-500",
};

const STATUS_LABELS: Record<TebligatStatus, string> = {
  HAZIRLANDI: "Hazirlandi",
  GONDERILDI: "Gonderildi",
  TESLIM_EDILDI: "Teslim Edildi",
  IADE_GELDI: "Iade Geldi",
  MUHTARLIGA_BIRAKILDI: "Muhtarliga Birakildi",
  TEBLIG_EDILMIS_SAYILDI: "Teblig Edilmis Sayildi",
  IPTAL: "Iptal",
};

export function TebligatPanel({ caseId, caseDebtorId, readOnly = false, onTebligatChange }: TebligatPanelProps) {
  const [tebligatlar, setTebligatlar] = useState<Tebligat[]>([]);
  const [summary, setSummary] = useState<TebligatSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedTebligat, setSelectedTebligat] = useState<Tebligat | null>(null);
  const [showPttResult, setShowPttResult] = useState(false);
  const [trackingResult, setTrackingResult] = useState<PttTrackingResult | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Form state
  const [form, setForm] = useState({
    tebligatType: "ODEME_EMRI" as TebligatType,
    addressType: "BILINEN" as TebligatAddressType,
    addressText: "",
    city: "",
    district: "",
    recipientName: "",
    recipientTcVkn: "",
    channel: "PTT" as TebligatChannel,
    notes: "",
  });

  // PTT sonucu form
  const [pttForm, setPttForm] = useState({
    pttResult: "" as TebligatPttResult | "",
    pttResultDate: new Date().toISOString().split("T")[0],
    pttResultNote: "",
    barcodeNo: "",
  });

  useEffect(() => {
    loadData();
  }, [caseId, caseDebtorId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tebligatData, summaryData] = await Promise.all([
        caseDebtorId 
          ? api.getTebligatsByCaseDebtor(caseDebtorId)
          : api.getTebligatsByCase(caseId),
        api.getTebligatSummary(caseId),
      ]);
      setTebligatlar(tebligatData);
      setSummary(summaryData);
    } catch (err) {
      console.error("Tebligat verileri yuklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (!form.addressText || !form.recipientName) return;

    try {
      await api.createTebligat({
        caseId,
        caseDebtorId,
        ...form,
      } as any);
      await loadData();
      setShowForm(false);
      resetForm();
      onTebligatChange?.();
    } catch (err: any) {
      alert(err.message || "Tebligat olusturulamadi");
    }
  };

  const handleSend = async (tebligat: Tebligat) => {
    const barcodeNo = prompt("Barkod numarasi girin (opsiyonel):");
    try {
      await api.markTebligatAsSent(tebligat.id, barcodeNo || undefined);
      await loadData();
      onTebligatChange?.();
    } catch (err: any) {
      alert(err.message || "Gonderim islemi basarisiz");
    }
  };

  const handleRecordPttResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTebligat || !pttForm.pttResult) return;

    try {
      const result = await api.recordPttResult(selectedTebligat.id, {
        pttResult: pttForm.pttResult,
        pttResultDate: pttForm.pttResultDate,
        pttResultNote: pttForm.pttResultNote,
        barcodeNo: pttForm.barcodeNo || undefined,
      });
      
      alert(result.message);
      await loadData();
      setShowPttResult(false);
      setSelectedTebligat(null);
      resetPttForm();
      onTebligatChange?.();
    } catch (err: any) {
      alert(err.message || "PTT sonucu kaydedilemedi");
    }
  };

  const handleTrackBarcode = async (barcodeNo: string) => {
    if (!barcodeNo) return;
    
    setTrackingLoading(true);
    try {
      const result = await api.trackPttBarcode(barcodeNo);
      setTrackingResult(result);
    } catch (err: any) {
      alert(err.message || "Barkod sorgulanamadi");
    } finally {
      setTrackingLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      tebligatType: "ODEME_EMRI",
      addressType: "BILINEN",
      addressText: "",
      city: "",
      district: "",
      recipientName: "",
      recipientTcVkn: "",
      channel: "PTT",
      notes: "",
    });
  };

  const resetPttForm = () => {
    setPttForm({
      pttResult: "",
      pttResultDate: new Date().toISOString().split("T")[0],
      pttResultNote: "",
      barcodeNo: "",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Ozet Kartlari */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-gray-700">{summary.total}</div>
            <div className="text-xs text-gray-500">Toplam</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-600">{summary.gonderilen}</div>
            <div className="text-xs text-blue-600">Gonderildi</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{summary.teslimEdilen}</div>
            <div className="text-xs text-green-600">Teslim Edildi</div>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-red-600">{summary.iadeGelen}</div>
            <div className="text-xs text-red-600">Iade Geldi</div>
          </div>
        </div>
      )}

      {/* Tebligat Listesi */}
      {tebligatlar.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Tur</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Alici</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Adres Tipi</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Kanal</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">Durum</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">Islem</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tebligatlar.map((teb) => (
                <tr key={teb.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <span className="text-xs">{TEBLIGAT_TYPES.find(t => t.value === teb.tebligatType)?.label}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-sm">{teb.recipientName}</div>
                    <div className="text-xs text-gray-500 truncate max-w-[200px]">{teb.addressText}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs">{ADDRESS_TYPES.find(a => a.value === teb.addressType)?.label}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs">{teb.channel}</span>
                    {teb.barcodeNo && (
                      <div className="text-xs text-gray-400 font-mono">{teb.barcodeNo}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[teb.status]}`}>
                      {STATUS_LABELS[teb.status]}
                    </span>
                    {teb.nextAction && teb.nextAction !== "TEBLIG_TAMAMLANDI" && (
                      <div className="text-xs text-amber-600 mt-1">
                        {teb.nextAction === "MERNIS_TEBLIGAT" && "→ MERNİS'e git"}
                        {teb.nextAction === "ILANEN_TEBLIGAT" && "→ Ilanen tebligat"}
                        {teb.nextAction === "BEKLE" && "⏳ Bekliyor"}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {teb.status === "HAZIRLANDI" && (
                        <button
                          onClick={() => handleSend(teb)}
                          className="p-1 hover:bg-blue-50 rounded text-blue-600"
                          title="Gonder"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      )}
                      {teb.status === "GONDERILDI" && (
                        <button
                          onClick={() => { setSelectedTebligat(teb); setShowPttResult(true); setPttForm(prev => ({ ...prev, barcodeNo: teb.barcodeNo || "" })); }}
                          className="p-1 hover:bg-green-50 rounded text-green-600"
                          title="PTT Sonucu Gir"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                      )}
                      {teb.barcodeNo && (
                        <button
                          onClick={() => handleTrackBarcode(teb.barcodeNo!)}
                          className="p-1 hover:bg-gray-100 rounded text-gray-600"
                          title="Barkod Sorgula"
                        >
                          <Search className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Yeni Tebligat Formu */}
      {showForm && !readOnly ? (
        <form onSubmit={handleCreate} className="border rounded-lg p-4 bg-gray-50 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Yeni Tebligat
            </h4>
            <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tebligat Turu *</label>
              <select
                value={form.tebligatType}
                onChange={(e) => setForm({ ...form, tebligatType: e.target.value as TebligatType })}
                className="w-full px-2 py-1.5 text-sm border rounded"
              >
                {TEBLIGAT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Adres Tipi *</label>
              <select
                value={form.addressType}
                onChange={(e) => setForm({ ...form, addressType: e.target.value as TebligatAddressType })}
                className="w-full px-2 py-1.5 text-sm border rounded"
              >
                {ADDRESS_TYPES.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Kanal *</label>
              <select
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value as TebligatChannel })}
                className="w-full px-2 py-1.5 text-sm border rounded"
              >
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Alici Adi *</label>
              <input
                type="text"
                value={form.recipientName}
                onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border rounded"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">TC/VKN</label>
              <input
                type="text"
                value={form.recipientTcVkn}
                onChange={(e) => setForm({ ...form, recipientTcVkn: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border rounded"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Adres *</label>
            <textarea
              value={form.addressText}
              onChange={(e) => setForm({ ...form, addressText: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border rounded"
              rows={2}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Il</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ilce</label>
              <input
                type="text"
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border rounded"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100">
              Iptal
            </button>
            <button type="submit" className="px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-primary/90">
              Olustur
            </button>
          </div>
        </form>
      ) : readOnly ? (
        <div className="w-full py-2 border rounded-lg text-sm text-gray-500 flex items-center justify-center gap-2 bg-gray-50">
          Pasif kayit: yeni tebligat kapali.
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-2 border-2 border-dashed rounded-lg text-sm text-gray-500 hover:border-primary hover:text-primary flex items-center justify-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Yeni Tebligat
        </button>
      )}

      {/* PTT Sonucu Modal */}
      {showPttResult && selectedTebligat && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h4 className="font-medium mb-4">PTT Sonucu Kaydet</h4>
            <form onSubmit={handleRecordPttResult} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sonuc *</label>
                <select
                  value={pttForm.pttResult}
                  onChange={(e) => setPttForm({ ...pttForm, pttResult: e.target.value as TebligatPttResult })}
                  className="w-full px-2 py-1.5 text-sm border rounded"
                  required
                >
                  <option value="">Seciniz</option>
                  {PTT_RESULTS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tarih</label>
                <input
                  type="date"
                  value={pttForm.pttResultDate}
                  onChange={(e) => setPttForm({ ...pttForm, pttResultDate: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Barkod No</label>
                <input
                  type="text"
                  value={pttForm.barcodeNo}
                  onChange={(e) => setPttForm({ ...pttForm, barcodeNo: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Not</label>
                <textarea
                  value={pttForm.pttResultNote}
                  onChange={(e) => setPttForm({ ...pttForm, pttResultNote: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border rounded"
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setShowPttResult(false); setSelectedTebligat(null); }} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100">
                  Iptal
                </button>
                <button type="submit" className="px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-primary/90">
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barkod Sorgulama Sonucu */}
      {trackingResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium">PTT Takip Sonucu</h4>
              <button onClick={() => setTrackingResult(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Barkod:</span>
                <span className="font-mono">{trackingResult.barcodeNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Durum:</span>
                <span className="font-medium">{trackingResult.status}</span>
              </div>
              {trackingResult.deliveryDate && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Teslim Tarihi:</span>
                  <span>{new Date(trackingResult.deliveryDate).toLocaleDateString("tr-TR")}</span>
                </div>
              )}
              <div className="border-t pt-3">
                <h5 className="text-sm font-medium mb-2">Hareketler</h5>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {trackingResult.events.map((event, i) => (
                    <div key={i} className="text-xs border-l-2 border-gray-200 pl-3 py-1">
                      <div className="font-medium">{event.status}</div>
                      <div className="text-gray-500">{event.location} - {new Date(event.date).toLocaleString("tr-TR")}</div>
                      <div className="text-gray-400">{event.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setTrackingResult(null)} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100">
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
