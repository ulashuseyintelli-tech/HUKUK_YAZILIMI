"use client";

import React, { useState, useEffect } from "react";
import { Home, Save, Loader2, Edit2, Trash2 } from "lucide-react";
import { api, CaseLease, PropertyType, EvictionReason } from "@/lib/api";

interface LeaseFormProps {
  caseId: string;
  onDebtChange?: (debt: { total: number; months: number }) => void;
}

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: "KONUT", label: "Konut" },
  { value: "ISYERI", label: "Isyeri" },
  { value: "ARSA", label: "Arsa" },
  { value: "DIGER", label: "Diger" },
];

const EVICTION_REASONS: { value: EvictionReason; label: string }[] = [
  { value: "KIRA_BORCU", label: "Kira Borcu" },
  { value: "TAHLIYE_TAAHHUTNAMESI", label: "Tahliye Taahhutnamesi" },
  { value: "IHTIYAC", label: "Ihtiyac (Malik/Yakin)" },
  { value: "YENIDEN_INSAAT", label: "Yeniden Insaat/Imar" },
  { value: "DIGER", label: "Diger" },
];

const CURRENCIES = [
  { value: "TRY", label: "TL" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
];

const emptyForm = {
  propertyType: "KONUT" as PropertyType,
  propertyAddress: "",
  propertyCity: "",
  propertyDistrict: "",
  leaseStartDate: "",
  leaseEndDate: "",
  monthlyRent: "",
  rentCurrency: "TRY",
  depositAmount: "",
  evictionReason: "" as EvictionReason | "",
  evictionNoticeDate: "",
  evictionDeadline: "",
  unpaidMonths: "",
  unpaidRentTotal: "",
  lastPaymentDate: "",
  landlordName: "",
  landlordIdentityNo: "",
  tenantName: "",
  tenantIdentityNo: "",
  notes: "",
};

export function LeaseForm({ caseId, onDebtChange }: LeaseFormProps) {
  const [lease, setLease] = useState<CaseLease | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadLease();
  }, [caseId]);

  const loadLease = async () => {
    try {
      const data = await api.getLeaseByCase(caseId);
      if (data) {
        setLease(data);
        setForm({
          propertyType: data.propertyType,
          propertyAddress: data.propertyAddress,
          propertyCity: data.propertyCity || "",
          propertyDistrict: data.propertyDistrict || "",
          leaseStartDate: data.leaseStartDate?.split("T")[0] || "",
          leaseEndDate: data.leaseEndDate?.split("T")[0] || "",
          monthlyRent: data.monthlyRent?.toString() || "",
          rentCurrency: data.rentCurrency || "TRY",
          depositAmount: data.depositAmount?.toString() || "",
          evictionReason: data.evictionReason || "",
          evictionNoticeDate: data.evictionNoticeDate?.split("T")[0] || "",
          evictionDeadline: data.evictionDeadline?.split("T")[0] || "",
          unpaidMonths: data.unpaidMonths?.toString() || "",
          unpaidRentTotal: data.unpaidRentTotal?.toString() || "",
          lastPaymentDate: data.lastPaymentDate?.split("T")[0] || "",
          landlordName: data.landlordName || "",
          landlordIdentityNo: data.landlordIdentityNo || "",
          tenantName: data.tenantName || "",
          tenantIdentityNo: data.tenantIdentityNo || "",
          notes: data.notes || "",
        });
        onDebtChange?.({ total: Number(data.unpaidRentTotal) || 0, months: data.unpaidMonths || 0 });
      } else {
        setEditing(true);
      }
    } catch (err) {
      console.error("Kira sozlesmesi yuklenemedi:", err);
      setEditing(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.propertyAddress || !form.leaseStartDate || !form.monthlyRent) return;

    setSaving(true);
    try {
      const data = {
        caseId,
        propertyType: form.propertyType,
        propertyAddress: form.propertyAddress,
        propertyCity: form.propertyCity || undefined,
        propertyDistrict: form.propertyDistrict || undefined,
        leaseStartDate: form.leaseStartDate,
        leaseEndDate: form.leaseEndDate || undefined,
        monthlyRent: parseFloat(form.monthlyRent),
        rentCurrency: form.rentCurrency,
        depositAmount: form.depositAmount ? parseFloat(form.depositAmount) : undefined,
        evictionReason: form.evictionReason || undefined,
        evictionNoticeDate: form.evictionNoticeDate || undefined,
        evictionDeadline: form.evictionDeadline || undefined,
        unpaidMonths: form.unpaidMonths ? parseInt(form.unpaidMonths) : undefined,
        unpaidRentTotal: form.unpaidRentTotal ? parseFloat(form.unpaidRentTotal) : undefined,
        lastPaymentDate: form.lastPaymentDate || undefined,
        landlordName: form.landlordName || undefined,
        landlordIdentityNo: form.landlordIdentityNo || undefined,
        tenantName: form.tenantName || undefined,
        tenantIdentityNo: form.tenantIdentityNo || undefined,
        notes: form.notes || undefined,
      };

      if (lease) {
        await api.updateLease(lease.id, data);
      } else {
        await api.createLease(data as any);
      }
      await loadLease();
      setEditing(false);
    } catch (err: any) {
      alert(err.message || "Kayit sirasinda hata olustu");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!lease || !confirm("Kira sozlesmesini silmek istediginize emin misiniz?")) return;
    try {
      await api.deleteLease(lease.id);
      setLease(null);
      setForm(emptyForm);
      setEditing(true);
      onDebtChange?.({ total: 0, months: 0 });
    } catch (err: any) {
      alert(err.message || "Silme sirasinda hata olustu");
    }
  };

  // Odenmemis ay sayisi degistiginde toplami hesapla
  const handleUnpaidMonthsChange = (months: string) => {
    setForm(prev => {
      const monthCount = parseInt(months) || 0;
      const rent = parseFloat(prev.monthlyRent) || 0;
      return {
        ...prev,
        unpaidMonths: months,
        unpaidRentTotal: (monthCount * rent).toString(),
      };
    });
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // Goruntuleme modu
  if (lease && !editing) {
    return (
      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium flex items-center gap-2">
            <Home className="h-4 w-4" />
            Kira Sozlesmesi
          </h4>
          <div className="flex gap-1">
            <button onClick={() => setEditing(true)} className="p-1.5 hover:bg-gray-100 rounded" title="Duzenle">
              <Edit2 className="h-4 w-4 text-gray-500" />
            </button>
            <button onClick={handleDelete} className="p-1.5 hover:bg-red-50 rounded" title="Sil">
              <Trash2 className="h-4 w-4 text-red-500" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Tasinmaz Turu:</span>
            <p className="font-medium">{PROPERTY_TYPES.find(t => t.value === lease.propertyType)?.label}</p>
          </div>
          <div className="col-span-2">
            <span className="text-gray-500">Adres:</span>
            <p className="font-medium">{lease.propertyAddress}</p>
          </div>
          <div>
            <span className="text-gray-500">Kira Baslangici:</span>
            <p className="font-medium">{new Date(lease.leaseStartDate).toLocaleDateString("tr-TR")}</p>
          </div>
          <div>
            <span className="text-gray-500">Aylik Kira:</span>
            <p className="font-medium">{formatCurrency(lease.monthlyRent, lease.rentCurrency)}</p>
          </div>
          {lease.unpaidMonths && (
            <div>
              <span className="text-gray-500">Odenmemis Ay:</span>
              <p className="font-medium text-red-600">{lease.unpaidMonths} ay</p>
            </div>
          )}
          {lease.unpaidRentTotal && (
            <div>
              <span className="text-gray-500">Toplam Borc:</span>
              <p className="font-bold text-red-600">{formatCurrency(lease.unpaidRentTotal, lease.rentCurrency)}</p>
            </div>
          )}
          {lease.evictionReason && (
            <div>
              <span className="text-gray-500">Tahliye Nedeni:</span>
              <p className="font-medium">{EVICTION_REASONS.find(r => r.value === lease.evictionReason)?.label}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Duzenleme modu
  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 bg-gray-50 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium flex items-center gap-2">
          <Home className="h-4 w-4" />
          {lease ? "Kira Sozlesmesi Duzenle" : "Kira Sozlesmesi Ekle"}
        </h4>
      </div>

      {/* Tasinmaz Bilgileri */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tasinmaz Turu *</label>
          <select
            value={form.propertyType}
            onChange={(e) => setForm({ ...form, propertyType: e.target.value as PropertyType })}
            className="w-full px-2 py-1.5 text-sm border rounded"
          >
            {PROPERTY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
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
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Adres *</label>
        <input
          type="text"
          value={form.propertyAddress}
          onChange={(e) => setForm({ ...form, propertyAddress: e.target.value })}
          className="w-full px-2 py-1.5 text-sm border rounded"
          placeholder="Tam adres"
          required
        />
      </div>

      {/* Sozlesme Bilgileri */}
      <div className="border-t pt-3">
        <h5 className="text-xs font-medium text-gray-500 mb-2">Sozlesme Bilgileri</h5>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Baslangic Tarihi *</label>
            <input
              type="date"
              value={form.leaseStartDate}
              onChange={(e) => setForm({ ...form, leaseStartDate: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border rounded"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Bitis Tarihi</label>
            <input
              type="date"
              value={form.leaseEndDate}
              onChange={(e) => setForm({ ...form, leaseEndDate: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border rounded"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Aylik Kira *</label>
            <input
              type="number"
              step="0.01"
              value={form.monthlyRent}
              onChange={(e) => setForm({ ...form, monthlyRent: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border rounded"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Para Birimi</label>
            <select
              value={form.rentCurrency}
              onChange={(e) => setForm({ ...form, rentCurrency: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border rounded"
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Borc Bilgileri */}
      <div className="border-t pt-3">
        <h5 className="text-xs font-medium text-gray-500 mb-2">Borc Bilgileri</h5>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Odenmemis Ay Sayisi</label>
            <input
              type="number"
              value={form.unpaidMonths}
              onChange={(e) => handleUnpaidMonthsChange(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border rounded"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Toplam Borc</label>
            <input
              type="number"
              step="0.01"
              value={form.unpaidRentTotal}
              onChange={(e) => setForm({ ...form, unpaidRentTotal: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border rounded bg-gray-100"
              readOnly
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Son Odeme Tarihi</label>
            <input
              type="date"
              value={form.lastPaymentDate}
              onChange={(e) => setForm({ ...form, lastPaymentDate: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border rounded"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Depozito</label>
            <input
              type="number"
              step="0.01"
              value={form.depositAmount}
              onChange={(e) => setForm({ ...form, depositAmount: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border rounded"
            />
          </div>
        </div>
      </div>

      {/* Tahliye Bilgileri */}
      <div className="border-t pt-3">
        <h5 className="text-xs font-medium text-gray-500 mb-2">Tahliye Bilgileri</h5>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tahliye Nedeni</label>
            <select
              value={form.evictionReason}
              onChange={(e) => setForm({ ...form, evictionReason: e.target.value as EvictionReason })}
              className="w-full px-2 py-1.5 text-sm border rounded"
            >
              <option value="">Seciniz</option>
              {EVICTION_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ihtar Tarihi</label>
            <input
              type="date"
              value={form.evictionNoticeDate}
              onChange={(e) => setForm({ ...form, evictionNoticeDate: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border rounded"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tahliye Suresi</label>
            <input
              type="date"
              value={form.evictionDeadline}
              onChange={(e) => setForm({ ...form, evictionDeadline: e.target.value })}
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
        {lease && (
          <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100">
            Iptal
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Kaydet
        </button>
      </div>
    </form>
  );
}
