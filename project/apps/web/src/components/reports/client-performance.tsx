'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toActionErrorMessage } from '@/lib/action-error';
import { Users, TrendingUp, DollarSign, FileText, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import Link from 'next/link';

interface ClientPerformance {
  id: string;
  name: string;
  totalCases: number;
  activeCases: number;
  closedCases: number;
  totalPrincipal: number;
  totalCollected: number;
  collectionRate: number;
  avgCaseDuration: number;
  lastCaseDate?: string;
}

export function ClientPerformanceReport() {
  const [clients, setClients] = useState<ClientPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  // WSMR-A3b: GET basarisizsa DEMO KAYIT uretilmez; gorunur hata + retry.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'totalCases' | 'collectionRate' | 'totalCollected'>('totalCases');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoadError(null);
    try {
      const res = await api.get('/reports/client-performance');
      setClients(res.data?.data || []);
    } catch (e) {
      // WSMR-A3b · UYDURMA RAPOR KAYITLARI KALDIRILDI.
      // Eskiden burada sabit sahte satirlar (uydurma unvan, dosya sayisi ve
      // tahsilat tutari) GERCEK rapor gibi gosteriliyordu.
      setClients([]);
      setLoadError(toActionErrorMessage(e, 'Müvekkil performans raporu alınamadı'));
    } finally {
      setLoading(false);
    }
  };

  const sortedClients = [...clients].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    return sortOrder === 'desc' ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number);
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value);
  };

  const totalStats = {
    totalCases: clients.reduce((sum, c) => sum + c.totalCases, 0),
    totalPrincipal: clients.reduce((sum, c) => sum + c.totalPrincipal, 0),
    totalCollected: clients.reduce((sum, c) => sum + c.totalCollected, 0),
    avgCollectionRate: clients.length > 0 ? clients.reduce((sum, c) => sum + c.collectionRate, 0) / clients.length : 0,
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  // WSMR-A3b: hata gorunur ve tekrar denenebilir; sahte satir GOSTERILMEZ.
  if (loadError) {
    return (
      <div className="bg-white rounded-xl border p-6 text-center" role="alert">
        <p className="text-sm font-medium text-red-600">{loadError}</p>
        <button
          type="button"
          onClick={loadData}
          className="mt-2 text-xs text-blue-600 underline hover:text-blue-800"
        >
          Tekrar dene
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Özet Kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-5 w-5 text-blue-600" />
            <span className="text-sm text-gray-600">Toplam Müvekkil</span>
          </div>
          <p className="text-2xl font-bold">{clients.length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-5 w-5 text-green-600" />
            <span className="text-sm text-gray-600">Toplam Dosya</span>
          </div>
          <p className="text-2xl font-bold">{totalStats.totalCases}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-5 w-5 text-purple-600" />
            <span className="text-sm text-gray-600">Toplam Alacak</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totalStats.totalPrincipal)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            <span className="text-sm text-gray-600">Ort. Tahsilat Oranı</span>
          </div>
          <p className="text-2xl font-bold">%{totalStats.avgCollectionRate.toFixed(1)}</p>
        </div>
      </div>

      {/* Müvekkil Tablosu */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Müvekkil Performans Raporu
          </h3>
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-sm border rounded-lg px-2 py-1"
            >
              <option value="totalCases">Dosya Sayısı</option>
              <option value="collectionRate">Tahsilat Oranı</option>
              <option value="totalCollected">Tahsilat Tutarı</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="p-1 border rounded hover:bg-gray-50"
            >
              {sortOrder === 'desc' ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium">Müvekkil</th>
                <th className="text-right px-4 py-3 text-sm font-medium">Toplam Dosya</th>
                <th className="text-right px-4 py-3 text-sm font-medium">Aktif</th>
                <th className="text-right px-4 py-3 text-sm font-medium">Kapalı</th>
                <th className="text-right px-4 py-3 text-sm font-medium">Toplam Alacak</th>
                <th className="text-right px-4 py-3 text-sm font-medium">Tahsilat</th>
                <th className="text-right px-4 py-3 text-sm font-medium">Oran</th>
                <th className="text-right px-4 py-3 text-sm font-medium">Ort. Süre</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedClients.map((client) => (
                <tr key={client.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/settings/clients?id=${client.id}`} className="font-medium text-blue-600 hover:underline">
                      {client.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">{client.totalCases}</td>
                  <td className="px-4 py-3 text-right text-green-600">{client.activeCases}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{client.closedCases}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(client.totalPrincipal)}</td>
                  <td className="px-4 py-3 text-right font-medium text-emerald-600">{formatCurrency(client.totalCollected)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      client.collectionRate >= 50 ? 'bg-green-100 text-green-700' :
                      client.collectionRate >= 25 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      %{client.collectionRate.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{client.avgCaseDuration} gün</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
