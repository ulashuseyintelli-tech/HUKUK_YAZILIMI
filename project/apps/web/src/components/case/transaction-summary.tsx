"use client";

import { useState } from "react";
import { Activity, User, Calendar, Download, Filter, FileText, Edit, Trash2, Eye, Upload, Send } from "lucide-react";

interface Transaction {
  id: string;
  type: "CREATE" | "UPDATE" | "DELETE" | "VIEW" | "UPLOAD" | "DOWNLOAD" | "SEND";
  description: string;
  user: string;
  timestamp: string;
  caseNo?: string;
}

const typeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  CREATE: { label: "Oluşturma", icon: <FileText className="w-4 h-4" />, color: "bg-green-100 text-green-700" },
  UPDATE: { label: "Güncelleme", icon: <Edit className="w-4 h-4" />, color: "bg-blue-100 text-blue-700" },
  DELETE: { label: "Silme", icon: <Trash2 className="w-4 h-4" />, color: "bg-red-100 text-red-700" },
  VIEW: { label: "Görüntüleme", icon: <Eye className="w-4 h-4" />, color: "bg-gray-100 text-gray-700" },
  UPLOAD: { label: "Yükleme", icon: <Upload className="w-4 h-4" />, color: "bg-purple-100 text-purple-700" },
  DOWNLOAD: { label: "İndirme", icon: <Download className="w-4 h-4" />, color: "bg-orange-100 text-orange-700" },
  SEND: { label: "Gönderim", icon: <Send className="w-4 h-4" />, color: "bg-cyan-100 text-cyan-700" },
};

const mockTransactions: Transaction[] = [
  { id: "1", type: "CREATE", description: "Yeni dosya oluşturuldu", user: "Av. Mehmet Yılmaz", timestamp: "2025-12-13T14:30:00", caseNo: "2025/1234" },
  { id: "2", type: "UPDATE", description: "Borçlu bilgileri güncellendi", user: "Av. Ayşe Kaya", timestamp: "2025-12-13T14:15:00", caseNo: "2025/1234" },
  { id: "3", type: "UPLOAD", description: "Ödeme emri yüklendi", user: "Av. Mehmet Yılmaz", timestamp: "2025-12-13T13:45:00", caseNo: "2025/5678" },
  { id: "4", type: "SEND", description: "UYAP'a gönderildi", user: "Av. Ali Demir", timestamp: "2025-12-13T12:30:00", caseNo: "2025/9012" },
  { id: "5", type: "VIEW", description: "Dosya görüntülendi", user: "Av. Zeynep Çelik", timestamp: "2025-12-13T11:00:00", caseNo: "2025/1234" },
  { id: "6", type: "DOWNLOAD", description: "Haciz talebi indirildi", user: "Av. Mehmet Yılmaz", timestamp: "2025-12-13T10:30:00", caseNo: "2025/5678" },
  { id: "7", type: "DELETE", description: "Taslak belge silindi", user: "Av. Ayşe Kaya", timestamp: "2025-12-13T09:15:00", caseNo: "2025/3456" },
];

interface TransactionSummaryProps {
  date?: string;
}

export function TransactionSummary({ date }: TransactionSummaryProps) {
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [userFilter, setUserFilter] = useState<string>("ALL");

  const users = [...new Set(mockTransactions.map((t) => t.user))];

  const filtered = mockTransactions.filter((t) => {
    const matchesType = typeFilter === "ALL" || t.type === typeFilter;
    const matchesUser = userFilter === "ALL" || t.user === userFilter;
    return matchesType && matchesUser;
  });

  const typeCounts = mockTransactions.reduce((acc, t) => {
    acc[t.type] = (acc[t.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Activity className="w-5 h-5" /> Günlük İşlem Özeti
        </h3>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Calendar className="w-4 h-4" />
          {new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(typeConfig).map(([key, val]) => (
          <div key={key} className={`text-xs px-2 py-1 rounded-full ${val.color}`}>
            {val.label}: {typeCounts[key] || 0}
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="text-sm border rounded-lg px-2 py-1"
        >
          <option value="ALL">Tüm İşlemler</option>
          {Object.entries(typeConfig).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="text-sm border rounded-lg px-2 py-1"
        >
          <option value="ALL">Tüm Kullanıcılar</option>
          {users.map((user) => (
            <option key={user} value={user}>{user}</option>
          ))}
        </select>
        <button className="ml-auto text-sm text-blue-600 hover:underline flex items-center gap-1">
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {filtered.map((tx) => {
          const config = typeConfig[tx.type];
          return (
            <div key={tx.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg">
              <div className={`p-2 rounded-lg ${config.color}`}>
                {config.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{tx.description}</div>
                <div className="text-xs text-gray-500 flex items-center gap-2">
                  <User className="w-3 h-3" /> {tx.user}
                  {tx.caseNo && <span>• {tx.caseNo}</span>}
                </div>
              </div>
              <div className="text-xs text-gray-400">{formatTime(tx.timestamp)}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t flex justify-between items-center text-sm text-gray-500">
        <span>{filtered.length} işlem</span>
        <span>Toplam: {mockTransactions.length} işlem</span>
      </div>
    </div>
  );
}
