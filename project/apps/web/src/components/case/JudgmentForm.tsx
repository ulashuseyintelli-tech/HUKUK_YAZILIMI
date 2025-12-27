"use client";

import React, { useState, useEffect } from "react";
import { Scale, Save, Loader2, Edit2, Trash2 } from "lucide-react";
import { api, CaseJudgment, NafakaType } from "@/lib/api";

interface JudgmentFormProps {
  caseId: string;
  onTotalChange?: (total: number) => void;
}

const NAFAKA_TYPES: { value: NafakaType; label: string }[] = [
  { value: "YOKSULLUK", label: "Yoksulluk Nafakasi" },
  { value: "ISTIRAK", label: "Istirak Nafakasi" },
  { value: "TEDBIR", label: "Tedbir Nafakasi" },
  { value: "DIGER", label: "Diger" },
];

const CURRENCIES = [
  { value: "TRY", label: "TL" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
];

const emptyForm = {
  courtName: "",
  courtCity: "",
  courtType: "",
  caseNo: "",
  decisionNo: "",
  decisionDate: "",
  finalizationDate: "",
  finalizationNote: "",
  judgmentAmount: "",
  judgmentSummary: "",
  currency: "TRY",
  interestRate: "",
  interestStartDate: "",
  requiresFinalization: false,
  isFinalized: false,
  nafakaType: "" as NafakaType | "",
  monthlyNafaka: "",
  nafakaStartDate: "",
  notes: "",
};

export function JudgmentForm({ caseId, onTotalChange }: JudgmentFormProps) {
  const [judgment, setJudgment] = useState<CaseJudgment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { loadJudgment(); }, [caseId]);

  const loadJudgment = async () => {
    try {
      const data = await api.getJudgmentByCase(caseId);
      if (data) {
        setJudgment(data);
        setForm({
          courtName: data.courtName,
          courtCity: data.courtCity || "",
          courtType: data.courtType || "",
          caseNo: data.caseNo || "",
          decisionNo: data.decisionNo || "",
          decisionDate: data.decisionDate?.split("T")[0] || "",
          finalizationDate: data.finalizationDate?.split("T")[0] || "",
          finalizationNote: data.finalizationNote || "",
          judgmentAmount: data.judgmentAmount?.toString() || "",
          judgmentSummary: data.judgmentSummary || "",
          currency: data.currency || "TRY",
          interestRate: data.interestRate?.toString() || "",
          interestStartDate: data.interestStartDate?.split("T")[0] || "",
          requiresFinalization: data.requiresFinalization || false,
          isFinalized: data.isFinalized || false,
          nafakaType: data.nafakaType || "",
          monthlyNafaka: data.monthlyNafaka?.toString() || "",
          nafakaStartDate: data.nafakaStartDate?.split("T")[0] || "",
          notes: data.notes || "",
        });
        onTotalChange?.(Number(data.judgmentAmount) || 0);
      } else {
        setEditing(true);
      }
    } catch (err) {
      console.error("Ilam yuklenemedi:", err);
      setEditing(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.courtName || !form.decisionDate) return;

    setSaving(true);
    try {
      const data = {
        caseId,
        courtName: form.courtName,
        courtCity: form.courtCity || undefined,
        courtType: form.courtType || undefined,
        caseNo: form.caseNo || undefined,
        decisionNo: form.decisionNo || undefined,
        decisionDate: form.decisionDate,
        finalizationDate: form.finalizationDate || undefined,
        finalizationNote: form.finalizationNote || undefined,
        judgmentAmount: form.judgmentAmount ? parseFloat(form.judgmentAmount) : undefined,
        judgmentSummary: form.judgmentSummary || undefined,
        currency: form.currency,
        interestRate: form.interestRate ? parseFloat(form.interestRate) : undefined,
        interestStartDate: form.interestStartDate || undefined,
        requiresFinalization: form.requiresFinalization,
        isFinalized: form.isFinalized,
        nafakaType: form.nafakaType || undefined,
        monthlyNafaka: form.monthlyNafaka ? parseFloat(form.monthlyNafaka) : undefined,
        nafakaStartDate: form.nafakaStartDate || undefined,
        notes: form.notes || undefined,
      };

      if (judgment) {
        await api.updateJudgment(judgment.id, data);
      } else {
        await api.createJudgment(data as any);
      }
      await loadJudgment();
      setEditing(false);
    } catch (err: any) {
      alert(err.message || "Kayit sirasinda hata olustu");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!judgment || !confirm("Ilami silmek istediginize emin misiniz?")) return;
    try {
      await api.deleteJudgment(judgment.id);
      setJudgment(null);
      setForm(emptyForm);
      setEditing(true);
      onTotalChange?.(0);
    } catch (err: any) {
      alert(err.message || "Silme sirasinda hata olustu");
    }
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
  if (judgment && !editing) {
    return (
      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Mahkeme Ilami
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
          <div className="col-span-2">
            <span className="text-gray-500">Mahkeme:</span>
            <p className="font-medium">{judgment.courtName} {judgment.courtCity && `(${judgment.courtCity})`}</p>
          </div>
          {judgment.caseNo && (
            <div>
              <span className="text-gray-500">Esas No:</span>
              <p className="font-medium">{judgment.caseNo}</p>
            </div>
          )}
          <div>
            <span className="text-gray-500">Karar Tarihi:</span>
            <p className="font-medium">{new Date(judgment.decisionDate).toLocaleDateString("tr-TR")}</p>
          </div>
          {judgment.finalizationDate && (
            <div>
              <span className="text-gray-500">Kesinlesme:</span>
              <p className="font-medium">{new Date(judgment.finalizationDate).toLocaleDateString("tr-TR")}</p>
            </div>
          )}
          {judgment.judgmentAmount && (
            <div>
              <span className="text-gray-500">Hukmedilen Tutar:</span>
              <p className="font-medium">{formatCurrency(judgment.judgmentAmount, judgment.currency)}</p>
            </div>
          )}
          {judgment.nafakaType && (
            <>
              <div>
                <span className="text-gray-500">Nafaka Turu:</span>
                <p className="font-medium">{NAFAKA_TYPES.find(t => t.value === judgment.nafakaType)?.label}</p>
              </div>
              <div>
                <span className="text-gray-500">Aylik Nafaka:</span>
                <p className="font-medium text-primary">{formatCurrency(judgment.monthlyNafaka || 0, judgment.currency)}</p>
              </div>
            </>
          )}
        </div>

        {judgment.judgmentAmount && (
          <div className="border-t pt-3 flex justify-between items-center">
            <span className="text-gray-500">Toplam Ilam Tutari:</span>
            <span className="text-lg font-bold text-primary">
              {formatCurrency(Number(judgment.judgmentAmount) || 0, judgment.currency)}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Duzenleme modu
  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 bg-gray-50 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium flex items-center gap-2">
          <Scale className="h-4 w-4" />
          {judgment ? "Ilam Duzenle" : "Ilam Ekle"}
        </h4>
      </div>

      {/* Mahkeme Bilgileri */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Mahkeme Adi *</label>
          <input
            type="text"
            value={form.courtName}
            onChange={(e) => setForm({ ...form, courtName: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border rounded"
            placeholder="Istanbul 1. Asliye Hukuk Mahkemesi"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Il</label>
          <input
            type="text"
            value={form.courtCity}
            onChange={(e) => setForm({ ...form, courtCity: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border rounded"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Mahkeme Turu</label>
          <input
            type="text"
            value={form.courtType}
            onChange={(e) => setForm({ ...form, courtType: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border rounded"
            placeholder="Asliye Hukuk"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Esas No</label>
          <input
            type="text"
            value={form.caseNo}
            onChange={(e) => setForm({ ...form, caseNo: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border rounded"
            placeholder="2024/1234"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Karar No</label>
          <input
            type="text"
            value={form.decisionNo}
            onChange={(e) => setForm({ ...form, decisionNo: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border rounded"
            placeholder="2024/5678"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Karar Tarihi *</label>
          <input
            type="date"
            value={form.decisionDate}
            onChange={(e) => setForm({ ...form, decisionDate: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border rounded"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Kesinlesme Tarihi</label>
          <input
            type="date"
            value={form.finalizationDate}
            onChange={(e) => setForm({ ...form, finalizationDate: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border rounded"
          />
        </div>
      </div>

      {/* Tutar Bilgileri */}
      <div className="border-t pt-3">
        <h5 className="text-xs font-medium text-gray-500 mb-2">Tutar Bilgileri</h5>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Hukmedilen Tutar</label>
            <input
              type="number"
              step="0.01"
              value={form.judgmentAmount}
              onChange={(e) => setForm({ ...form, judgmentAmount: e.target.value })}
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Faiz Orani (%)</label>
            <input
              type="number"
              step="0.01"
              value={form.interestRate}
              onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border rounded"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Faiz Baslangici</label>
            <input
              type="date"
              value={form.interestStartDate}
              onChange={(e) => setForm({ ...form, interestStartDate: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border rounded"
            />
          </div>
        </div>
      </div>

      {/* Nafaka Bilgileri */}
      <div className="border-t pt-3">
        <h5 className="text-xs font-medium text-gray-500 mb-2">Nafaka Bilgileri (Varsa)</h5>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nafaka Turu</label>
            <select
              value={form.nafakaType}
              onChange={(e) => setForm({ ...form, nafakaType: e.target.value as NafakaType })}
              className="w-full px-2 py-1.5 text-sm border rounded"
            >
              <option value="">Seciniz</option>
              {NAFAKA_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Aylik Nafaka</label>
            <input
              type="number"
              step="0.01"
              value={form.monthlyNafaka}
              onChange={(e) => setForm({ ...form, monthlyNafaka: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border rounded"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Baslangic</label>
            <input
              type="date"
              value={form.nafakaStartDate}
              onChange={(e) => setForm({ ...form, nafakaStartDate: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border rounded"
            />
          </div>
        </div>
      </div>

      {/* Notlar */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Hukum Ozeti / Notlar</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="w-full px-2 py-1.5 text-sm border rounded"
          rows={2}
        />
      </div>

      {/* Butonlar */}
      <div className="flex justify-end gap-2 pt-2 border-t">
        {judgment && (
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
