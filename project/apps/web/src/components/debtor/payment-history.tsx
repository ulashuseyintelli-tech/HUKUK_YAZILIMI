"use client";

import { useState } from "react";
import { CreditCard, Banknote, Building2, Wallet, Search, Download, Calendar } from "lucide-react";

interface Payment {
  id: string;
  date: string;
  amount: number;
  method: "NAKIT" | "HAVALE" | "KREDI_KARTI" | "CEK";
  receiptNo: string;
  caseNo: string;
  note?: string;
}

const methodLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  NAKIT: { label: "Nakit", icon: <Banknote className="w-4 h-4" />, color: "bg-green-100 text-green-700" },
  HAVALE: { label: "Havale/EFT", icon: <Building2 className="w-4 h-4" />, color: "bg-blue-100 text-blue-700" },
  KREDI_KARTI: { label: "Kredi Kartı", icon: <CreditCard className="w-4 h-4" />, color: "bg-purple-100 text-purple-700" },
  CEK: { label: "Çek", icon: <Wallet className="w-4 h-4" />, color: "bg-orange-100 text-orange-700" },
};

const mockPayments: Payment[] = [
  { id: "1", date: "2025-12-10", amount: 5000, method: "HAVALE", receiptNo: "MKB-2025-001", caseNo: "2025/1234" },
  { id: "2", date: "2025-12-05", amount: 2500, method: "NAKIT", receiptNo: "MKB-2025-002", caseNo: "2025/1234" },
  { id: "3", date: "2025-11-28", amount: 10000, method: "KREDI_KARTI", receiptNo: "MKB-2025-003", caseNo: "2025/5678" },
  { id: "4", date: "2025-11-15", amount: 7500, method: "CEK", receiptNo: "MKB-2025-004", caseNo: "2025/1234", note: "Çek No: 123456" },
];

interface DebtorPaymentHistoryProps {
  debtorId?: string;
}

export function DebtorPaymentHistory({ debtorId }: DebtorPaymentHistoryProps) {
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("ALL");

  const filtered = mockPayments.filter((p) => {
    const matchesSearch = p.receiptNo.toLowerCase().includes(search.toLowerCase()) ||
      p.caseNo.toLowerCase().includes(search.toLowerCase());
    const matchesMethod = methodFilter === "ALL" || p.method === methodFilter;
    return matchesSearch && matchesMethod;
  });

  const total = filtered.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Ödeme Geçmişi</h3>
        <button className="text-sm text-blue-600 hover:underline flex items-center gap-1">
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Makbuz no veya dosya ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="ALL">Tüm Yöntemler</option>
          {Object.entries(methodLabels).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {filtered.map((payment) => {
          const method = methodLabels[payment.method];
          return (
            <div key={payment.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${method.color}`}>
                  {method.icon}
                </div>
                <div>
                  <div className="font-medium">{payment.receiptNo}</div>
                  <div className="text-sm text-gray-500 flex items-center gap-2">
                    <Calendar className="w-3 h-3" />
                    {new Date(payment.date).toLocaleDateString("tr-TR")}
                    <span>•</span>
                    <span>{payment.caseNo}</span>
                  </div>
                  {payment.note && <div className="text-xs text-gray-400">{payment.note}</div>}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-green-600">
                  +{payment.amount.toLocaleString("tr-TR")} ₺
                </div>
                <div className="text-xs text-gray-500">{method.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t flex justify-between items-center">
        <span className="text-sm text-gray-500">{filtered.length} ödeme</span>
        <span className="font-semibold">Toplam: {total.toLocaleString("tr-TR")} ₺</span>
      </div>
    </div>
  );
}
