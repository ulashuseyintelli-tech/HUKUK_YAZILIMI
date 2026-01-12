"use client";

import React, { useState, useEffect } from "react";
import {
  Banknote, Plus, X, CheckCircle, Clock, XCircle,
  Calculator, Loader2, ChevronDown, ChevronUp
} from "lucide-react";
import { api } from "@/lib/api";

// Tahsilat Türleri
const CollectionTypeOptions = [
  { value: "CASH", label: "Nakit" },
  { value: "BANK_TRANSFER", label: "Banka Havalesi" },
  { value: "CHECK", label: "Çek" },
  { value: "OTHER", label: "Diğer" },
];

// Tahsilat Kanalları
const ChannelLabels: Record<string, string> = {
  NAKIT: "Nakit",
  BANKA: "Banka",
  CEK: "Çek",
  SENET: "Senet",
  KREDI_KARTI: "Kredi Kartı",
  ICRA_DAIRESI: "İcra Dairesi",
  HACIZ: "Haciz",
  DIGER: "Diğer",
};

const ChannelOptions = [
  { value: "NAKIT", label: "Nakit" },
  { value: "BANKA", label: "Banka Havalesi/EFT" },
  { value: "CEK", label: "Çek" },
  { value: "SENET", label: "Senet" },
  { value: "KREDI_KARTI", label: "Kredi Kartı" },
  { value: "ICRA_DAIRESI", label: "İcra Dairesi" },
  { value: "HACIZ", label: "Haciz" },
  { value: "DIGER", label: "Diğer" },
];

// Tahsilat Kaynakları
const SourceLabels: Record<string, string> = {
  MANUAL: "Manuel",
  EXTERNAL_CASE: "Alacak Haczi",
  THIRD_PARTY: "Üçüncü Şahıs",
  BANK_SEIZURE: "Banka Haczi",
  SALARY_SEIZURE: "Maaş Haczi",
  AUCTION: "Satış/İhale",
  SETTLEMENT: "Sulh",
};

// Durum Renkleri
const StatusColors: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  CONFIRMED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
  REFUNDED: "bg-gray-100 text-gray-600",
};

const StatusLabels: Record<string, string> = {
  PENDING: "Beklemede",
  CONFIRMED: "Onaylandı",
  CANCELLED: "İptal",
  REFUNDED: "İade",
};

// Mahsup Türleri
const AllocationTypeLabels: Record<string, string> = {
  PRINCIPAL: "Ana Para",
  INTEREST: "Faiz",
  EXPENSE: "Masraf",
  FEE: "Harç",
  ATTORNEY_FEE: "Vekalet Ücreti",
  PENALTY: "Ceza/Tazminat",
  OTHER: "Diğer",
};

interface Collection {
  id: string;
  amount: number;
  currency: string;
  type: string;
  channel: string;
  date: string;
  sourceType?: string;
  description?: string;
  receiptNo?: string;
  bankName?: string;
  status: string;
  allocations?: {
    allocationType: string;
    amount: number;
  }[];
}

interface CoverCalculation {
  principalAmount: number;
  principalCurrency: string;
  interestAmount: number;
  expenseAmount: number;
  feeAmount: number;
  attorneyFeeAmount: number;
  otherAmount: number;
  totalClaim: number;
  totalCollected: number;
  collectionDetails: {
    principal: number;
    interest: number;
    expense: number;
    fee: number;
    attorneyFee: number;
    other: number;
  };
  remainingDebt: number;
  calculationDate: string;
}

interface CollectionSummary {
  totalCollected: number;
  totalPending: number;
  collectionCount: number;
  lastCollectionDate?: string;
}

interface CollectionPanelProps {
  caseId: string;
}

export function CollectionPanel({ caseId }: CollectionPanelProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [cover, setCover] = useState<CoverCalculation | null>(null);
  const [summary, setSummary] = useState<CollectionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showCoverDetails, setShowCoverDetails] = useState(false);

  useEffect(() => {
    loadData();
  }, [caseId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [collectionsRes, coverRes, summaryRes] = await Promise.all([
        api.get(`/collections/case/${caseId}`),
        api.get(`/collections/cover/${caseId}`),
        api.get(`/collections/summary?caseId=${caseId}`),
      ]);

      setCollections(collectionsRes.data || []);
      setCover(coverRes.data);
      setSummary(summaryRes.data);
    } catch (err) {
      console.error("Tahsilat verileri yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number, currency: string = "TRY") => {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: currency === "TRY" ? "TRY" : currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="space-y-4">
      {/* Kapak Hesabı Özeti */}
      {cover && (
        <div className="border rounded-lg p-4 bg-gradient-to-r from-indigo-50 to-purple-50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Calculator className="h-5 w-5 text-indigo-500" />
              Kapak Hesabı
            </h3>
            <button
              type="button"
              onClick={() => setShowCoverDetails(!showCoverDetails)}
              className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              {showCoverDetails ? "Gizle" : "Detay"}
              {showCoverDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

          {/* Ana Özet */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="p-3 bg-white rounded-lg shadow-sm">
              <p className="text-xs text-gray-500">Toplam Alacak</p>
              <p className="text-xl font-bold text-gray-800">
                {formatCurrency(cover.totalClaim, cover.principalCurrency)}
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg shadow-sm">
              <p className="text-xs text-emerald-600">Tahsil Edilen</p>
              <p className="text-xl font-bold text-emerald-700">
                {formatCurrency(cover.totalCollected, cover.principalCurrency)}
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg shadow-sm">
              <p className="text-xs text-amber-600">Kalan Borç</p>
              <p className={`text-xl font-bold ${cover.remainingDebt <= 0 ? "text-emerald-700" : "text-amber-700"}`}>
                {formatCurrency(cover.remainingDebt, cover.principalCurrency)}
              </p>
            </div>
          </div>

          {/* Detaylı Görünüm */}
          {showCoverDetails && (
            <div className="border-t pt-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Alacak Kalemleri */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Alacak Kalemleri</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Ana Para:</span>
                      <span>{formatCurrency(cover.principalAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Faiz:</span>
                      <span>{formatCurrency(cover.interestAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Masraf:</span>
                      <span>{formatCurrency(cover.expenseAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Harç:</span>
                      <span>{formatCurrency(cover.feeAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Vekalet Ücreti:</span>
                      <span>{formatCurrency(cover.attorneyFeeAmount)}</span>
                    </div>
                    <div className="flex justify-between font-medium border-t pt-1 mt-1">
                      <span>Toplam:</span>
                      <span>{formatCurrency(cover.totalClaim)}</span>
                    </div>
                  </div>
                </div>

                {/* Tahsilat Dağılımı */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Tahsilat Dağılımı</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Ana Para:</span>
                      <span className="text-emerald-600">{formatCurrency(cover.collectionDetails.principal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Faiz:</span>
                      <span className="text-emerald-600">{formatCurrency(cover.collectionDetails.interest)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Masraf:</span>
                      <span className="text-emerald-600">{formatCurrency(cover.collectionDetails.expense)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Harç:</span>
                      <span className="text-emerald-600">{formatCurrency(cover.collectionDetails.fee)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Vekalet Ücreti:</span>
                      <span className="text-emerald-600">{formatCurrency(cover.collectionDetails.attorneyFee)}</span>
                    </div>
                    <div className="flex justify-between font-medium border-t pt-1 mt-1">
                      <span>Toplam Tahsilat:</span>
                      <span className="text-emerald-700">{formatCurrency(cover.totalCollected)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dosya Kapanış Durumu */}
              {cover.remainingDebt <= 0 && (
                <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Dosya borcu tamamen tahsil edilmiştir!</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tahsilat Listesi */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-500" />
            Tahsilatlar
            {summary && (
              <span className="text-sm font-normal text-gray-500">
                ({summary.collectionCount} adet)
              </span>
            )}
          </h3>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="px-3 py-1.5 bg-emerald-500 text-white text-sm rounded-lg hover:bg-emerald-600 flex items-center gap-1"
          >
            <Plus className="h-4 w-4" /> Tahsilat Ekle
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            Yükleniyor...
          </div>
        ) : collections.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed rounded-lg">
            <Banknote className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">Henüz tahsilat kaydı yok</p>
          </div>
        ) : (
          <div className="space-y-3">
            {[...collections].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((col) => (
              <div key={col.id} className="p-4 border rounded-lg hover:border-emerald-200 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${StatusColors[col.status]}`}>
                      {col.status === "CONFIRMED" ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : col.status === "PENDING" ? (
                        <Clock className="h-5 w-5" />
                      ) : (
                        <XCircle className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-lg">
                        {formatCurrency(col.amount, col.currency)}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                        <span>{new Date(col.date).toLocaleDateString("tr-TR")}</span>
                        <span>•</span>
                        <span>{ChannelLabels[col.channel] || col.channel}</span>
                        {col.sourceType && col.sourceType !== "MANUAL" && (
                          <>
                            <span>•</span>
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                              {SourceLabels[col.sourceType]}
                            </span>
                          </>
                        )}
                      </div>
                      {col.description && (
                        <p className="text-sm text-gray-600 mt-1">{col.description}</p>
                      )}
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-lg text-xs font-medium ${StatusColors[col.status]}`}>
                    {StatusLabels[col.status]}
                  </span>
                </div>

                {/* Mahsup Detayları */}
                {col.allocations && col.allocations.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-gray-500 mb-2">Mahsup Dağılımı:</p>
                    <div className="flex flex-wrap gap-2">
                      {col.allocations.map((alloc, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-gray-100 rounded text-xs"
                        >
                          {AllocationTypeLabels[alloc.allocationType]}: {formatCurrency(alloc.amount)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Yeni Tahsilat Modal */}
      {showNewModal && (
        <NewCollectionModal
          caseId={caseId}
          onClose={() => setShowNewModal(false)}
          onSaved={() => {
            setShowNewModal(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

// ==================== YENİ TAHSİLAT MODAL ====================

interface NewCollectionModalProps {
  caseId: string;
  onClose: () => void;
  onSaved: () => void;
}

function NewCollectionModal({ caseId, onClose, onSaved }: NewCollectionModalProps) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    currency: "TRY",
    type: "BANK_TRANSFER",
    channel: "BANKA",
    date: new Date().toISOString().split("T")[0],
    description: "",
    receiptNo: "",
    bankName: "",
    autoAllocate: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.amount || parseFloat(form.amount) <= 0) {
      alert("Lütfen geçerli bir tutar girin");
      return;
    }

    try {
      setLoading(true);
      await api.post("/collections", {
        caseId,
        amount: parseFloat(form.amount),
        currency: form.currency,
        type: form.type,
        channel: form.channel,
        date: form.date,
        description: form.description || undefined,
        receiptNo: form.receiptNo || undefined,
        bankName: form.bankName || undefined,
        autoAllocate: form.autoAllocate,
      });
      onSaved();
    } catch (err) {
      console.error("Tahsilat kaydedilemedi:", err);
      alert("Tahsilat kaydedilirken bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-500" />
            Yeni Tahsilat
          </h2>
          <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Tutar ve Para Birimi */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tutar *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Para Birimi
              </label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500"
              >
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          {/* Tahsilat Türü ve Kanalı */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tahsilat Türü
              </label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500"
              >
                {CollectionTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tahsilat Kanalı
              </label>
              <select
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500"
              >
                {ChannelOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tarih */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tahsilat Tarihi *
            </label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          {/* Banka Bilgileri (Banka seçiliyse) */}
          {(form.channel === "BANKA" || form.type === "BANK_TRANSFER") && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Banka Adı
              </label>
              <input
                type="text"
                value={form.bankName}
                onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500"
                placeholder="Örn: Ziraat Bankası"
              />
            </div>
          )}

          {/* Makbuz No */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Makbuz / Dekont No
            </label>
            <input
              type="text"
              value={form.receiptNo}
              onChange={(e) => setForm({ ...form, receiptNo: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500"
              placeholder="Opsiyonel"
            />
          </div>

          {/* Açıklama */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Açıklama
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500"
              rows={2}
              placeholder="Opsiyonel açıklama"
            />
          </div>

          {/* Otomatik Mahsup */}
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
            <input
              type="checkbox"
              id="autoAllocate"
              checked={form.autoAllocate}
              onChange={(e) => setForm({ ...form, autoAllocate: e.target.checked })}
              className="h-4 w-4 text-emerald-600 rounded"
            />
            <label htmlFor="autoAllocate" className="text-sm text-gray-700">
              Otomatik mahsup yap (Masraf → Harç → Vekalet → Faiz → Ana Para sırasıyla)
            </label>
          </div>

          {/* Butonlar */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Kaydet
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
