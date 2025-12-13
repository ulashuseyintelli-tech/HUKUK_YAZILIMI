'use client';

import { useState } from 'react';
import { FileText, Printer, Download, Calendar, User, DollarSign, Scale, Clock, CheckCircle } from 'lucide-react';

interface CaseSummaryData {
  fileNumber: string;
  caseType: string;
  status: string;
  createdAt: string;
  debtors: { name: string; tckn: string; totalDebt: number }[];
  clients: { name: string; role: string }[];
  lawyers: { name: string }[];
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  collectedAmount: number;
  expenses: { category: string; amount: number }[];
  hearings: { date: string; type: string; result?: string }[];
  timeline: { date: string; action: string }[];
}

interface CaseSummaryReportProps {
  caseId: string;
  data?: CaseSummaryData;
}

export function CaseSummaryReport({ caseId, data }: CaseSummaryReportProps) {
  const [loading, setLoading] = useState(false);

  // Demo data
  const summary: CaseSummaryData = data || {
    fileNumber: '2024/1001', caseType: 'İlamsız İcra', status: 'Derdest', createdAt: '2024-06-15',
    debtors: [{ name: 'Ahmet Yılmaz', tckn: '12345678901', totalDebt: 150000 }],
    clients: [{ name: 'XYZ Holding A.Ş.', role: 'Alacaklı' }],
    lawyers: [{ name: 'Av. Mehmet Kaya' }],
    principalAmount: 100000, interestAmount: 35000, totalAmount: 150000, collectedAmount: 45000,
    expenses: [{ category: 'Harç', amount: 2500 }, { category: 'Posta', amount: 350 }],
    hearings: [{ date: '2024-08-15', type: 'İlk Duruşma', result: 'Ertelendi' }],
    timeline: [
      { date: '2024-06-15', action: 'Dosya açıldı' },
      { date: '2024-06-20', action: 'Ödeme emri gönderildi' },
      { date: '2024-07-10', action: 'Tebligat yapıldı' },
    ]
  };

  const formatCurrency = (n: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
  const formatDate = (d: string) => new Date(d).toLocaleDateString('tr-TR');
  const collectionRate = summary.totalAmount > 0 ? Math.round((summary.collectedAmount / summary.totalAmount) * 100) : 0;

  const handlePrint = () => window.print();
  const handleExport = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); alert('PDF oluşturuldu'); }, 1000);
  };

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header Actions */}
      <div className="flex items-center justify-between print:hidden">
        <h3 className="font-medium flex items-center gap-2"><FileText className="h-5 w-5" />Dosya Özet Raporu</h3>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">
            <Printer className="h-4 w-4" />Yazdır
          </button>
          <button onClick={handleExport} disabled={loading} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Download className="h-4 w-4" />{loading ? 'Hazırlanıyor...' : 'PDF İndir'}
          </button>
        </div>
      </div>

      {/* Report Content */}
      <div className="bg-white border rounded-xl p-6 print:border-none print:p-0">
        {/* Header */}
        <div className="border-b pb-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{summary.fileNumber}</h1>
              <p className="text-gray-500">{summary.caseType}</p>
            </div>
            <div className="text-right">
              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">{summary.status}</span>
              <p className="text-sm text-gray-500 mt-1"><Calendar className="h-3 w-3 inline mr-1" />{formatDate(summary.createdAt)}</p>
            </div>
          </div>
        </div>

        {/* Parties */}
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-sm text-gray-500 mb-2"><User className="h-4 w-4 inline mr-1" />Borçlular</h4>
            {summary.debtors.map((d, i) => <p key={i} className="font-medium">{d.name}</p>)}
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-sm text-gray-500 mb-2"><User className="h-4 w-4 inline mr-1" />Müvekkiller</h4>
            {summary.clients.map((c, i) => <p key={i} className="font-medium">{c.name}</p>)}
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-sm text-gray-500 mb-2"><Scale className="h-4 w-4 inline mr-1" />Avukatlar</h4>
            {summary.lawyers.map((l, i) => <p key={i} className="font-medium">{l.name}</p>)}
          </div>
        </div>

        {/* Financial Summary */}
        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <h4 className="font-medium mb-3"><DollarSign className="h-4 w-4 inline mr-1" />Mali Özet</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div><p className="text-sm text-gray-500">Ana Para</p><p className="text-xl font-bold">{formatCurrency(summary.principalAmount)}</p></div>
            <div><p className="text-sm text-gray-500">Faiz</p><p className="text-xl font-bold">{formatCurrency(summary.interestAmount)}</p></div>
            <div><p className="text-sm text-gray-500">Toplam Alacak</p><p className="text-xl font-bold text-blue-600">{formatCurrency(summary.totalAmount)}</p></div>
            <div><p className="text-sm text-gray-500">Tahsilat (%{collectionRate})</p><p className="text-xl font-bold text-green-600">{formatCurrency(summary.collectedAmount)}</p></div>
          </div>
        </div>

        {/* Expenses */}
        {summary.expenses.length > 0 && (
          <div className="mb-6">
            <h4 className="font-medium mb-2">Masraflar</h4>
            <table className="w-full text-sm">
              <tbody>
                {summary.expenses.map((e, i) => (
                  <tr key={i} className="border-b"><td className="py-2">{e.category}</td><td className="text-right">{formatCurrency(e.amount)}</td></tr>
                ))}
                <tr className="font-bold"><td className="py-2">Toplam</td><td className="text-right">{formatCurrency(summary.expenses.reduce((s, e) => s + e.amount, 0))}</td></tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Timeline */}
        <div>
          <h4 className="font-medium mb-2"><Clock className="h-4 w-4 inline mr-1" />İşlem Geçmişi</h4>
          <div className="space-y-2">
            {summary.timeline.map((t, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-gray-500 w-24">{formatDate(t.date)}</span>
                <span>{t.action}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
