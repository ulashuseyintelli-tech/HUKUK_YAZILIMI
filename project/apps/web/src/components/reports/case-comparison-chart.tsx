'use client';

import { useState } from 'react';
import { BarChart3, Plus, X, Search, TrendingUp, DollarSign, Clock, FileText } from 'lucide-react';

interface ComparisonCase {
  id: string;
  fileNumber: string;
  debtorName: string;
  principalAmount: number;
  collectedAmount: number;
  durationDays: number;
  status: string;
  collectionRate: number;
}

export function CaseComparisonChart() {
  const [cases, setCases] = useState<ComparisonCase[]>([]);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const searchResults: ComparisonCase[] = [
    { id: '1', fileNumber: '2024/1001', debtorName: 'Ahmet Yılmaz', principalAmount: 150000, collectedAmount: 120000, durationDays: 90, status: 'HITAM', collectionRate: 80 },
    { id: '2', fileNumber: '2024/1002', debtorName: 'XYZ Ltd.', principalAmount: 500000, collectedAmount: 350000, durationDays: 120, status: 'ISLEMDE', collectionRate: 70 },
    { id: '3', fileNumber: '2024/1003', debtorName: 'Mehmet Kaya', principalAmount: 75000, collectedAmount: 75000, durationDays: 45, status: 'HITAM', collectionRate: 100 },
    { id: '4', fileNumber: '2024/1004', debtorName: 'ABC Holding', principalAmount: 1200000, collectedAmount: 600000, durationDays: 180, status: 'ISLEMDE', collectionRate: 50 },
  ].filter(c => !cases.find(cc => cc.id === c.id) && (c.fileNumber.includes(search) || c.debtorName.toLowerCase().includes(search.toLowerCase())));

  const addCase = (c: ComparisonCase) => {
    if (cases.length < 5) {
      setCases([...cases, c]);
      setSearch('');
      setShowSearch(false);
    }
  };

  const removeCase = (id: string) => setCases(cases.filter(c => c.id !== id));

  const formatCurrency = (n: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
  const maxAmount = Math.max(...cases.map(c => c.principalAmount), 1);
  const maxDays = Math.max(...cases.map(c => c.durationDays), 1);

  const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><BarChart3 className="h-5 w-5" />Dosya Karşılaştırma</h3>
        {cases.length < 5 && (
          <button onClick={() => setShowSearch(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Plus className="h-4 w-4" />Dosya Ekle
          </button>
        )}
      </div>

      {/* Search Modal */}
      {showSearch && (
        <div className="bg-white border rounded-lg p-4 shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <Search className="h-4 w-4 text-gray-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Dosya no veya borçlu ara..." className="flex-1 border-none outline-none" autoFocus />
            <button onClick={() => setShowSearch(false)} className="p-1 hover:bg-gray-100 rounded"><X className="h-4 w-4" /></button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {searchResults.map((c) => (
              <button key={c.id} onClick={() => addCase(c)} className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded text-left">
                <div>
                  <p className="font-medium text-sm">{c.fileNumber}</p>
                  <p className="text-xs text-gray-500">{c.debtorName}</p>
                </div>
                <span className="text-sm text-gray-600">{formatCurrency(c.principalAmount)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {cases.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Karşılaştırmak için dosya ekleyin</p>
          <p className="text-sm">En fazla 5 dosya karşılaştırabilirsiniz</p>
        </div>
      ) : (
        <>
          {/* Selected Cases */}
          <div className="flex flex-wrap gap-2">
            {cases.map((c, i) => (
              <div key={c.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-sm ${colors[i]}`}>
                <span>{c.fileNumber}</span>
                <button onClick={() => removeCase(c.id)} className="hover:bg-white/20 rounded-full p-0.5"><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Amount Chart */}
            <div className="bg-white rounded-xl border p-4">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2"><DollarSign className="h-4 w-4" />Tutar Karşılaştırması</h4>
              <div className="space-y-3">
                {cases.map((c, i) => (
                  <div key={c.id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>{c.fileNumber}</span>
                      <span>{formatCurrency(c.principalAmount)}</span>
                    </div>
                    <div className="h-6 bg-gray-100 rounded overflow-hidden flex">
                      <div className={`${colors[i]} opacity-50`} style={{ width: `${(c.principalAmount / maxAmount) * 100}%` }} />
                      <div className={`${colors[i]}`} style={{ width: `${(c.collectedAmount / maxAmount) * 100}%`, marginLeft: `-${(c.principalAmount / maxAmount) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-300 rounded" />Ana Para</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded" />Tahsilat</span>
              </div>
            </div>

            {/* Collection Rate Chart */}
            <div className="bg-white rounded-xl border p-4">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4" />Tahsilat Oranı</h4>
              <div className="space-y-3">
                {cases.map((c, i) => (
                  <div key={c.id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>{c.fileNumber}</span>
                      <span>%{c.collectionRate}</span>
                    </div>
                    <div className="h-6 bg-gray-100 rounded overflow-hidden">
                      <div className={`h-full ${colors[i]} rounded`} style={{ width: `${c.collectionRate}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Duration Chart */}
            <div className="bg-white rounded-xl border p-4">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2"><Clock className="h-4 w-4" />Süre (Gün)</h4>
              <div className="space-y-3">
                {cases.map((c, i) => (
                  <div key={c.id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>{c.fileNumber}</span>
                      <span>{c.durationDays} gün</span>
                    </div>
                    <div className="h-6 bg-gray-100 rounded overflow-hidden">
                      <div className={`h-full ${colors[i]} rounded`} style={{ width: `${(c.durationDays / maxDays) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary Table */}
            <div className="bg-white rounded-xl border p-4">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2"><FileText className="h-4 w-4" />Özet</h4>
              <table className="w-full text-xs">
                <thead><tr className="text-gray-500"><th className="text-left py-1">Dosya</th><th className="text-right">Oran</th><th className="text-right">Süre</th></tr></thead>
                <tbody>
                  {cases.map((c, i) => (
                    <tr key={c.id} className="border-t">
                      <td className="py-2"><span className={`inline-block w-2 h-2 rounded-full ${colors[i]} mr-2`} />{c.fileNumber}</td>
                      <td className="text-right">%{c.collectionRate}</td>
                      <td className="text-right">{c.durationDays}g</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
