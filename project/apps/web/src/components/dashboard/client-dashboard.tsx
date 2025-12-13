'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Building, TrendingUp, FileText, DollarSign, Loader2, ExternalLink, PieChart } from 'lucide-react';

interface ClientSummary {
  id: string;
  name: string;
  type: 'REAL' | 'LEGAL';
  activeCases: number;
  closedCases: number;
  totalClaims: number;
  totalCollected: number;
  collectionRate: number;
  lastActivity?: string;
}

interface ClientDashboardProps {
  limit?: number;
}

export function ClientDashboard({ limit = 6 }: ClientDashboardProps) {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'claims' | 'collection' | 'cases'>('claims');

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reports/client-summary');
      setClients(res.data?.data || []);
    } catch (e) {
      // Demo data
      setClients([
        { id: '1', name: 'ABC Holding A.Ş.', type: 'LEGAL', activeCases: 25, closedCases: 15, totalClaims: 5200000, totalCollected: 3800000, collectionRate: 73, lastActivity: '2 saat önce' },
        { id: '2', name: 'XYZ Finans Ltd.', type: 'LEGAL', activeCases: 42, closedCases: 28, totalClaims: 8500000, totalCollected: 5100000, collectionRate: 60, lastActivity: '1 gün önce' },
        { id: '3', name: 'DEF Faktoring A.Ş.', type: 'LEGAL', activeCases: 18, closedCases: 32, totalClaims: 3200000, totalCollected: 2900000, collectionRate: 91, lastActivity: '3 saat önce' },
        { id: '4', name: 'Mehmet Yılmaz', type: 'REAL', activeCases: 3, closedCases: 5, totalClaims: 450000, totalCollected: 380000, collectionRate: 84, lastActivity: '1 hafta önce' },
        { id: '5', name: 'GHI Leasing A.Ş.', type: 'LEGAL', activeCases: 35, closedCases: 20, totalClaims: 6800000, totalCollected: 4200000, collectionRate: 62, lastActivity: '5 saat önce' },
        { id: '6', name: 'JKL Ticaret Ltd.', type: 'LEGAL', activeCases: 12, closedCases: 8, totalClaims: 1800000, totalCollected: 1500000, collectionRate: 83, lastActivity: '2 gün önce' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}M ₺`;
    }
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount);
  };

  const getCollectionColor = (rate: number) => {
    if (rate >= 80) return 'text-green-600';
    if (rate >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const sortedClients = [...clients].sort((a, b) => {
    if (sortBy === 'claims') return b.totalClaims - a.totalClaims;
    if (sortBy === 'collection') return b.collectionRate - a.collectionRate;
    return b.activeCases - a.activeCases;
  }).slice(0, limit);

  const totalStats = {
    totalClaims: clients.reduce((sum, c) => sum + c.totalClaims, 0),
    totalCollected: clients.reduce((sum, c) => sum + c.totalCollected, 0),
    activeCases: clients.reduce((sum, c) => sum + c.activeCases, 0),
    clientCount: clients.length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          <Building className="h-4 w-4" />
          Müvekkil Özeti
        </h3>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="claims">Alacağa Göre</option>
          <option value="collection">Tahsilata Göre</option>
          <option value="cases">Dosya Sayısına Göre</option>
        </select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <p className="text-xs text-blue-600">Müvekkil</p>
          <p className="text-xl font-bold text-blue-700">{totalStats.clientCount}</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 text-center">
          <p className="text-xs text-purple-600">Aktif Dosya</p>
          <p className="text-xl font-bold text-purple-700">{totalStats.activeCases}</p>
        </div>
        <div className="bg-orange-50 rounded-lg p-3 text-center">
          <p className="text-xs text-orange-600">Toplam Alacak</p>
          <p className="text-xl font-bold text-orange-700">{formatCurrency(totalStats.totalClaims)}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-xs text-green-600">Tahsilat</p>
          <p className="text-xl font-bold text-green-700">{formatCurrency(totalStats.totalCollected)}</p>
        </div>
      </div>

      {/* Client List */}
      <div className="space-y-2">
        {sortedClients.map((client) => (
          <div key={client.id} className="p-3 border rounded-lg hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                client.type === 'LEGAL' ? 'bg-purple-100' : 'bg-blue-100'
              }`}>
                <Building className={`h-5 w-5 ${
                  client.type === 'LEGAL' ? 'text-purple-600' : 'text-blue-600'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <a href={`/settings/clients?id=${client.id}`} className="font-medium hover:text-blue-600 truncate">
                    {client.name}
                  </a>
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    client.type === 'LEGAL' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {client.type === 'LEGAL' ? 'Tüzel' : 'Gerçek'}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                  <span>{client.activeCases} aktif / {client.closedCases} kapalı</span>
                  {client.lastActivity && <span>{client.lastActivity}</span>}
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatCurrency(client.totalClaims)}</p>
                <p className={`text-sm ${getCollectionColor(client.collectionRate)}`}>
                  %{client.collectionRate} tahsilat
                </p>
              </div>
            </div>
            {/* Progress Bar */}
            <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full"
                style={{ width: `${client.collectionRate}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {clients.length > limit && (
        <a
          href="/settings/clients"
          className="block text-center text-sm text-blue-600 hover:underline"
        >
          Tüm müvekkilleri görüntüle ({clients.length})
        </a>
      )}
    </div>
  );
}
