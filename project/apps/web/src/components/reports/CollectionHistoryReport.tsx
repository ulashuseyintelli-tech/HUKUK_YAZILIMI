"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { DollarSign, Loader2, Search, Filter, BarChart3 } from "lucide-react";

interface CollectionHistoryData {
  summary: {
    totalCollected: number;
    totalPending: number;
    totalCancelled: number;
    collectionCount: number;
    averageAmount: number;
  };
  byChannel: { channel: string; count: number; total: number; percentage: number }[];
  bySource: { source: string; count: number; total: number; percentage: number }[];
  byMonth: { month: string; count: number; total: number }[];
  collections: {
    id: string;
    date: string;
    amount: number;
    currency: string;
    channel: string;
    source?: string;
    status: string;
    caseFileNumber?: string;
    description?: string;
  }[];
  generatedAt: string;
}

const channelLabels: Record<string, string> = {
  NAKIT: "Nakit",
  BANKA: "Banka",
  CEK: "Çek",
  SENET: "Senet",
  KREDI_KARTI: "Kredi Kartı",
  ICRA_DAIRESI: "İcra Dairesi",
  HACIZ: "Haciz",
  DIGER: "Diğer",
};

const sourceLabels: Record<string, string> = {
  MANUAL: "Manuel",
  EXTERNAL_CASE: "Alacak Haczi",
  THIRD_PARTY: "Üçüncü Şahıs",
  BANK_SEIZURE: "Banka Haczi",
  SALARY_SEIZURE: "Maaş Haczi",
  AUCTION: "İhale/Satış",
  SETTLEMENT: "Sulh",
};

const statusLabels: Record<string, { label: string; color: string }> = {
  CONFIRMED: { label: "Onaylı", color: "bg-green-100 text-green-700" },
  PENDING: { label: "Beklemede", color: "bg-yellow-100 text-yellow-700" },
  CANCELLED: { label: "İptal", color: "bg-red-100 text-red-700" },
};

export function CollectionHistoryReport() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<CollectionHistoryData | null>(null);
  const [error, setError] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    caseId: "",
    startDate: "",
    endDate: "",
    channels: [] as string[],
    statuses: [] as string[],
  });

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filters.caseId) params.append("caseId", filters.caseId);
      if (filters.startDate) params.append("startDate", filters.startDate);
      if (filters.endDate) params.append("endDate", filters.endDate);
      if (filters.channels.length) params.append("channels", filters.channels.join(","));
      if (filters.statuses.length) params.append("statuses", filters.statuses.join(","));
      const res = await api.get(`/reports/collection-history?${params}`);
      setReport(res.data?.data);
    } catch (err: any) {
      setError(err.response?.data?.message || "Rapor yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number, currency = "TRY") => {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(amount);
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString("tr-TR");

  return (
    <div className="space-y-6">
      {/* Filtre Paneli */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Tahsilat Geçmişi Raporu
          </h3>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <Filter className="h-4 w-4" />
            {showFilters ? "Filtreleri Gizle" : "Filtrele"}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t">
            <div>
              <label className="block text-sm font-medium mb-1">Dosya ID</label>
              <input
                type="text"
                value={filters.caseId}
                onChange={(e) => setFilters((p) => ({ ...p, caseId: e.target.value }))}
                placeholder="Dosya ID..."
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Başlangıç</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters((p) => ({ ...p, startDate: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bitiş</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters((p) => ({ ...p, endDate: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={loadReport}
                disabled={loading}
                className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Filtrele
              </button>
            </div>
          </div>
        )}
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Rapor Sonucu */}
      {report && !loading && (
        <div className="space-y-4">
          {/* Özet Kartları */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-green-50 rounded-xl border border-green-200 p-4">
              <p className="text-sm text-green-700">Toplam Tahsilat</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(report.summary.totalCollected)}</p>
              <p className="text-xs text-green-600">{report.summary.collectionCount} işlem</p>
            </div>
            <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
              <p className="text-sm text-yellow-700">Beklemede</p>
              <p className="text-2xl font-bold text-yellow-600">{formatCurrency(report.summary.totalPending)}</p>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-200 p-4">
              <p className="text-sm text-red-700">İptal Edilen</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(report.summary.totalCancelled)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">Ortalama Tahsilat</p>
              <p className="text-2xl font-bold">{formatCurrency(report.summary.averageAmount)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">İşlem Sayısı</p>
              <p className="text-2xl font-bold">{report.summary.collectionCount}</p>
            </div>
          </div>

          {/* Kanal ve Kaynak Dağılımı */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Kanal Dağılımı */}
            <div className="bg-white rounded-xl border p-6">
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Kanal Dağılımı
              </h4>
              <div className="space-y-3">
                {report.byChannel.map((item, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{channelLabels[item.channel] || item.channel}</span>
                      <span className="font-medium">{formatCurrency(item.total)} ({item.percentage}%)</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${item.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Kaynak Dağılımı */}
            <div className="bg-white rounded-xl border p-6">
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Kaynak Dağılımı
              </h4>
              <div className="space-y-3">
                {report.bySource.map((item, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{sourceLabels[item.source] || item.source}</span>
                      <span className="font-medium">{formatCurrency(item.total)} ({item.percentage}%)</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${item.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Aylık Dağılım */}
          {report.byMonth.length > 0 && (
            <div className="bg-white rounded-xl border p-6">
              <h4 className="font-semibold mb-4">Aylık Tahsilat Trendi</h4>
              <div className="overflow-x-auto">
                <div className="flex gap-2 min-w-max">
                  {report.byMonth.map((item, i) => (
                    <div key={i} className="text-center">
                      <div className="w-16 bg-gray-100 rounded-t relative" style={{ height: "120px" }}>
                        <div
                          className="absolute bottom-0 left-0 right-0 bg-primary rounded-t"
                          style={{
                            height: `${Math.min(100, (item.total / Math.max(...report.byMonth.map((m) => m.total))) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs mt-1 font-medium">{item.month}</p>
                      <p className="text-xs text-muted-foreground">{item.count} işlem</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tahsilat Listesi */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <h4 className="font-semibold">Son Tahsilatlar</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3">Tarih</th>
                    <th className="text-left px-4 py-3">Dosya No</th>
                    <th className="text-right px-4 py-3">Tutar</th>
                    <th className="text-left px-4 py-3">Kanal</th>
                    <th className="text-left px-4 py-3">Kaynak</th>
                    <th className="text-left px-4 py-3">Durum</th>
                    <th className="text-left px-4 py-3">Açıklama</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.collections.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">{formatDate(c.date)}</td>
                      <td className="px-4 py-3">{c.caseFileNumber || "-"}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(c.amount, c.currency)}</td>
                      <td className="px-4 py-3">{channelLabels[c.channel] || c.channel}</td>
                      <td className="px-4 py-3">{c.source ? sourceLabels[c.source] || c.source : "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${statusLabels[c.status]?.color || "bg-gray-100"}`}>
                          {statusLabels[c.status]?.label || c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">{c.description || "-"}</td>
                    </tr>
                  ))}
                  {report.collections.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        Tahsilat kaydı bulunamadı
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}