"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2, Send, Loader2, Package, AlertCircle, CheckCircle } from "lucide-react";
import { api, ExpenseItem } from "@/lib/api";

interface ExpenseRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  clientId: string;
  clientName: string;
  caseFileNumber: string;
  executionFileNumber?: string;
  onSuccess?: () => void;
  // Yeni: Otomatik paket seçimi için
  initialPackageCode?: string;
  expenseRequestId?: string; // Mevcut talep düzenleme için
}

interface CostPackage {
  code: string;
  name: string;
  description?: string;
  items: Array<{
    itemCode: string;
    label: string;
    defaultAmount: number;
    isEditable: boolean;
  }>;
}

interface ComputedItem {
  itemCode: string;
  label: string;
  suggestedAmount: number;
  finalAmount: number;
  isEditable: boolean;
  wasOverridden?: boolean;
}

const EXPENSE_TYPES = [
  { value: "TEBLIGAT", label: "Tebligat Gideri" },
  { value: "HACIZ", label: "Haciz Gideri" },
  { value: "SATIS_AVANSI", label: "Satış Avansı" },
  { value: "BILIRKISI", label: "Bilirkişi Ücreti" },
  { value: "KEŞIF", label: "Keşif Gideri" },
  { value: "POSTA", label: "Posta/Kargo" },
  { value: "HARÇ", label: "Harç" },
  { value: "DIGER", label: "Diğer" },
];

export function ExpenseRequestModal({
  isOpen,
  onClose,
  caseId,
  clientId,
  clientName,
  caseFileNumber,
  executionFileNumber,
  onSuccess,
  initialPackageCode,
  expenseRequestId,
}: ExpenseRequestModalProps) {
  // Paket modu vs manuel mod
  const [mode, setMode] = useState<"package" | "manual">(initialPackageCode ? "package" : "manual");
  const [packages, setPackages] = useState<CostPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<string>(initialPackageCode || "");
  const [computedItems, setComputedItems] = useState<ComputedItem[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [computingItems, setComputingItems] = useState(false);

  // Manuel mod için eski state
  const [items, setItems] = useState<ExpenseItem[]>([
    { type: "TEBLIGAT", description: "Tebligat gideri", amount: 0 },
  ]);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setSaving] = useState(false);
  const [sendAfterCreate, setSendAfterCreate] = useState(false);
  const [paidByLawyer, setPaidByLawyer] = useState(false); // Avukat kendisi karşıladı

  // Paketleri yükle
  useEffect(() => {
    if (isOpen) {
      loadPackages();
      // Varsayılan son ödeme tarihi (7 gün sonra)
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 7);
      setDueDate(defaultDate.toISOString().split("T")[0]);
    }
  }, [isOpen]);

  // Paket seçildiğinde hesapla
  useEffect(() => {
    if (selectedPackage && mode === "package") {
      computePackageItems(selectedPackage);
    }
  }, [selectedPackage, mode]);

  const loadPackages = async () => {
    setLoadingPackages(true);
    try {
      console.log('Loading cost packages...');
      const data = await api.getCostPackages();
      console.log('Loaded packages:', data);
      setPackages(data || []);
      
      // initialPackageCode varsa otomatik seç
      if (initialPackageCode) {
        setSelectedPackage(initialPackageCode);
        setMode("package");
      }
    } catch (error: any) {
      console.error("Paketler yüklenemedi:", error);
      alert(`Paket yükleme hatası: ${error.message || 'Bilinmeyen hata'}`);
    } finally {
      setLoadingPackages(false);
    }
  };

  const computePackageItems = async (packageCode: string) => {
    setComputingItems(true);
    try {
      console.log('Computing expense for caseId:', caseId, 'packageCode:', packageCode);
      const result = await api.computeExpenseRequest(caseId, packageCode);
      console.log('Compute result:', result);
      setComputedItems(result.items.map((item: any) => ({
        ...item,
        wasOverridden: false,
      })));
    } catch (error: any) {
      console.error("Masraf hesaplanamadı:", error);
      alert(`Masraf hesaplama hatası: ${error.message || 'Bilinmeyen hata'}`);
    } finally {
      setComputingItems(false);
    }
  };

  const updateComputedItem = (index: number, newAmount: number) => {
    const newItems = [...computedItems];
    const item = newItems[index];
    if (item.isEditable) {
      item.finalAmount = newAmount;
      item.wasOverridden = newAmount !== item.suggestedAmount;
    }
    setComputedItems(newItems);
  };

  // Manuel mod fonksiyonları
  const addItem = () => {
    setItems([...items, { type: "DIGER", description: "", amount: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof ExpenseItem, value: string | number) => {
    const newItems = [...items];
    if (field === "type") {
      newItems[index].type = value as string;
      const typeLabel = EXPENSE_TYPES.find((t) => t.value === value)?.label || "";
      newItems[index].description = typeLabel;
    } else if (field === "amount") {
      newItems[index].amount = Number(value) || 0;
    } else {
      newItems[index].description = value as string;
    }
    setItems(newItems);
  };

  // Toplam hesaplama
  const totalAmount = mode === "package"
    ? computedItems.reduce((sum, item) => sum + item.finalAmount, 0)
    : items.reduce((sum, item) => sum + item.amount, 0);

  const totalSuggested = mode === "package"
    ? computedItems.reduce((sum, item) => sum + item.suggestedAmount, 0)
    : 0;

  const handleSubmit = async () => {
    if (mode === "manual" && items.some((item) => !item.description || item.amount <= 0)) {
      alert("Lütfen tüm kalemleri doldurun");
      return;
    }

    if (mode === "package" && computedItems.length === 0) {
      alert("Lütfen bir paket seçin");
      return;
    }

    setSaving(true);
    try {
      let request;
      
      if (mode === "package") {
        // Paket modunda - yeni API kullan
        request = await api.createExpenseRequestFromPackage({
          caseId,
          clientId,
          packageCode: selectedPackage,
          items: computedItems.map(item => ({
            itemCode: item.itemCode,
            label: item.label,
            suggestedAmount: item.suggestedAmount,
            finalAmount: item.finalAmount,
            wasOverridden: item.wasOverridden,
          })),
          dueDate: dueDate || undefined,
          notes: paidByLawyer 
            ? `${notes ? notes + '\n' : ''}[Avukat tarafından karşılandı - Müvekkilden tahsil edilecek]`
            : notes || undefined,
          sendEmail: !paidByLawyer && sendAfterCreate, // Avukat karşıladıysa mail gönderme
          paidByLawyer, // Avukat karşıladı flag'i
        });
      } else {
        // Manuel mod - eski API
        request = await api.createExpenseRequest({
          caseId,
          clientId,
          items,
          dueDate: dueDate || undefined,
          notes: paidByLawyer 
            ? `${notes ? notes + '\n' : ''}[Avukat tarafından karşılandı - Müvekkilden tahsil edilecek]`
            : notes || undefined,
          paidByLawyer, // Avukat karşıladı flag'i
        });

        if (!paidByLawyer && sendAfterCreate && request.id) {
          await api.sendExpenseRequest(request.id, "EMAIL");
        }
      }

      onSuccess?.();
      onClose();
      
      // Reset form
      setItems([{ type: "TEBLIGAT", description: "Tebligat gideri", amount: 0 }]);
      setComputedItems([]);
      setSelectedPackage("");
      setNotes("");
      setSendAfterCreate(false);
      setPaidByLawyer(false);
    } catch (error: any) {
      alert(error.message || "Masraf talebi oluşturulamadı");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const selectedPkg = packages.find(p => p.code === selectedPackage);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Masraf Talebi Oluştur</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {clientName} • {executionFileNumber || caseFileNumber}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
          
          {/* Kaynak Etiketi */}
          {mode === "package" && selectedPkg && (
            <div className="mt-2 flex items-center gap-2 text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded">
              <Package className="h-3.5 w-3.5" />
              Kaynak: {selectedPkg.name} (Otomatik)
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Mod Seçimi */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode("package")}
              className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                mode === "package"
                  ? "bg-amber-50 border-amber-300 text-amber-800"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Package className="h-4 w-4 inline mr-1.5" />
              Paket Seç
            </button>
            <button
              onClick={() => setMode("manual")}
              className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                mode === "manual"
                  ? "bg-amber-50 border-amber-300 text-amber-800"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Plus className="h-4 w-4 inline mr-1.5" />
              Manuel Giriş
            </button>
          </div>

          {/* Paket Modu */}
          {mode === "package" && (
            <>
              {/* Paket Seçimi */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Masraf Paketi</label>
                <select
                  value={selectedPackage}
                  onChange={(e) => setSelectedPackage(e.target.value)}
                  disabled={loadingPackages}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                >
                  <option value="">Paket seçin...</option>
                  {packages.map((pkg) => (
                    <option key={pkg.code} value={pkg.code}>
                      {pkg.name}
                    </option>
                  ))}
                </select>
                {selectedPkg?.description && (
                  <p className="text-xs text-gray-500 mt-1">{selectedPkg.description}</p>
                )}
              </div>

              {/* Hesaplanan Kalemler */}
              {computingItems ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                  <span className="ml-2 text-sm text-gray-500">Hesaplanıyor...</span>
                </div>
              ) : computedItems.length > 0 ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Masraf Kalemleri</label>
                  <div className="space-y-2">
                    {computedItems.map((item, index) => (
                      <div key={item.itemCode} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-800">{item.label}</div>
                          {item.wasOverridden && (
                            <div className="text-xs text-amber-600 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Öneri: {item.suggestedAmount.toLocaleString("tr-TR")} ₺
                            </div>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            type="number"
                            value={item.finalAmount || ""}
                            onChange={(e) => updateComputedItem(index, Number(e.target.value) || 0)}
                            disabled={!item.isEditable}
                            className={`w-28 border rounded-lg px-3 py-1.5 text-sm text-right focus:ring-2 focus:ring-amber-200 focus:border-amber-400 ${
                              !item.isEditable ? "bg-gray-100 text-gray-500" : ""
                            } ${item.wasOverridden ? "border-amber-400 bg-amber-50" : ""}`}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">₺</span>
                        </div>
                        {item.wasOverridden && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">MANUEL</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : selectedPackage ? (
                <div className="text-center py-4 text-sm text-gray-500">
                  Kalem bulunamadı
                </div>
              ) : null}
            </>
          )}

          {/* Manuel Mod */}
          {mode === "manual" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Masraf Kalemleri</label>
                <button
                  onClick={addItem}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Kalem Ekle
                </button>
              </div>
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <select
                      value={item.type}
                      onChange={(e) => updateItem(index, "type", e.target.value)}
                      className="w-32 border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                    >
                      {EXPENSE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(index, "description", e.target.value)}
                      placeholder="Açıklama"
                      className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                    />
                    <div className="relative">
                      <input
                        type="number"
                        value={item.amount || ""}
                        onChange={(e) => updateItem(index, "amount", e.target.value)}
                        placeholder="0"
                        className="w-24 border rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">₺</span>
                    </div>
                    {items.length > 1 && (
                      <button
                        onClick={() => removeItem(index)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Toplam */}
          <div className="flex items-center justify-between py-3 px-4 bg-amber-50 rounded-lg border border-amber-200">
            <div>
              <span className="font-medium text-amber-800">Toplam Tutar</span>
              {mode === "package" && totalSuggested !== totalAmount && (
                <div className="text-xs text-amber-600">
                  Öneri: {totalSuggested.toLocaleString("tr-TR")} ₺
                </div>
              )}
            </div>
            <span className="text-lg font-bold text-amber-900">
              {totalAmount.toLocaleString("tr-TR")} ₺
            </span>
          </div>

          {/* Son Ödeme Tarihi */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Son Ödeme Tarihi</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
          </div>

          {/* Notlar */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notlar (Opsiyonel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ek açıklama..."
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-none"
            />
          </div>

          {/* Gönderim Seçenekleri */}
          <div className="space-y-2 p-3 bg-gray-50 rounded-lg">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={paidByLawyer}
                onChange={(e) => {
                  setPaidByLawyer(e.target.checked);
                  if (e.target.checked) setSendAfterCreate(false);
                }}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="text-sm text-gray-700">
                <span className="font-medium">Kendim karşıladım</span>
                <span className="text-gray-500 text-xs block">Masraf bakiyeye eklenir, müvekkilden tahsil edilecek olarak işaretlenir</span>
              </span>
            </label>
            
            {!paidByLawyer && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendAfterCreate}
                  onChange={(e) => setSendAfterCreate(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Oluşturduktan sonra müvekkile e-posta gönder</span>
              </label>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t bg-gray-50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || totalAmount <= 0}
            className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : paidByLawyer ? (
              <CheckCircle className="h-4 w-4" />
            ) : sendAfterCreate ? (
              <Send className="h-4 w-4" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            {paidByLawyer ? "Karşıladım & Kaydet" : sendAfterCreate ? "Oluştur ve Gönder" : "Oluştur"}
          </button>
        </div>
      </div>
    </div>
  );
}
