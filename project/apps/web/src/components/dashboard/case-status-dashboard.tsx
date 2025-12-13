"use client";

import { useState } from "react";
import { FileText, Clock, CheckCircle, AlertTriangle, XCircle, Pause, TrendingUp, TrendingDown } from "lucide-react";

interface StatusData {
  status: string;
  label: string;
  count: number;
  change: number;
  color: string;
  icon: React.ReactNode;
}

const mockData: StatusData[] = [
  { status: "DERDEST", label: "Derdest", count: 145, change: 12, color: "bg-blue-500", icon: <FileText className="w-5 h-5" /> },
  { status: "ISLEMDE", label: "İşlemde", count: 89, change: 5, color: "bg-yellow-500", icon: <Clock className="w-5 h-5" /> },
  { status: "BEKLEMEDE", label: "Beklemede", count: 34, change: -3, color: "bg-orange-500", icon: <Pause className="w-5 h-5" /> },
  { status: "HITAM", label: "Hitam", count: 256, change: 18, color: "bg-green-500", icon: <CheckCircle className="w-5 h-5" /> },
  { status: "DERKENAR", label: "Derkenar", count: 23, change: 2, color: "bg-purple-500", icon: <AlertTriangle className="w-5 h-5" /> },
  { status: "IPTAL", label: "İptal", count: 12, change: -1, color: "bg-red-500", icon: <XCircle className="w-5 h-5" /> },
];

interface CaseStatusDashboardProps {
  onStatusClick?: (status: string) => void;
}

export function CaseStatusDashboard({ onStatusClick }: CaseStatusDashboardProps) {
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const total = mockData.reduce((sum, d) => sum + d.count, 0);

  const handleClick = (status: string) => {
    setSelectedStatus(status === selectedStatus ? null : status);
    onStatusClick?.(status);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border p-4">
      <h3 className="font-semibold mb-4">Dosya Durumları</h3>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {mockData.map((item) => (
          <button
            key={item.status}
            onClick={() => handleClick(item.status)}
            className={`p-3 rounded-lg border transition-all ${
              selectedStatus === item.status
                ? "ring-2 ring-blue-500 border-blue-500"
                : "hover:border-gray-400"
            }`}
          >
            <div className={`${item.color} text-white p-2 rounded-lg w-fit mb-2`}>
              {item.icon}
            </div>
            <div className="text-2xl font-bold">{item.count}</div>
            <div className="text-sm text-gray-500">{item.label}</div>
            <div className={`text-xs flex items-center gap-1 mt-1 ${
              item.change >= 0 ? "text-green-600" : "text-red-600"
            }`}>
              {item.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {item.change >= 0 ? "+" : ""}{item.change}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t flex justify-between items-center text-sm text-gray-500">
        <span>Toplam: {total} dosya</span>
        {selectedStatus && (
          <button
            onClick={() => setSelectedStatus(null)}
            className="text-blue-600 hover:underline"
          >
            Filtreyi Temizle
          </button>
        )}
      </div>
    </div>
  );
}
