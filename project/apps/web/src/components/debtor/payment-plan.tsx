'use client';

import { useState, useEffect } from 'react';
import { Calendar, DollarSign, Plus, Check, X, AlertTriangle, Clock, Calculator } from 'lucide-react';

interface PaymentInstallment {
  id: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  paidDate?: string;
  status: 'pending' | 'paid' | 'overdue' | 'partial';
}

interface PaymentPlan {
  id: string;
  debtorId: string;
  totalAmount: number;
  installmentCount: number;
  startDate: string;
  installments: PaymentInstallment[];
  createdAt: string;
}

interface PaymentPlanProps {
  debtorId: string;
  totalDebt: number;
}

const STORAGE_KEY = 'paymentPlans';

export function PaymentPlanManager({ debtorId, totalDebt }: PaymentPlanProps) {
  const [plan, setPlan] = useState<PaymentPlan | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ installmentCount: 6, startDate: new Date().toISOString().split('T')[0] });

  useEffect(() => { loadPlan(); }, [debtorId]);

  const loadPlan = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const plans: PaymentPlan[] = JSON.parse(stored);
        const existing = plans.find(p => p.debtorId === debtorId);
        if (existing) setPlan(existing);
      }
    } catch (e) { console.error('Failed to load plan'); }
  };

  const savePlan = (newPlan: PaymentPlan) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const plans: PaymentPlan[] = stored ? JSON.parse(stored) : [];
      const idx = plans.findIndex(p => p.debtorId === debtorId);
      if (idx >= 0) plans[idx] = newPlan;
      else plans.push(newPlan);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
      setPlan(newPlan);
    } catch (e) { console.error('Failed to save plan'); }
  };

  const createPlan = () => {
    const installmentAmount = Math.ceil(totalDebt / form.installmentCount);
    const installments: PaymentInstallment[] = [];
    const start = new Date(form.startDate);

    for (let i = 0; i < form.installmentCount; i++) {
      const dueDate = new Date(start);
      dueDate.setMonth(dueDate.getMonth() + i);
      installments.push({
        id: `${Date.now()}-${i}`,
        dueDate: dueDate.toISOString().split('T')[0],
        amount: i === form.installmentCount - 1 ? totalDebt - (installmentAmount * (form.installmentCount - 1)) : installmentAmount,
        paidAmount: 0,
        status: 'pending'
      });
    }

    const newPlan: PaymentPlan = {
      id: Date.now().toString(), debtorId, totalAmount: totalDebt, installmentCount: form.installmentCount,
      startDate: form.startDate, installments, createdAt: new Date().toISOString()
    };
    savePlan(newPlan);
    setShowForm(false);
  };

  const markAsPaid = (installmentId: string, amount?: number) => {
    if (!plan) return;
    const updated = { ...plan, installments: plan.installments.map(inst => {
      if (inst.id === installmentId) {
        const paidAmount = amount || inst.amount;
        return { ...inst, paidAmount, paidDate: new Date().toISOString().split('T')[0], status: paidAmount >= inst.amount ? 'paid' as const : 'partial' as const };
      }
      return inst;
    })};
    savePlan(updated);
  };

  const formatCurrency = (n: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
  const formatDate = (d: string) => new Date(d).toLocaleDateString('tr-TR');

  const getStatusBadge = (status: PaymentInstallment['status'], dueDate: string) => {
    const isOverdue = new Date(dueDate) < new Date() && status === 'pending';
    if (isOverdue) return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">Gecikmiş</span>;
    if (status === 'paid') return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Ödendi</span>;
    if (status === 'partial') return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">Kısmi</span>;
    return <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">Bekliyor</span>;
  };

  const totalPaid = plan?.installments.reduce((s, i) => s + i.paidAmount, 0) || 0;
  const progress = totalDebt > 0 ? Math.round((totalPaid / totalDebt) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><Calculator className="h-5 w-5" />Ödeme Planı</h3>
        {!plan && <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><Plus className="h-4 w-4" />Plan Oluştur</button>}
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Taksit Sayısı</label>
              <select value={form.installmentCount} onChange={(e) => setForm({ ...form, installmentCount: parseInt(e.target.value) })} className="w-full border rounded-lg px-3 py-2">
                {[3, 6, 9, 12, 18, 24].map(n => <option key={n} value={n}>{n} Taksit</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Başlangıç Tarihi</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
            </div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-sm">
            <p>Toplam Borç: <strong>{formatCurrency(totalDebt)}</strong></p>
            <p>Taksit Tutarı: <strong>{formatCurrency(Math.ceil(totalDebt / form.installmentCount))}</strong></p>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 border rounded-lg hover:bg-gray-50 text-sm">İptal</button>
            <button onClick={createPlan} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Oluştur</button>
          </div>
        </div>
      )}

      {/* Plan Display */}
      {plan && (
        <>
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-gray-500">{plan.installmentCount} Taksit</p>
                <p className="font-bold text-lg">{formatCurrency(totalDebt)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Ödenen</p>
                <p className="font-bold text-lg text-green-600">{formatCurrency(totalPaid)}</p>
              </div>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1 text-right">%{progress} tamamlandı</p>
          </div>

          <div className="space-y-2">
            {plan.installments.map((inst, i) => (
              <div key={inst.id} className={`flex items-center gap-3 p-3 border rounded-lg ${inst.status === 'paid' ? 'bg-green-50' : new Date(inst.dueDate) < new Date() && inst.status === 'pending' ? 'bg-red-50' : ''}`}>
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium">{i + 1}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatCurrency(inst.amount)}</span>
                    {getStatusBadge(inst.status, inst.dueDate)}
                  </div>
                  <p className="text-sm text-gray-500"><Calendar className="h-3 w-3 inline mr-1" />{formatDate(inst.dueDate)}</p>
                </div>
                {inst.status !== 'paid' && (
                  <button onClick={() => markAsPaid(inst.id)} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                    <Check className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
