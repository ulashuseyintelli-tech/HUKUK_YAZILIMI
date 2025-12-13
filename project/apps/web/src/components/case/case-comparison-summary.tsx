'use client';

import { useState } from 'react';
import { GitCompare, Search, X, Check, Minus, Download, ArrowRight } from 'lucide-react';

interface CaseData {
  id: string;
  fileNumber: string;
  debtorName: string;
  clientName: string;
  principalAmount: number;
  collectedAmount: number;
  status: string;
  caseType: string;
  createdAt: string;
  lawyerName: string;
}

export function CaseComparisonSummary() {
  const [case1, setCase1] = useState<CaseData | null>(null);
  const [case2, setCase2] = useState<CaseData | null>(null);
  const [search, setSearch] = useState('');
  const [selecting, setSelecting] = useState<1 | 2 | null>(null);

  const searchResults: CaseData[] = [
    { id: '1', fileNumber: '2024/1001', debtorName: 'Ahmet Yılmaz', clientName: 'XYZ Ltd.', principalAmount: 150000, collectedAmount: 120000, status: 'HITAM', caseType: 'ILAMSIZ', createdAt: '2024-01-15', lawyerName: 'Av. Mehmet' },
    { id: '2', fileNumber: '2024/1002', debtorName: 'Mehmet Kaya', clientName: 'ABC A.Ş.', principalAmount: 250000, collectedAmount: 100000, status: 'DERDEST', caseType: 'KAMBIYO', createdAt: '2024-02-20', lawyerName: 'Av. Ayşe' },
    { id: '3', fileNumber: '2024/1003', debtorName: 'Ali Demir', clientName: 'XYZ Ltd.', principalAmount: 80000, collectedAmount: 80000, status: 'HITAM', caseType: 'ILAMLI', createdAt: '2024-03-10', lawyerName: 'Av. Mehmet' },
  ].filter(c => c.fileNumber.includes(search) || c.debtorName.toLowerCase().includes(search.toLowerCase()));

  const selectCase = (c: CaseData) => {
    if (selecting === 1) setCase1(c);
    else if (selecting === 2) setCase2(c);
    setSelecting(null);
    setSearch('');
  };

  const formatCurrency = (n: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);

  const compareField = (val1: string | number | undefined, val2: string | number | undefined) => {
    if (val1 === val2) return <Check className="h-4 w-4 text-green-500" />;
    return <Minus className="h-4 w-4 text-orange-500" />;
  };

  const fields = [
    { label: 'Dosya No', key: 'fileNumber' },
    { label: 'Borçlu', key: 'debtorName' },
    { label: 'Müvekkil', key: 'clientName' },
    { label: 'Ana Para', key: 'principalAmount', format: formatCurrency },
    { label: 'Tahsilat', key: 'collectedAmount', format: formatCurrency },
    { label: 'Durum', key: 'status' },
    { label: 'Tür', key: 'caseType' },
    { label: 'Avukat', key: 'lawyerName' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><GitCompare className="h-5 w-5" />Dosya Karşılaştırma</h3>
        {case1 && case2 && (
          <button className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><Download className="h-4 w-4" />Export</button>
        )}
      </div>

      {/* Case Selection */}
      <div className="grid md:grid-cols-2 gap-4">
        {[1, 2].map((num) => {
          const caseData = num === 1 ? case1 : case2;
          const isSelecting = selecting === num;
          return (
            <div key={num} className="bg-white border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium">Dosya {num}</span>
                {caseData && <button onClick={() => num === 1 ? setCase1(null) : setCase2(null)} className="p-1 hover:bg-gray-100 rounded"><X className="h-4 w-4" /></button>}
              </div>
              {caseData ? (
                <div className="space-y-1">
                  <p className="font-bold text-blue-600">{caseData.fileNumber}</p>
                  <p className="text-sm text-gray-600">{caseData.debtorName}</p>
                  <p className="text-sm text-gray-500">{formatCurrency(caseData.principalAmount)}</p>
                </div>
              ) : (
                <div>
                  {isSelecting ? (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Dosya ara..." className="w-full pl-10 pr-4 py-2 border rounded-lg" autoFocus />
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {searchResults.map((c) => (
                          <button key={c.id} onClick={() => selectCase(c)} className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded text-left">
                            <div><p className="font-medium text-sm">{c.fileNumber}</p><p className="text-xs text-gray-500">{c.debtorName}</p></div>
                            <span className="text-xs text-gray-400">{formatCurrency(c.principalAmount)}</span>
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setSelecting(null)} className="w-full text-sm text-gray-500 hover:underline">İptal</button>
                    </div>
                  ) : (
                    <button onClick={() => setSelecting(num as 1 | 2)} className="w-full py-8 border-2 border-dashed rounded-lg text-gray-400 hover:border-blue-400 hover:text-blue-500">
                      Dosya Seç
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Comparison Table */}
      {case1 && case2 && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium">Alan</th>
                <th className="text-left px-4 py-3 text-sm font-medium">{case1.fileNumber}</th>
                <th className="text-center px-4 py-3 text-sm font-medium w-16">Eşit</th>
                <th className="text-left px-4 py-3 text-sm font-medium">{case2.fileNumber}</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => {
                const val1 = case1[field.key as keyof CaseData];
                const val2 = case2[field.key as keyof CaseData];
                const display1 = field.format ? field.format(val1 as number) : val1;
                const display2 = field.format ? field.format(val2 as number) : val2;
                return (
                  <tr key={field.key} className="border-t">
                    <td className="px-4 py-3 text-sm text-gray-500">{field.label}</td>
                    <td className="px-4 py-3 text-sm font-medium">{display1}</td>
                    <td className="px-4 py-3 text-center">{compareField(val1, val2)}</td>
                    <td className="px-4 py-3 text-sm font-medium">{display2}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      {case1 && case2 && (
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-2xl font-bold text-green-600">{fields.filter(f => case1[f.key as keyof CaseData] === case2[f.key as keyof CaseData]).length}</p>
            <p className="text-xs text-gray-500">Eşit Alan</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-3">
            <p className="text-2xl font-bold text-orange-600">{fields.filter(f => case1[f.key as keyof CaseData] !== case2[f.key as keyof CaseData]).length}</p>
            <p className="text-xs text-gray-500">Farklı Alan</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-2xl font-bold text-blue-600">{fields.length}</p>
            <p className="text-xs text-gray-500">Toplam Alan</p>
          </div>
        </div>
      )}
    </div>
  );
}
