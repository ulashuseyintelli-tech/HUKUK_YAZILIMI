"use client";

import { useState } from "react";
import { Tag, TrendingUp, BarChart3 } from "lucide-react";

interface TagStat {
  id: string;
  name: string;
  color: string;
  count: number;
  trend: number;
  lastUsed: string;
}

const mockTags: TagStat[] = [
  { id: "1", name: "Acil", color: "#ef4444", count: 45, trend: 12, lastUsed: "2025-12-13" },
  { id: "2", name: "VIP Müvekkil", color: "#f59e0b", count: 32, trend: 5, lastUsed: "2025-12-12" },
  { id: "3", name: "Yüksek Tutar", color: "#10b981", count: 28, trend: -3, lastUsed: "2025-12-11" },
  { id: "4", name: "Beklemede", color: "#6366f1", count: 21, trend: 8, lastUsed: "2025-12-13" },
  { id: "5", name: "Takipte", color: "#8b5cf6", count: 18, trend: 2, lastUsed: "2025-12-10" },
  { id: "6", name: "Ödeme Planı", color: "#ec4899", count: 15, trend: -1, lastUsed: "2025-12-09" },
];

export function TagStatistics() {
  const [sortBy, setSortBy] = useState<"count" | "trend" | "recent">("count");

  const sorted = [...mockTags].sort((a, b) => {
    if (sortBy === "count") return b.count - a.count;
    if (sortBy === "trend") return b.trend - a.trend;
    return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
  });

  const totalUsage = mockTags.reduce((sum, t) => sum + t.count, 0);
  const maxCount = Math.max(...mockTags.map((t) => t.count));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Tag className="w-5 h-5" /> Etiket İstatistikleri
        </h3>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="text-sm border rounded-lg px-2 py-1"
        >
          <option value="count">Kullanım</option>
          <option value="trend">Trend</option>
          <option value="recent">Son Kullanım</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">{mockTags.length}</div>
          <div className="text-xs text-gray-500">Toplam Etiket</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">{totalUsage}</div>
          <div className="text-xs text-gray-500">Toplam Kullanım</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">{Math.round(totalUsage / mockTags.length)}</div>
          <div className="text-xs text-gray-500">Ort. Kullanım</div>
        </div>
      </div>

      <div className="space-y-3">
        {sorted.map((tag, idx) => (
          <div key={tag.id} className="flex items-center gap-3">
            <span className="text-sm text-gray-400 w-4">{idx + 1}</span>
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{tag.name}</span>
                <span className="text-sm text-gray-500">{tag.count}</span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(tag.count / maxCount) * 100}%`,
                    backgroundColor: tag.color,
                  }}
                />
              </div>
            </div>
            <div className={`text-xs flex items-center gap-0.5 w-12 ${
              tag.trend >= 0 ? "text-green-600" : "text-red-600"
            }`}>
              <TrendingUp className={`w-3 h-3 ${tag.trend < 0 ? "rotate-180" : ""}`} />
              {tag.trend >= 0 ? "+" : ""}{tag.trend}%
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t">
        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> Popüler Etiketler
        </h4>
        <div className="flex flex-wrap gap-2">
          {sorted.slice(0, 5).map((tag) => (
            <span
              key={tag.id}
              className="text-xs px-2 py-1 rounded-full text-white"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name} ({tag.count})
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
