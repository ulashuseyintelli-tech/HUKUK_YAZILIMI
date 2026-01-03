"use client";

import { useState } from "react";
import { Plus, Receipt, CreditCard, ListTodo, AlertTriangle, CheckCircle2, Clock, Bell, RefreshCw, FileText } from "lucide-react";

// Types
interface ClaimItem {
  id: string;
  type: string;
  description?: string;
  amount: number;
  currency: string;
}

interface Payment {
  id: string;
  amount: number;
  currency: string;
  paymentDate: string;
  paymentType: string;
  status: string;
}

interface Task {
  id: string;
  title: string;
  type: string;
  dueDate?: string;
  status: 'PENDING' | 'COMPLETED' | 'OVERDUE';
  isAutomatic?: boolean;
}

interface OperationalRowProps {
  claimItems?: ClaimItem[];
  payments?: Payment[];
  tasks?: Task[];
  principalAmount?: number;
  interestAmount?: number;
  expenseAmount?: number;
  totalAmount?: number;
  collectedAmount?: number;
  currency?: string;
  onAddClaimItem?: () => void;
  onAddPayment?: () => void;
  onAddTask?: () => void;
  onClaimItemClick?: (item: ClaimItem) => void;
  onPaymentClick?: (payment: Payment) => void;
  onTaskClick?: (task: Task) => void;
}

// Format currency
function formatCurrency(amount: number, currency: string = "TRY"): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Format date
function formatDate(date: string): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("tr-TR");
}

// Claim type labels
const claimTypeLabels: Record<string, string> = {
  PRINCIPAL: "Asıl Alacak",
  INTEREST: "Faiz",
  EXPENSE: "Masraf",
  COURT_FEE: "Harç",
  LAWYER_FEE: "Vekalet Ücreti",
  OTHER: "Diğer",
};

// Task type labels
const taskTypeLabels: Record<string, string> = {
  NOTIFICATION: "Tebligat",
  RENEWAL: "Yenileme",
  SEIZURE: "Haciz",
  PAYMENT_ORDER: "Ödeme Emri",
  OBJECTION: "İtiraz",
  OTHER: "Diğer",
};

// Task status styles
const taskStatusStyles: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  PENDING: { bg: "bg-amber-50", text: "text-amber-700", icon: <Clock className="w-3 h-3" /> },
  COMPLETED: { bg: "bg-emerald-50", text: "text-emerald-700", icon: <CheckCircle2 className="w-3 h-3" /> },
  OVERDUE: { bg: "bg-red-50", text: "text-red-700", icon: <AlertTriangle className="w-3 h-3" /> },
};

export function OperationalRow({
  claimItems = [],
  payments = [],
  tasks = [],
  principalAmount = 0,
  interestAmount = 0,
  expenseAmount = 0,
  totalAmount = 0,
  collectedAmount = 0,
  currency = "TRY",
  onAddClaimItem,
  onAddPayment,
  onAddTask,
  onClaimItemClick,
  onPaymentClick,
  onTaskClick,
}: OperationalRowProps) {
  const pendingTasks = tasks.filter(t => t.status === 'PENDING' || t.status === 'OVERDUE');
  const overdueTasks = tasks.filter(t => t.status === 'OVERDUE');

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 border-t border-b border-slate-200">
      {/* Alacak Kalemleri */}
      <div className="bg-white rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-medium text-slate-700">Alacak Kalemleri</h3>
          </div>
          {onAddClaimItem && (
            <button
              onClick={onAddClaimItem}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
            >
              <Plus className="w-3 h-3" /> Ekle
            </button>
          )}
        </div>

        {/* Summary */}
        <div className="space-y-1 mb-3 pb-3 border-b border-slate-100">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Asıl:</span>
            <span className="font-medium text-slate-700">{formatCurrency(principalAmount, currency)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Faiz:</span>
            <span className="font-medium text-slate-700">{formatCurrency(interestAmount, currency)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Masraf:</span>
            <span className="font-medium text-slate-700">{formatCurrency(expenseAmount, currency)}</span>
          </div>
          <div className="flex justify-between text-xs pt-1 border-t border-slate-100">
            <span className="text-slate-600 font-medium">Toplam:</span>
            <span className="font-semibold text-slate-800">{formatCurrency(totalAmount || (principalAmount + interestAmount + expenseAmount), currency)}</span>
          </div>
        </div>

        {/* Items List */}
        <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
          {claimItems.slice(0, 5).map((item) => (
            <button
              key={item.id}
              onClick={() => onClaimItemClick?.(item)}
              className="w-full text-left p-1.5 rounded hover:bg-slate-50 transition-colors flex items-center justify-between text-xs"
            >
              <span className="text-slate-600 truncate">{claimTypeLabels[item.type] || item.type}</span>
              <span className="font-medium text-slate-700">{formatCurrency(item.amount, item.currency)}</span>
            </button>
          ))}
          {claimItems.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">Kalem yok</p>
          )}
          {claimItems.length > 5 && (
            <p className="text-xs text-blue-600 text-center">+{claimItems.length - 5} daha</p>
          )}
        </div>
      </div>

      {/* Ödemeler */}
      <div className="bg-white rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-medium text-slate-700">Ödemeler</h3>
          </div>
          {onAddPayment && (
            <button
              onClick={onAddPayment}
              className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700"
            >
              <Plus className="w-3 h-3" /> Tahsilat
            </button>
          )}
        </div>

        {/* Summary */}
        <div className="mb-3 pb-3 border-b border-slate-100">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Tahsil Edilen:</span>
            <span className="font-semibold text-emerald-600">{formatCurrency(collectedAmount, currency)}</span>
          </div>
          {totalAmount > 0 && (
            <div className="mt-1.5">
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (collectedAmount / totalAmount) * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 text-right">
                %{Math.round((collectedAmount / totalAmount) * 100)} tahsil
              </p>
            </div>
          )}
        </div>

        {/* Payments List */}
        <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
          {payments.slice(0, 5).map((payment) => (
            <button
              key={payment.id}
              onClick={() => onPaymentClick?.(payment)}
              className="w-full text-left p-1.5 rounded hover:bg-slate-50 transition-colors flex items-center justify-between text-xs"
            >
              <span className="text-slate-500">{formatDate(payment.paymentDate)}</span>
              <span className="font-medium text-emerald-600">+{formatCurrency(payment.amount, payment.currency)}</span>
            </button>
          ))}
          {payments.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">Henüz ödeme yok</p>
          )}
          {payments.length > 5 && (
            <p className="text-xs text-emerald-600 text-center">+{payments.length - 5} daha</p>
          )}
        </div>
      </div>

      {/* Yapılacak İşler */}
      <div className="bg-white rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ListTodo className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-medium text-slate-700">Yapılacak İşler</h3>
            {overdueTasks.length > 0 && (
              <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-medium rounded">
                {overdueTasks.length} Gecikmiş
              </span>
            )}
          </div>
          {onAddTask && (
            <button
              onClick={onAddTask}
              className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700"
            >
              <Plus className="w-3 h-3" /> Ekle
            </button>
          )}
        </div>

        {/* Tasks List */}
        <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
          {pendingTasks.map((task) => {
            const style = taskStatusStyles[task.status] || taskStatusStyles.PENDING;
            return (
              <button
                key={task.id}
                onClick={() => onTaskClick?.(task)}
                className={`w-full text-left p-2 rounded ${style.bg} transition-colors flex items-center gap-2`}
              >
                <span className={style.text}>{style.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${style.text} truncate`}>
                    {task.title || taskTypeLabels[task.type] || task.type}
                  </p>
                  {task.dueDate && (
                    <p className="text-[10px] text-slate-500">{formatDate(task.dueDate)}</p>
                  )}
                </div>
                {task.isAutomatic && (
                  <span title="Otomatik">
                    <RefreshCw className="w-3 h-3 text-slate-400" />
                  </span>
                )}
              </button>
            );
          })}
          {pendingTasks.length === 0 && (
            <div className="text-center py-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-200 mx-auto mb-1" />
              <p className="text-xs text-slate-400">Bekleyen iş yok</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
