"use client";

import React, { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, Save, X, Building2, Car, Loader2 } from "lucide-react";
import { api, CaseCollateral, CollateralType } from "@/lib/api";

interface CollateralFormProps {
  caseId: string;
  onTotalChange?: (total: { estimated: number; mortgage: number }) => void;
}

const COLLATERAL_TYPES: { value: CollateralType; label: string; icon: React.ReactNode }[] = [
  { value: "IPOTEK", label: "Ipotek (Tasinmaz)", icon: <Building2 className="h-4 w-4" /> },
  { value: "TASIT_REHNI", label: "Tasit Rehni", icon: <Car className="h-4 w-4" /> },
  { value: "TICARI_ISLETME_REHNI", label: "Ticari Isletme Rehni", icon: <Building2 className="h-4 w-4" /> },
  { value: "MENKUL_REHNI", label: "Menkul Rehni", icon: <Building2 className="h-4 w-4" /> },
  { value: "DIGER", label: "Diger", icon: <Building2 className="h-4 w-4" /> },
];

const CURRENCIES = [
  { value: "TRY", label: "TL" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
];

const emptyForm = {
  collateralType: "IPOTEK" as CollateralType,
  description: "",
  tapuInfo: "",
  parcelNo: "",
  blockNo: "",
  propertyAddress: "",
  propertyCity: "",
  propertyDistrict: "",
  vehiclePlate: "",
  vehicleInfo: "",
  serialNumber: "",
  estimatedValue: "",
  mortgageAmount: "",
  mortgageRank: "",
  currency: "TRY",
  registrationDate: "",
  registrationNo: "",
  notaryName: "",
  notaryCity: "",
  notes: "",
};

export function CollateralForm({ caseId, onTotalChange }: CollateralFormProps) {
  const [collaterals, setCollaterals] = useState<CaseCollateral[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadCollaterals();
  }, [caseId]);

  const loadCollaterals = async () => {
    try {
      const data = await api.getCollateralsByCase(caseId);
      setCollaterals(data);
      const totalEstimated = data.reduce((sum, c) => sum + (Number(c.estimatedValue) || 0), 0);
      const totalMortgage = data.reduce((sum, c) => sum + (Number(c.mortgageAmount) || 0), 0);
      onTotalChange?.({ estimated: totalEstimated, mortgage: totalMortgage });
    } catch (err) {
      console.error("Teminatlar yuklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description) return;

    setSaving(true);
    try {
      const data = {
        caseId,
        collateralType: form.collateralType,
        description: form.description,
        tapuInfo: form.tapuInfo || undefined,
        parcelNo: form.parcelNo || undefined,
        blockNo: form.blockNo || undefined,
        propertyAddress: form.propertyAddress || undefined,
        propertyCity: form.propertyCity || undefined,
        propertyDistrict: form.propertyDistrict || undefined,
        vehiclePlate: form.vehiclePlate || undefined,
        vehicleInfo: form.vehicleInfo || undefined,
        serialNumber: form.serialNumber || undefined,
        estimatedValue: form.estimatedValue ? parseFloat(form.estimatedValue) : undefined,
        mortgageAmount: form.mortgageAmount ? parseFloat(form.mortgageAmount) : undefined,
        mortgageRank: form.mortgageRank ? parseInt(form.mortgageRank) : undefined,
        currency: form.currency,
        registrationDate: form.registrationDate || undefined,
        registrationNo: form.registrationNo || undefined,
        notaryName: form.notaryName || undefined,
        notaryCity: form.notaryCity || undefined,
        notes: form.notes || undefined,
      };

      if (editingId) {
        await api.updateCollateral(editingId, data);
      } else {
        await api.createCollateral(data as any);
      }
      await loadCollaterals();
      resetForm();
    } catch (err: any) {
      alert(err.message || "Kayit sirasinda hata olustu");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (collateral: CaseCollateral) => {
    setForm({
      collateralType: collateral.collateralType,
      description: collateral.description,
      tapuInfo: collateral.tapuInfo || "",
      parcelNo: collateral.parcelNo || "",
      blockNo: collateral.blockNo || "",
      propertyAddress: collateral.propertyAddress || "",
      propertyCity: collateral.propertyCity || "",
      propertyDistrict: collateral.propertyDistrict || "",
      vehiclePlate: collateral.vehiclePlate || "",
      vehicleInfo: collateral.vehicleInfo || "",
      serialNumber: collateral.serialNumber || "",
      estimatedValue: collateral.estimatedValue?.toString() || "",
      mortgageAmount: collateral.mortgageAmount?.toString() || "",
      mortgageRank: collateral.mortgageRank?.toString() || "",
      currency: collateral.currency,
      registrationDate: collateral.registrationDate?.split("T")[0] || "",
      registrationNo: collateral.registrationNo || "",
      notaryName: collateral.notaryName || "",
      notaryCity: collateral.notaryCity || "",
      notes: collateral.notes || "",
    });
    setEditingId(collateral.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu teminati silmek istediginize emin misiniz?")) return;
    try {
      await api.deleteCollateral(id);
      await loadCollaterals();
    } catch (err: any) {
      alert(err.message || "Silme sirasinda hata olustu");
    }
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(amount);
  };

  const isRealEstate = form.collateralType === "IPOTEK";
  const isVehicle = form.collateralType === "TASIT_REHNI";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Liste */}
      {collaterals.length > 0 && (
        <div className="space-y-2">
          {collaterals.map((col) => (
            <div key={col.id} className="border rounded-lg p-3 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${
                    col.collateralType === "IPOTEK" ? "bg-blue-100 text-blue-600" :
                    col.collateralType === "TASIT_REHNI" ? "bg-amber-100 text-amber-600" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {COLLATERAL_TYPES.find(t => t.value === col.collateralType)?.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{col.description}</span>
                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded">
                        {COLLATERAL_TYPES.find(t => t.value === col.collateralType)?.label}
                      </span>
                      {col.mortgageRank && (
                        <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                          {col.mortgageRank}. Derece
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {col.propertyAddress && <span>{col.propertyAddress}</span>}
                      {col.vehiclePlate && <span>Plaka: {col.vehiclePlate}</span>}
                      {col.tapuInfo && <span className="ml-2">Tapu: {col.tapuInfo}</span>}
                    </div>
                    <div className="flex gap-4 mt-1 text-sm">
                      {col.estimatedValue && (
                        <span>Deger: <strong>{formatCurrency(col.estimatedValue, col.currency)}</strong></span>
                      )}
                      {col.mortgageAmount && (
                        <span>Ipotek/Rehin: <strong className="text-primary">{formatCurrency(col.mortgageAmount, col.currency)}</strong></span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleEdit(col)} className="p-1 hover:bg-gray-100 rounded" title="Duzenle">
                    <Edit2 className="h-4 w-4 text-gray-500" />
                  </button>
                  <button onClick={() => handleDelete(col.id)} className="p-1 hover:bg-red-50 rounded" title="Sil">
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Toplam */}
          <div className="border-t pt-3 flex justify-between items-center text-sm">
            <span className="text-gray-500">Toplam Teminat Degeri:</span>
            <span className="font-bold text-primary">
              {formatCurrency(collaterals.reduce((sum, c) => sum + (Number(c.estimatedValue) || 0), 0), "TRY")}
            </span>
          </div>
        </div>
      )}

      {/* Form */}
      {showForm ? (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 bg-gray-50 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {editingId ? "Teminat Duzenle" : "Yeni Teminat"}
            </h4>
            <button type="button" onClick={resetForm} className="p-1 hover:bg-gray-200 rounded">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Temel Bilgiler */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Teminat Turu *</label>
              <select
                value={form.collateralType}
                onChange={(e) => setForm({ ...form, collateralType: e.target.value as CollateralType })}
                className="w-full px-2 py-1.5 text-sm border rounded"
              >
                {COLLATERAL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Aciklama *</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border rounded"
                placeholder="Teminat aciklamasi"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Derece</label>
              <input
                type="number"
                value={form.mortgageRank}
                onChange={(e) => setForm({ ...form, mortgageRank: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border rounded"
                placeholder="1"
                min="1"
              />
            </div>
          </div>

          {/* Tasinmaz Bilgileri (Ipotek) */}
          {isRealEstate && (
            <div className="border-t pt-3">
              <h5 className="text-xs font-medium text-gray-500 mb-2">Tasinmaz Bilgileri</h5>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tapu Bilgisi</label>
                  <input
                    type="text"
                    value={form.tapuInfo}
                    onChange={(e) => setForm({ ...form, tapuInfo: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                    placeholder="Cilt/Sayfa"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ada No</label>
                  <input
                    type="text"
                    value={form.blockNo}
                    onChange={(e) => setForm({ ...form, blockNo: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Parsel No</label>
                  <input
                    type="text"
                    value={form.parcelNo}
                    onChange={(e) => setForm({ ...form, parcelNo: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Il</label>
                  <input
                    type="text"
                    value={form.propertyCity}
                    onChange={(e) => setForm({ ...form, propertyCity: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ilce</label>
                  <input
                    type="text"
                    value={form.propertyDistrict}
                    onChange={(e) => setForm({ ...form, propertyDistrict: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Adres</label>
                  <input
                    type="text"
                    value={form.propertyAddress}
                    onChange={(e) => setForm({ ...form, propertyAddress: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tasit Bilgileri */}
          {isVehicle && (
            <div className="border-t pt-3">
              <h5 className="text-xs font-medium text-gray-500 mb-2">Tasit Bilgileri</h5>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Plaka</label>
                  <input
                    type="text"
                    value={form.vehiclePlate}
                    onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                    placeholder="34 ABC 123"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Arac Bilgisi</label>
                  <input
                    type="text"
                    value={form.vehicleInfo}
                    onChange={(e) => setForm({ ...form, vehicleInfo: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                    placeholder="Marka, Model, Yil"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Deger Bilgileri */}
          <div className="border-t pt-3">
            <h5 className="text-xs font-medium text-gray-500 mb-2">Deger Bilgileri</h5>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tahmini Deger</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.estimatedValue}
                  onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ipotek/Rehin Tutari</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.mortgageAmount}
                  onChange={(e) => setForm({ ...form, mortgageAmount: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Para Birimi</label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border rounded"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tescil Tarihi</label>
                <input
                  type="date"
                  value={form.registrationDate}
                  onChange={(e) => setForm({ ...form, registrationDate: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border rounded"
                />
              </div>
            </div>
          </div>

          {/* Notlar */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notlar</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border rounded"
              rows={2}
            />
          </div>

          {/* Butonlar */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={resetForm} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100">
              Iptal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {editingId ? "Guncelle" : "Kaydet"}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full py-2 border-2 border-dashed rounded-lg text-sm text-gray-500 hover:border-primary hover:text-primary flex items-center justify-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Teminat Ekle
        </button>
      )}
    </div>
  );
}
