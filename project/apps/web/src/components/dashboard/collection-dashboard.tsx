"use client";

import { useState, useEffect } from "react";
import { api, CollectionSummary, CollectionHistoryReport } from "@/lib/api";
import { TrendingUp, TrendingDown, DollarSign, Clock, CheckCircle, XCircle, BarChart3 } from "lucide-react";

interface CollectionDashboardProps {
  caseId?: string;
}

export function CollectionDashboard({ caseId }: CollectionDashboardProps) {
  const [summary, setSummary] = useState<CollectionSummary | null>(null);
  const [history, setHistory] = useState<CollectionHistoryReport | null>(null);
  const [period, setPeriod] = useState<"week" | "month" | "year">("month");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [period, caseId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [summaryRes, historyRes] = await Promise.all([
        api.getCollectionSummary(period),
        api.getCollectionHistoryReport({ caseId, startDate: getStartDate(period) }),
      ]);
      setSummary(summaryRes);
      setHistory(historyRes);
    } catch (error) {
      console.error("Tahsilat verisi yüklenemedi:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStartDate = (p: string) => {
    const now = new Date();
    switch (p) {
      case "week":
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      case "year":
        return new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0];
      default:
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
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
          <DollarSign className="h-5 w-5 text-green-600" />
          Tahsilat Özeti
        </h2>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(["week", "month", "year"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                period === p
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {p === "week" ? "Hafta" : p === "month" ? "Ay" : "Yıl"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Dönem Tahsilatı"
          value={formatCurrency(summary?.periodTotal || 0)}
          subtitle={`${summary?.periodCount || 0} işlem`}
          icon={<TrendingUp className="h-5 w-5" />}
          color="green"
        />
        <SummaryCard
          title="Toplam Tahsilat"
          value={formatCurrency(summary?.allTimeTotal || 0)}
          subtitle="Tüm zamanlar"
          icon={<CheckCircle className="h-5 w-5" />}
          color="blue"
        />
        <SummaryCard
          title="Bekleyen"
          value={formatCurrency(summary?.pendingTotal || 0)}
          subtitle={`${summary?.pendingCount || 0} işlem`}
          icon={<Clock className="h-5 w-5" />}
          color="yellow"
        />
        <SummaryCard
          title="Ortalama"
          value={formatCurrency(history?.summary.averageAmount || 0)}
          subtitle="İşlem başına"
          icon={<BarChart3 className="h-5 w-5" />}
          color="purple"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel Distribution */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-medium mb-4">Kanal Dağılımı</h3>
          <div className="space-y-3">
            {history?.byChannel.map((item) => (
              <div key={item.channel}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{getChannelLabel(item.channel)}</span>
                  <span className="font-medium">
                    {formatCurrency(item.total)} ({item.percentage}%)
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
            {(!history?.byChannel || history.byChannel.length === 0) && (
              <p className="text-center text-gray-500 py-4">Veri yok</p>
            )}
          </div>
        </div>

        {/* Monthly Trend */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-medium mb-4">Aylık Trend</h3>
          <div className="space-y-2">
            {history?.byMonth.slice(-6).map((item) => (
              <div key={item.month} className="flex items-center gap-3">
                <span className="text-sm text-gray-500 w-20">{formatMonth(item.month)}</span>
                <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded flex items-center justify-end pr-2"
                    style={{
                      width: `${Math.min(100, (item.total / (history?.summary.totalCollected || 1)) * 100 * 3)}%`,
                    }}
                  >
                    <span className="text-xs text-white font-medium">
                      {formatCurrency(item.total)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {(!history?.byMonth || history.byMonth.length === 0) && (
              <p className="text-center text-gray-500 py-4">Veri yok</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Collections */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-medium mb-4">Son Tahsilatlar</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 font-medium">Tarih</th>
                <th className="text-left py-2 font-medium">Dosya</th>
                <th className="text-left py-2 font-medium">Kanal</th>
                <th className="text-right py-2 font-medium">Tutar</th>
                <th className="text-center py-2 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {history?.collections.slice(0, 10).map((col) => (
                <tr key={col.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2">{new Date(col.date).toLocaleDateString("tr-TR")}</td>
                  <td className="py-2">{col.caseFileNumber || "-"}</td>
                  <td className="py-2">{getChannelLabel(col.channel)}</td>
                  <td className="py-2 text-right font-medium">{formatCurrency(col.amount)}</td>
                  <td className="py-2 text-center">
                    <StatusBadge status={col.status} />
                  </td>
                </tr>
              ))}
              {(!history?.collections || history.collections.length === 0) && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">
                    Tahsilat kaydı bulunamadı
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  color: "green" | "blue" | "yellow" | "purple";
}) {
  const colors = {
    green: "bg-green-50 text-green-600",
    blue: "bg-blue-50 text-blue-600",
    yellow: "bg-yellow-50 text-yellow-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">{title}</span>
        <span className={`p-2 rounded-lg ${colors[color]}`}>{icon}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-500">{subtitle}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    CONFIRMED: "bg-green-100 text-green-700",
    PENDING: "bg-yellow-100 text-yellow-700",
    CANCELLED: "bg-red-100 text-red-700",
  };

  const labels: Record<string, string> = {
    CONFIRMED: "Onaylı",
    PENDING: "Bekliyor",
    CANCELLED: "İptal",
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || "bg-gray-100 text-gray-700"}`}>
      {labels[status] || status}
    </span>
  );
}

function getChannelLabel(channel: string): string {
  const labels: Record<string, string> = {
    BANKA: "Banka",
    NAKIT: "Nakit",
    KREDI_KARTI: "Kredi Kartı",
    HAVALE: "Havale/EFT",
    CEK: "Çek",
    SENET: "Senet",
    DIGER: "Diğer",
  };
  return labels[channel] || channel;
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const months = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  return `${months[parseInt(m) - 1]} ${year.slice(2)}`;
}
