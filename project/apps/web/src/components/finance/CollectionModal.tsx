"use client";

import { useState, useEffect } from "react";
import { X, Loader2, XCircle } from "lucide-react";
import { api } from "@/lib/api";

const COLLECTION_TYPES = [
  { value: "TAHSILAT", label: "Tahsilat" },
  { value: "FERAGAT", label: "Feragat" },
  { value: "MAHSUP", label: "Mahsup" },
  { value: "SULH", label: "Sulh" },
  { value: "IADE", label: "İade" },
];

const COLLECTION_CHANNELS = [
  { value: "NAKIT", label: "Nakit" },
  { value: "BANKA", label: "Havale/EFT" },
  { value: "CEK", label: "Çek" },
  { value: "SENET", label: "Senet" },
  { value: "KREDI_KARTI", label: "Kredi Kartı" },
  { value: "ICRA_DAIRESI", label: "İcra Dairesinden" },
  { value: "HACIZ", label: "Haciz Yoluyla" },
  { value: "DIGER", label: "Diğer" },
];

interface CollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  collection?: any;
  onSuccess: () => void;
}

export function CollectionModal({ isOpen, onClose, caseId, collection, onSuccess }: CollectionModalProps) {
  const [loading, setLoading] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [form, setForm] = useState({
    type: "TAHSILAT",
    channel: "BANKA",
    description: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    currency: "TRY",
  });

  useEffect(() => {
    if (collection) {
      setForm({
        type: collection.type || "TAHSILAT",
        channel: collection.channel || "BANKA",
        description: collection.description || "",
        amount: collection.amount?.toString() || "",
        date: collection.date 
          ? new Date(collection.date).toISOString().split("T")[0] 
          : new Date().toISOString().split("T")[0],
        currency: collection.currency || "TRY",
      });
    } else {
      setForm({
        type: "TAHSILAT",
        channel: "BANKA",
        description: "",
        amount: "",
        date: new Date().toISOString().split("T")[0],
        currency: "TRY",
      });
    }
  }, [collection, isOpen]);

  const collectionStatus = String(collection?.status || "").toUpperCase();
  const dispositionStatus = String(
    collection?.accountingDispositionStatus || collection?.dispositionStatus || "",
  ).toUpperCase();
  const isDraftCollection = ["PENDING", "DRAFT"].includes(collectionStatus);
  const isCancelledCollection = collectionStatus === "CANCELLED";
  const isPostedCollection = dispositionStatus === "POSTED";


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || !form.type) return;
    if (isCancelledCollection) return;

    setLoading(true);
    try {
      const data = {
        type: form.type as any,
        channel: form.channel as any,
        description: form.description || undefined,
        amount: parseFloat(form.amount),
        date: form.date,
        currency: form.currency,
      };

      if (collection?.id) {
        await api.updateCollection(caseId, collection.id, data);
      } else {
        await api.createCollection(caseId, data);
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



  const handleCancel = async () => {
    if (!collection?.id || isDraftCollection || isCancelledCollection) return;

    const reason = window.prompt("Tahsilatı iptal etme sebebini yazın:");
    if (reason === null) return;

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      alert("İptal sebebi girilmeden tahsilat iptal edilemez.");
      return;
    }

    const confirmMessage = isPostedCollection
      ? "Bu tahsilat muhasebe/posting etkisi içeriyor; iptal sonrası manuel muhasebe takibi gerekebilir. Devam edilsin mi?"
      : "Bu tahsilatı iptal etmek istediğinize emin misiniz?";

    if (!confirm(confirmMessage)) return;

    setCanceling(true);
    try {
      await api.cancelCollection(caseId, collection.id, trimmedReason);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("İptal hatası:", error);
      alert(`İptal başarısız: ${error?.message || "Bilinmeyen hata"}`);
    } finally {
      setCanceling(false);
    }
  };
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-gray-900">
            {collection ? "Ödeme Düzenle" : "Yeni Ödeme"}
          </h3>
          <div className="flex items-center gap-2">
            {collection?.id && !isDraftCollection && !isCancelledCollection && (
              <button
                onClick={handleCancel}
                disabled={canceling}
                className="text-amber-600 hover:text-amber-800 p-1 disabled:opacity-50"
                title="Tahsilatı İptal Et"
              >
                {canceling ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {isDraftCollection && !isCancelledCollection && (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              Taslak tahsilat silme bu sürümde devre dışı; ayrı void/discard akışı gerekiyor.
            </div>
          )}
          {isCancelledCollection && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <p>
                İptal edildi
                {collection?.cancelledAt ? ` (${new Date(collection.cancelledAt).toLocaleString("tr-TR")})` : ""}
              </p>
              {collection?.cancelReason && <p className="mt-1">Sebep: {collection.cancelReason}</p>}
            </div>
          )}
          {isPostedCollection && !isCancelledCollection && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Bu tahsilat muhasebe/posting etkisi içeriyor; iptal sonrası manuel muhasebe takibi gerekebilir.
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tür *</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            >
              {COLLECTION_TYPES.map((t) => (
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
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
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
                  const value = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                  setForm({ ...form, amount: value });
                }}
                placeholder="0.00"
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Para Birimi</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="TRY">₺ TRY</option>
                <option value="USD">$ USD</option>
                <option value="EUR">€ EUR</option>
                <option value="GBP">£ GBP</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Kanal *</label>
              <select
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                {COLLECTION_CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tarih *</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 cursor-pointer"
                style={{ colorScheme: 'light' }}
              />
            </div>
          </div>

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
              disabled={loading || !form.amount || isCancelledCollection}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {collection ? "Güncelle" : "Ekle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
