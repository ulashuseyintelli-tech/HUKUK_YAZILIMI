"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { FileText, Calculator, Loader2, Download, Search } from "lucide-react";

interface CaseDebtReportData {
  caseInfo: {
    id: string;
    fileNumber: string;
    executionFileNumber?: string;
    clientName: string;
    status: string;
    openDate: string;
  };
  debtors: { id: string; name: string; tcNo?: string; role: string }[];
  claimDetails: {
    principalAmount: number;
    currency: string;
    interestAmount: number;
    interestRate?: number;
    interestType?: string;
    interestStartDate?: string;
    interestEndDate: string;
    expenseAmount: number;
    feeAmount: number;
    attorneyFeeAmount: number;
    otherAmount: number;
    totalClaim: number;
  };
  collectionDetails: {
    totalCollected: number;
    collectionCount: number;
    byType: Record<string, number>;
    lastCollectionDate?: string;
  };
  balance: {
    remainingDebt: number;
    remainingPrincipal: number;
    remainingInterest: number;
    remainingExpense: number;
    remainingFee: number;
    remainingAttorneyFee: number;
  };
  calculationDate: string;
  generatedAt: string;
}

export function CaseDebtReport() {
  const [caseId, setCaseId] = useState("");
  const [calculationDate, setCalculationDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<CaseDebtReportData | null>(null);
  const [error, setError] = useState("");

  const loadReport = async () => {
    if (!caseId.trim()) {
      setError("Lütfen dosya ID girin");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (calculationDate) params.append("calculationDate", calculationDate);
      const res = await api.get(`/reports/case-debt/${caseId}?${params}`);
      setReport(res.data?.data);
    } catch (err: any) {
      setError(err.response?.data?.message || "Rapor yüklenemedi");
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number, currency = "TRY") => {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("tr-TR");
  };

  return (
    <div className="space-y-6">
      {/* Arama Formu */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          Dosya Borç Raporu (Kapak Hesabı)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <label className="block text-sm font-medium mb-1">Hesaplama Tarihi</label>
            <input
              type="date"
              value={calculationDate}
              onChange={(e) => setCalculationDate(e.target.value)}
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
          {/* Dosya Bilgileri */}
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Dosya Bilgileri
              </h4>
              <span className="text-sm text-muted-foreground">
                Hesaplama: {formatDate(report.calculationDate)}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Dosya No</p>
                <p className="font-medium">{report.caseInfo.fileNumber}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">İcra Dosya No</p>
                <p className="font-medium">{report.caseInfo.executionFileNumber || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Müvekkil</p>
                <p className="font-medium">{report.caseInfo.clientName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Durum</p>
                <p className="font-medium">{report.caseInfo.status}</p>
              </div>
            </div>
            {/* Borçlular */}
            {report.debtors.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm font-medium mb-2">Borçlular</p>
                <div className="flex flex-wrap gap-2">
                  {report.debtors.map((d) => (
                    <span key={d.id} className="px-3 py-1 bg-gray-100 rounded-full text-sm">
                      {d.name} ({d.role})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Alacak Kalemleri */}
          <div className="bg-white rounded-xl border p-6">
            <h4 className="font-semibold mb-4">Alacak Kalemleri</h4>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span>Ana Para</span>
                <span className="font-medium">
                  {formatCurrency(report.claimDetails.principalAmount, report.claimDetails.currency)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <div>
                  <span>Faiz</span>
                  {report.claimDetails.interestRate && (
                    <span className="text-sm text-muted-foreground ml-2">
                      (%{report.claimDetails.interestRate} {report.claimDetails.interestType})
                    </span>
                  )}
                </div>
                <span className="font-medium">
                  {formatCurrency(report.claimDetails.interestAmount, report.claimDetails.currency)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span>Masraflar</span>
                <span className="font-medium">
                  {formatCurrency(report.claimDetails.expenseAmount, report.claimDetails.currency)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span>Harçlar</span>
                <span className="font-medium">
                  {formatCurrency(report.claimDetails.feeAmount, report.claimDetails.currency)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span>Vekalet Ücreti</span>
                <span className="font-medium">
                  {formatCurrency(report.claimDetails.attorneyFeeAmount, report.claimDetails.currency)}
                </span>
              </div>
              <div className="flex justify-between py-2 bg-primary/10 rounded px-2">
                <span className="font-semibold">Toplam Alacak</span>
                <span className="font-bold text-primary">
                  {formatCurrency(report.claimDetails.totalClaim, report.claimDetails.currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Tahsilat ve Bakiye */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tahsilat Özeti */}
            <div className="bg-white rounded-xl border p-6">
              <h4 className="font-semibold mb-4">Tahsilat Özeti</h4>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>Toplam Tahsilat</span>
                  <span className="font-medium text-green-600">
                    {formatCurrency(report.collectionDetails.totalCollected, report.claimDetails.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Tahsilat Sayısı</span>
                  <span>{report.collectionDetails.collectionCount}</span>
                </div>
                {report.collectionDetails.lastCollectionDate && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Son Tahsilat</span>
                    <span>{formatDate(report.collectionDetails.lastCollectionDate)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Kalan Borç */}
            <div className="bg-red-50 rounded-xl border border-red-200 p-6">
              <h4 className="font-semibold mb-4 text-red-800">Kalan Borç</h4>
              <div className="text-3xl font-bold text-red-600 mb-4">
                {formatCurrency(report.balance.remainingDebt, report.claimDetails.currency)}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Kalan Ana Para</span>
                  <span>{formatCurrency(report.balance.remainingPrincipal, report.claimDetails.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Kalan Faiz</span>
                  <span>{formatCurrency(report.balance.remainingInterest, report.claimDetails.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Kalan Masraf</span>
                  <span>{formatCurrency(report.balance.remainingExpense, report.claimDetails.currency)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}