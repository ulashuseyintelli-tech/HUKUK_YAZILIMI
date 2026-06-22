"use client";

import { useState, useEffect } from "react";
import { api, PersonelReport } from "@/lib/api";
import { isRealPersonOwner } from "@/lib/personel-report-grouping";
import { Users, Trophy, TrendingUp, Target, Medal, Award } from "lucide-react";

interface PersonelPerformanceProps {
  startDate?: string;
  endDate?: string;
}

export function PersonelPerformance({ startDate, endDate }: PersonelPerformanceProps) {
  const [data, setData] = useState<PersonelReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"totalCases" | "closedCases" | "totalCollection" | "closureRate">("totalCases");

  useEffect(() => {
    loadData();
  }, [startDate, endDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await api.getPersonelReport({ startDate, endDate });
      // M2-G5b-2: dashboard leaderboard YALNIZ gerçek kişiyi gösterir; legacy (ownerType yok/LEGACY_USER) hariç.
      setData(result.filter(isRealPersonOwner));
    } catch (error) {
      console.error("Personel verisi yüklenemedi:", error);
    } finally {
      setLoading(false);
    }
  };

  const sortedData = [...data].sort((a, b) => b[sortBy] - a[sortBy]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Top performers
  const topByCollection = [...data].sort((a, b) => b.totalCollection - a.totalCollection)[0];
  const topByClosure = [...data].sort((a, b) => b.closureRate - a.closureRate)[0];
  const topByCases = [...data].sort((a, b) => b.totalCases - a.totalCases)[0];

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-600" />
          Personel Performansı
        </h2>
      </div>

      {/* Top Performers */}
      {data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {topByCollection && (
            <TopPerformerCard
              title="En Yüksek Tahsilat"
              name={topByCollection.personel}
              value={formatCurrency(topByCollection.totalCollection)}
              icon={<Trophy className="h-5 w-5" />}
              color="yellow"
            />
          )}
          {topByClosure && (
            <TopPerformerCard
              title="En Yüksek Kapanış Oranı"
              name={topByClosure.personel}
              value={`%${topByClosure.closureRate}`}
              icon={<Target className="h-5 w-5" />}
              color="green"
            />
          )}
          {topByCases && (
            <TopPerformerCard
              title="En Çok Dosya"
              name={topByCases.personel}
              value={`${topByCases.totalCases} dosya`}
              icon={<Award className="h-5 w-5" />}
              color="blue"
            />
          )}
        </div>
      )}

      {/* Performance Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Sırala:</span>
            {[
              { key: "totalCases", label: "Dosya Sayısı" },
              { key: "closedCases", label: "Kapanan" },
              { key: "totalCollection", label: "Tahsilat" },
              { key: "closureRate", label: "Kapanış %" },
            ].map((option) => (
              <button
                key={option.key}
                onClick={() => setSortBy(option.key as any)}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  sortBy === option.key
                    ? "bg-blue-100 text-blue-700"
                    : "bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left py-3 px-4 font-medium text-sm">#</th>
                <th className="text-left py-3 px-4 font-medium text-sm">Personel</th>
                <th className="text-center py-3 px-4 font-medium text-sm">Toplam Dosya</th>
                <th className="text-center py-3 px-4 font-medium text-sm">Kapanan</th>
                <th className="text-center py-3 px-4 font-medium text-sm">Kapanış %</th>
                <th className="text-right py-3 px-4 font-medium text-sm">Tahsilat</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((person, index) => (
                <tr key={person.personelId} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    {index < 3 ? (
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        index === 0 ? "bg-yellow-100 text-yellow-700" :
                        index === 1 ? "bg-gray-100 text-gray-700" :
                        "bg-orange-100 text-orange-700"
                      }`}>
                        {index + 1}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-sm">{index + 1}</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-medium text-sm">
                        {person.personel.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                      <span className="font-medium">{person.personel}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="font-medium">{person.totalCases}</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="text-green-600 font-medium">{person.closedCases}</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <ProgressBar value={person.closureRate} />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="font-medium">{formatCurrency(person.totalCollection)}</span>
                  </td>
                </tr>
              ))}
              {sortedData.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    Personel verisi bulunamadı
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Stats */}
      {data.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Toplam Personel"
            value={data.length.toString()}
          />
          <StatCard
            label="Toplam Dosya"
            value={data.reduce((sum, p) => sum + p.totalCases, 0).toString()}
          />
          <StatCard
            label="Toplam Kapanan"
            value={data.reduce((sum, p) => sum + p.closedCases, 0).toString()}
          />
          <StatCard
            label="Toplam Tahsilat"
            value={formatCurrency(data.reduce((sum, p) => sum + p.totalCollection, 0))}
          />
        </div>
      )}
    </div>
  );
}

function TopPerformerCard({
  title,
  name,
  value,
  icon,
  color,
}: {
  title: string;
  name: string;
  value: string;
  icon: React.ReactNode;
  color: "yellow" | "green" | "blue";
}) {
  const colors = {
    yellow: "bg-yellow-50 border-yellow-200 text-yellow-700",
    green: "bg-green-50 border-green-200 text-green-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
  };

  const iconColors = {
    yellow: "bg-yellow-100 text-yellow-600",
    green: "bg-green-100 text-green-600",
    blue: "bg-blue-100 text-blue-600",
  };

  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${iconColors[color]}`}>{icon}</div>
        <div>
          <p className="text-xs opacity-75">{title}</p>
          <p className="font-semibold">{name}</p>
          <p className="text-lg font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const getColor = (v: number) => {
    if (v >= 70) return "bg-green-500";
    if (v >= 40) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${getColor(value)}`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <span className="text-sm font-medium">{value}%</span>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border p-3 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
