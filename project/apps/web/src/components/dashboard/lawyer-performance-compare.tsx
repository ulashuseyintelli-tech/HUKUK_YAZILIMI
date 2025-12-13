"use client";

import { useState } from "react";
import { Users, TrendingUp, BarChart3, Target, Clock, FileText } from "lucide-react";

interface LawyerData {
  id: string;
  name: string;
  activeCases: number;
  closedCases: number;
  collectionRate: number;
  avgDuration: number;
  totalCollection: number;
}

const mockLawyers: LawyerData[] = [
  { id: "1", name: "Av. Mehmet Yılmaz", activeCases: 45, closedCases: 120, collectionRate: 78, avgDuration: 45, totalCollection: 850000 },
  { id: "2", name: "Av. Ayşe Kaya", activeCases: 38, closedCases: 95, collectionRate: 82, avgDuration: 38, totalCollection: 720000 },
  { id: "3", name: "Av. Ali Demir", activeCases: 52, closedCases: 88, collectionRate: 71, avgDuration: 52, totalCollection: 650000 },
  { id: "4", name: "Av. Zeynep Çelik", activeCases: 41, closedCases: 105, collectionRate: 85, avgDuration: 35, totalCollection: 920000 },
];

type Metric = "activeCases" | "closedCases" | "collectionRate" | "avgDuration" | "totalCollection";

const metricLabels: Record<Metric, { label: string; icon: React.ReactNode; format: (v: number) => string }> = {
  activeCases: { label: "Aktif Dosya", icon: <FileText className="w-4 h-4" />, format: (v) => v.toString() },
  closedCases: { label: "Kapatılan Dosya", icon: <Target className="w-4 h-4" />, format: (v) => v.toString() },
  collectionRate: { label: "Tahsilat Oranı", icon: <TrendingUp className="w-4 h-4" />, format: (v) => `%${v}` },
  avgDuration: { label: "Ort. Süre (gün)", icon: <Clock className="w-4 h-4" />, format: (v) => v.toString() },
  totalCollection: { label: "Toplam Tahsilat", icon: <BarChart3 className="w-4 h-4" />, format: (v) => `${(v / 1000).toFixed(0)}K ₺` },
};

export function LawyerPerformanceCompare() {
  const [selectedLawyers, setSelectedLawyers] = useState<string[]>(["1", "2"]);
  const [metric, setMetric] = useState<Metric>("collectionRate");

  const toggleLawyer = (id: string) => {
    if (selectedLawyers.includes(id)) {
      if (selectedLawyers.length > 1) {
        setSelectedLawyers(selectedLawyers.filter((l) => l !== id));
      }
    } else if (selectedLawyers.length < 4) {
      setSelectedLawyers([...selectedLawyers, id]);
    }
  };

  const selectedData = mockLawyers.filter((l) => selectedLawyers.includes(l.id));
  const maxValue = Math.max(...selectedData.map((l) => l[metric]));

  const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Users className="w-5 h-5" /> Avukat Performans Karşılaştırma
        </h3>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as Metric)}
          className="text-sm border rounded-lg px-2 py-1"
        >
          {Object.entries(metricLabels).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {mockLawyers.map((lawyer, idx) => (
          <button
            key={lawyer.id}
            onClick={() => toggleLawyer(lawyer.id)}
            className={`text-sm px-3 py-1.5 rounded-lg border transition-all ${
              selectedLawyers.includes(lawyer.id)
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "hover:border-gray-400"
            }`}
          >
            <span
              className="inline-block w-2 h-2 rounded-full mr-2"
              style={{ backgroundColor: selectedLawyers.includes(lawyer.id) ? colors[selectedLawyers.indexOf(lawyer.id)] : "#ccc" }}
            />
            {lawyer.name}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {selectedData.map((lawyer, idx) => (
          <div key={lawyer.id} className="flex items-center gap-3">
            <div className="w-32 text-sm truncate">{lawyer.name}</div>
            <div className="flex-1 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden relative">
              <div
                className="h-full rounded-lg transition-all flex items-center justify-end pr-2"
                style={{
                  width: `${(lawyer[metric] / maxValue) * 100}%`,
                  backgroundColor: colors[idx],
                }}
              >
                <span className="text-xs text-white font-medium">
                  {metricLabels[metric].format(lawyer[metric])}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t">
        <h4 className="text-sm font-medium mb-3">Detaylı Karşılaştırma</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Avukat</th>
                {Object.entries(metricLabels).map(([key, val]) => (
                  <th key={key} className="text-right py-2">{val.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selectedData.map((lawyer, idx) => (
                <tr key={lawyer.id} className="border-b">
                  <td className="py-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[idx] }} />
                    {lawyer.name}
                  </td>
                  {(Object.keys(metricLabels) as Metric[]).map((key) => (
                    <td key={key} className="text-right py-2">
                      {metricLabels[key].format(lawyer[key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
