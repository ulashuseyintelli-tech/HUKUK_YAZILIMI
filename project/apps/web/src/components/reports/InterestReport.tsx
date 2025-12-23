"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { TrendingUp, Loader2, Search, Calendar } from "lucide-react";

interface InterestReportData {
  caseInfo: {
    id: string;
    fileNumber: string;
    principalAmount: number;
    currency: string;
  };
  interestDetails: {
    type: string;
    rate: number;
    startDate: string;
    endDate: string;
    days: number;
    calculatedAmount: number;
  };
  dailyBreakdown?: {
    date: string;
    principal: number;
    rate: number;
    dailyInterest: number;
    cumulativeInterest: number;
  }[];
  summary: {
    totalDays: number;
    averageRate: number;
    totalInterest: number;
  };
  generatedAt: string;
}

export function InterestReport() {
  const [caseId, setCaseId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<InterestReportData | null>(null);
  const [error, setError] = useState("");
  const [showDaily, setShowDaily] = useState(false);

  const loadReport = async () => {
    if (!caseId.trim()) {
      setError("Lütfen dosya ID girin");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      const res = await api.get(`/reports/interest/${caseId}?${params}`);
      setReport(res.data?.data);
    } catch (err: any) {
      setError(err.response?.data?.message || "Rapor yüklenemedi");
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number, currency = "TRY") => {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(amount);
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString("tr-TR");

  const interestTypeLabels: Record<string, string> = {
    YASAL: "Yasal Faiz",
    TICARI: "Ticari Faiz",
    AVANS: "Avans Faizi",
    OZEL: "Özel Faiz",
  };

  return (
    <div className="space-y-6">
      {/* Arama Formu */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Faiz Hesaplama Raporu
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Dosya ID</label>
            <input
              type="text"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              placeholder="Dosya ID girin..."
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Başlangıç Tarihi</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Bitiş Tarihi</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
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
              Hesapla
            </button>
          </div>
        </div>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      </div>

      {/* Rapor Sonucu */}
      {report && (
        <div className="space-y-4">
          {/* Özet Kartları */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">Ana Para</p>
              <p className="text-xl font-bold">
                {formatCurrency(report.caseInfo.principalAmount, report.caseInfo.currency)}
              </p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">Faiz Oranı</p>
              <p className="text-xl font-bold">%{report.interestDetails.rate}</p>
              <p className="text-xs text-muted-foreground">
                {interestTypeLabels[report.interestDetails.type] || report.interestDetails.type}
              </p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">Toplam Gün</p>
              <p className="text-xl font-bold">{report.summary.totalDays}</p>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-200 p-4">
              <p className="text-sm text-green-700">Toplam Faiz</p>
              <p className="text-xl font-bold text-green-600">
                {formatCurrency(report.summary.totalInterest, report.caseInfo.currency)}
              </p>
            </div>
          </div>

          {/* Faiz Detayları */}
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Faiz Hesaplama Detayı
              </h4>
              <div className="text-sm text-muted-foreground">
                {formatDate(report.interestDetails.startDate)} - {formatDate(report.interestDetails.endDate)}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Faiz Türü</p>
                <p className="font-medium">{interestTypeLabels[report.interestDetails.type] || report.interestDetails.type}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Yıllık Oran</p>
                <p className="font-medium">%{report.interestDetails.rate}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Gün Sayısı</p>
                <p className="font-medium">{report.interestDetails.days} gün</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hesaplanan Faiz</p>
                <p className="font-medium text-green-600">
                  {formatCurrency(report.interestDetails.calculatedAmount, report.caseInfo.currency)}
                </p>
              </div>
            </div>
          </div>

          {/* Günlük Dağılım */}
          {report.dailyBreakdown && report.dailyBreakdown.length > 0 && (
            <div className="bg-white rounded-xl border p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold">Günlük Faiz Dağılımı</h4>
                <button
                  onClick={() => setShowDaily(!showDaily)}
                  className="text-sm text-primary hover:underline"
                >
                  {showDaily ? "Gizle" : `Göster (${report.dailyBreakdown.length} gün)`}
                </button>
              </div>
              {showDaily && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2">Tarih</th>
                        <th className="text-right px-3 py-2">Ana Para</th>
                        <th className="text-right px-3 py-2">Oran (%)</th>
                        <th className="text-right px-3 py-2">Günlük Faiz</th>
                        <th className="text-right px-3 py-2">Kümülatif</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {report.dailyBreakdown.map((day, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2">{day.date}</td>
                          <td className="px-3 py-2 text-right">
                            {formatCurrency(day.principal, report.caseInfo.currency)}
                          </td>
                          <td className="px-3 py-2 text-right">{day.rate}</td>
                          <td className="px-3 py-2 text-right">
                            {formatCurrency(day.dailyInterest, report.caseInfo.currency)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-green-600">
                            {formatCurrency(day.cumulativeInterest, report.caseInfo.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}