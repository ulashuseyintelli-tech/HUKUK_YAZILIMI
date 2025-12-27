"use client";

import React, { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, Save, X, FileText, Loader2 } from "lucide-react";
import { api, CaseInstrument, InstrumentType } from "@/lib/api";

interface InstrumentFormProps {
  caseId: string;
  instrumentType?: "CEK" | "SENET";
  onTotalChange?: (total: number) => void;
}

const INSTRUMENT_TYPES: { value: InstrumentType; label: string }[] = [
  { value: "CEK", label: "Cek" },
  { value: "SENET", label: "Senet" },
  { value: "BONO", label: "Bono" },
  { value: "POLICE", label: "Police" },
];

const CURRENCIES = [
  { value: "TRY", label: "TL" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
];

const emptyForm = {
  instrumentType: "CEK" as InstrumentType,
  serialNo: "",
  issueDate: "",
  maturityDate: "",
  amount: "",
  currency: "TRY",
  bankName: "",
  branchName: "",
  accountNo: "",
  checkNo: "",
  drawerName: "",
  drawerIdentityNo: "",
  endorserName: "",
  endorserIdentityNo: "",
  issuerName: "",
  issuerIdentityNo: "",
  issuerAddress: "",
  payeeName: "",
  payeeIdentityNo: "",
  guarantorName: "",
  guarantorIdentityNo: "",
  protestDate: "",
  protestNo: "",
  notes: "",
};

export function InstrumentForm({ caseId, instrumentType, onTotalChange }: InstrumentFormProps) {
  const [instruments, setInstruments] = useState<CaseInstrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, instrumentType: instrumentType || "CEK" });

  useEffect(() => {
    loadInstruments();
  }, [caseId]);

  const loadInstruments = async () => {
    try {
      const data = await api.getInstrumentsByCase(caseId);
      setInstruments(data);
      const total = data.reduce((sum, i) => sum + Number(i.amount), 0);
      onTotalChange?.(total);
    } catch (err) {
      console.error("Kambiyo senetleri yuklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.serialNo || !form.maturityDate || !form.amount) return;

    setSaving(true);
    try {
      if (editingId) {
        await api.updateInstrument(editingId, {
          ...form,
          amount: parseFloat(form.amount),
        });
      } else {
        await api.createInstrument({
          caseId,
          ...form,
          amount: parseFloat(form.amount),
        } as any);
      }
      await loadInstruments();
      resetForm();
    } catch (err: any) {
      alert(err.message || "Kayit sirasinda hata olustu");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (instrument: CaseInstrument) => {
    setForm({
      instrumentType: instrument.instrumentType,
      serialNo: instrument.serialNo,
      issueDate: instrument.issueDate?.split("T")[0] || "",
      maturityDate: instrument.maturityDate?.split("T")[0] || "",
      amount: instrument.amount.toString(),
      currency: instrument.currency,
      bankName: instrument.bankName || "",
      branchName: instrument.branchName || "",
      accountNo: instrument.accountNo || "",
      checkNo: instrument.checkNo || "",
      drawerName: instrument.drawerName || "",
      drawerIdentityNo: instrument.drawerIdentityNo || "",
      endorserName: instrument.endorserName || "",
      endorserIdentityNo: instrument.endorserIdentityNo || "",
      issuerName: instrument.issuerName || "",
      issuerIdentityNo: instrument.issuerIdentityNo || "",
      issuerAddress: instrument.issuerAddress || "",
      payeeName: instrument.payeeName || "",
      payeeIdentityNo: instrument.payeeIdentityNo || "",
      guarantorName: instrument.guarantorName || "",
      guarantorIdentityNo: instrument.guarantorIdentityNo || "",
      protestDate: instrument.protestDate?.split("T")[0] || "",
      protestNo: instrument.protestNo || "",
      notes: instrument.notes || "",
    });
    setEditingId(instrument.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu kaydi silmek istediginize emin misiniz?")) return;
    try {
      await api.deleteInstrument(id);
      await loadInstruments();
    } catch (err: any) {
      alert(err.message || "Silme sirasinda hata olustu");
    }
  };

  const resetForm = () => {
    setForm({ ...emptyForm, instrumentType: instrumentType || "CEK" });
    setEditingId(null);
    setShowForm(false);
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(amount);
  };

  const isCheck = form.instrumentType === "CEK";

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
      {instruments.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Tur</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Seri No</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Vade</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Tutar</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">Islem</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {instruments.map((inst) => (
                <tr key={inst.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      inst.instrumentType === "CEK" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {INSTRUMENT_TYPES.find(t => t.value === inst.instrumentType)?.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{inst.serialNo}</td>
                  <td className="px-3 py-2">{new Date(inst.maturityDate).toLocaleDateString("tr-TR")}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatCurrency(inst.amount, inst.currency)}</td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => handleEdit(inst)} className="p-1 hover:bg-gray-100 rounded" title="Duzenle">
                      <Edit2 className="h-4 w-4 text-gray-500" />
                    </button>
                    <button onClick={() => handleDelete(inst.id)} className="p-1 hover:bg-red-50 rounded ml-1" title="Sil">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={3} className="px-3 py-2 text-right font-medium">Toplam:</td>
                <td className="px-3 py-2 text-right font-bold text-primary">
                  {formatCurrency(instruments.reduce((sum, i) => sum + Number(i.amount), 0), "TRY")}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Form */}
      {showForm ? (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 bg-gray-50 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {editingId ? "Kambiyo Senedi Duzenle" : "Yeni Kambiyo Senedi"}
            </h4>
            <button type="button" onClick={resetForm} className="p-1 hover:bg-gray-200 rounded">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Temel Bilgiler */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tur *</label>
              <select
                value={form.instrumentType}
                onChange={(e) => setForm({ ...form, instrumentType: e.target.value as InstrumentType })}
                className="w-full px-2 py-1.5 text-sm border rounded"
              >
                {INSTRUMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Seri No *</label>
              <input
                type="text"
                value={form.serialNo}
                onChange={(e) => setForm({ ...form, serialNo: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border rounded"
                placeholder="ABC123456"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Duzenleme Tarihi</label>
              <input
                type="date"
                value={form.issueDate}
                onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vade Tarihi *</label>
              <input
                type="date"
                value={form.maturityDate}
                onChange={(e) => setForm({ ...form, maturityDate: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border rounded"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tutar *</label>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border rounded"
                placeholder="10000.00"
                required
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Protesto Tarihi</label>
              <input
                type="date"
                value={form.protestDate}
                onChange={(e) => setForm({ ...form, protestDate: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Protesto No</label>
              <input
                type="text"
                value={form.protestNo}
                onChange={(e) => setForm({ ...form, protestNo: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border rounded"
              />
            </div>
          </div>

          {/* Cek Bilgileri */}
          {isCheck && (
            <div className="border-t pt-3">
              <h5 className="text-xs font-medium text-gray-500 mb-2">Cek Bilgileri</h5>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Banka</label>
                  <input
                    type="text"
                    value={form.bankName}
                    onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sube</label>
                  <input
                    type="text"
                    value={form.branchName}
                    onChange={(e) => setForm({ ...form, branchName: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hesap No</label>
                  <input
                    type="text"
                    value={form.accountNo}
                    onChange={(e) => setForm({ ...form, accountNo: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cek No</label>
                  <input
                    type="text"
                    value={form.checkNo}
                    onChange={(e) => setForm({ ...form, checkNo: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kesideci Adi</label>
                  <input
                    type="text"
                    value={form.drawerName}
                    onChange={(e) => setForm({ ...form, drawerName: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kesideci TC/VKN</label>
                  <input
                    type="text"
                    value={form.drawerIdentityNo}
                    onChange={(e) => setForm({ ...form, drawerIdentityNo: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ciranta Adi</label>
                  <input
                    type="text"
                    value={form.endorserName}
                    onChange={(e) => setForm({ ...form, endorserName: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ciranta TC/VKN</label>
                  <input
                    type="text"
                    value={form.endorserIdentityNo}
                    onChange={(e) => setForm({ ...form, endorserIdentityNo: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Senet Bilgileri */}
          {!isCheck && (
            <div className="border-t pt-3">
              <h5 className="text-xs font-medium text-gray-500 mb-2">Senet Bilgileri</h5>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Borclu Adi</label>
                  <input
                    type="text"
                    value={form.issuerName}
                    onChange={(e) => setForm({ ...form, issuerName: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Borclu TC/VKN</label>
                  <input
                    type="text"
                    value={form.issuerIdentityNo}
                    onChange={(e) => setForm({ ...form, issuerIdentityNo: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Borclu Adresi</label>
                  <input
                    type="text"
                    value={form.issuerAddress}
                    onChange={(e) => setForm({ ...form, issuerAddress: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Alacakli Adi</label>
                  <input
                    type="text"
                    value={form.payeeName}
                    onChange={(e) => setForm({ ...form, payeeName: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Alacakli TC/VKN</label>
                  <input
                    type="text"
                    value={form.payeeIdentityNo}
                    onChange={(e) => setForm({ ...form, payeeIdentityNo: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kefil Adi</label>
                  <input
                    type="text"
                    value={form.guarantorName}
                    onChange={(e) => setForm({ ...form, guarantorName: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kefil TC/VKN</label>
                  <input
                    type="text"
                    value={form.guarantorIdentityNo}
                    onChange={(e) => setForm({ ...form, guarantorIdentityNo: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border rounded"
                  />
                </div>
              </div>
            </div>
          )}

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
          {instrumentType === "CEK" ? "Cek Ekle" : instrumentType === "SENET" ? "Senet Ekle" : "Kambiyo Senedi Ekle"}
        </button>
      )}
    </div>
  );
}
