"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";

const DUE_TYPES = [
  { value: "PRINCIPAL", label: "Ana Para (Asıl Alacak)" },
  { value: "INTEREST", label: "Faiz" },
  { value: "EXPENSE", label: "Masraf" },
  { value: "VEKALET_UCRETI", label: "Vekalet Ücreti" },
  { value: "HARC", label: "Harç" },
  { value: "TAZMINAT", label: "Tazminat" },
  { value: "CEZAI_SART", label: "Cezai Şart" },
  { value: "NAFAKA", label: "Nafaka" },
  { value: "KIRA", label: "Kira Alacağı" },
  { value: "AIDAT", label: "Aidat" },
  { value: "KOMISYON", label: "Komisyon" },
  { value: "PRIM", label: "Prim/İkramiye" },
  { value: "OTHER", label: "Diğer" },
];

const INTEREST_TYPES = [
  { value: "YASAL", label: "Yasal Faiz (%24)" },
  { value: "TICARI_DEGISEN", label: "Ticari Faiz - TCMB Avans (Değişken)" },
  { value: "TICARI_SABIT", label: "Ticari Faiz - Sabit Oran" },
  { value: "OZEL", label: "Özel Oran (Sözleşme)" },
];

interface DueModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  due?: any; // Edit mode
  onSuccess: () => void;
}

export function DueModal({ isOpen, onClose, caseId, due, onSuccess }: DueModalProps) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    type: "PRINCIPAL",
    description: "",
    amount: "",
    dueDate: new Date().toISOString().split("T")[0],
    currency: "TRY",
    interestType: "YASAL", // Default: Yasal Faiz
  });

  useEffect(() => {
    if (due) {
      setForm({
        type: due.type || "PRINCIPAL",
        description: due.description || "",
        amount: due.amount?.toString() || "",
        dueDate: due.dueDate ? new Date(due.dueDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        currency: due.currency || "TRY",
        interestType: due.interestType || "YASAL",
      });
    } else {
      setForm({
        type: "PRINCIPAL",
        description: "",
        amount: "",
        dueDate: new Date().toISOString().split("T")[0],
        currency: "TRY",
        interestType: "YASAL",
      });
    }
  }, [due, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || !form.type) return;

    setLoading(true);
    try {
      const data = {
        type: form.type as any,
        description: form.description || undefined,
        amount: parseFloat(form.amount),
        dueDate: form.dueDate,
        currency: form.currency,
        interestType: form.type === 'PRINCIPAL' ? form.interestType : undefined,
      };

      if (due?.id) {
        await api.updateDue(caseId, due.id, data);
      } else {
        await api.createDue(caseId, data);
      }
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Kaydetme hatası:", error);
      alert(`Kaydetme başarısız: ${error?.message || 'Bilinmeyen hata'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!due?.id) return;
    if (!confirm("Bu alacak kalemini silmek istediğinize emin misiniz?")) return;

    setDeleting(true);
    try {
      await api.deleteDue(caseId, due.id);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Silme hatası:", error);
      alert(`Silme başarısız: ${error?.message || 'Bilinmeyen hata'}`);
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-gray-900">
            {due ? "Alacak Kalemi Düzenle" : "Yeni Alacak Kalemi"}
          </h3>
          <div className="flex items-center gap-2">
            {due?.id && (
              <button 
                onClick={handleDelete} 
                disabled={deleting}
                className="text-red-500 hover:text-red-700 p-1"
                title="Sil"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tür *</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {DUE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Açıklama</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Opsiyonel açıklama"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tutar *</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => {
                  // Sadece rakam, nokta ve virgül kabul et
                  const value = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                  setForm({ ...form, amount: value });
                }}
                placeholder="0.00"
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Para Birimi</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="TRY">₺ TRY</option>
                <option value="USD">$ USD</option>
                <option value="EUR">€ EUR</option>
                <option value="GBP">£ GBP</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Vade Tarihi</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Faiz Türü - Sadece Ana Para için göster */}
          {form.type === 'PRINCIPAL' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Faiz Türü
                <span className="text-gray-400 font-normal ml-1">(Takip öncesi/sonrası faiz hesabında kullanılır)</span>
              </label>
              <select
                value={form.interestType}
                onChange={(e) => setForm({ ...form, interestType: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {INTEREST_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-1">
                {form.interestType === 'YASAL' && 'Genel haciz takiplerinde varsayılan faiz türü'}
                {form.interestType === 'TICARI_DEGISEN' && 'Çek/Senet takiplerinde ve ticari ilişkilerde kullanılır'}
                {form.interestType === 'TICARI_SABIT' && 'Sözleşmede belirlenmiş sabit ticari faiz oranı'}
                {form.interestType === 'OZEL' && 'Sözleşmede belirlenmiş özel faiz oranı'}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading || !form.amount}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {due ? "Güncelle" : "Ekle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
