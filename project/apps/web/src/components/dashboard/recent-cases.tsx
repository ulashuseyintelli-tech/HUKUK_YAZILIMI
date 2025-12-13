'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { FileText, Clock, ChevronRight, Star, StarOff } from 'lucide-react';
import Link from 'next/link';

interface RecentCase {
  id: string;
  fileNumber: string;
  clientName?: string;
  debtorName?: string;
  status: string;
  lastViewedAt?: string;
  isFavorite?: boolean;
}

export function RecentCases() {
  const [cases, setCases] = useState<RecentCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    loadRecentCases();
    loadFavorites();
  }, []);

  const loadRecentCases = async () => {
    try {
      const res = await api.get('/cases?limit=5&sort=updatedAt');
      const data = res.data?.data || res.data || [];
      setCases(data.slice(0, 5).map((c: any) => ({
        id: c.id,
        fileNumber: c.fileNumber,
        clientName: c.client?.displayName || c.client?.name,
        debtorName: c.debtors?.[0]?.debtor?.name,
        status: c.caseStatus || c.status,
      })));
    } catch (e) {
      // Demo data
      setCases([
        { id: '1', fileNumber: '2024/1234', clientName: 'ABC Ltd.', debtorName: 'Ahmet Yılmaz', status: 'ACTIVE' },
        { id: '2', fileNumber: '2024/1235', clientName: 'XYZ A.Ş.', debtorName: 'Mehmet Demir', status: 'ACTIVE' },
        { id: '3', fileNumber: '2024/1236', clientName: 'Test Şirketi', debtorName: 'Ali Veli', status: 'CLOSED' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadFavorites = () => {
    const saved = localStorage.getItem('favoriteCases');
    if (saved) setFavorites(JSON.parse(saved));
  };

  const toggleFavorite = (caseId: string) => {
    const newFavorites = favorites.includes(caseId)
      ? favorites.filter(id => id !== caseId)
      : [...favorites, caseId];
    setFavorites(newFavorites);
    localStorage.setItem('favoriteCases', JSON.stringify(newFavorites));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-700';
      case 'CLOSED': return 'bg-gray-100 text-gray-700';
      case 'SUSPENDED': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-blue-100 text-blue-700';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      ACTIVE: 'Aktif',
      CLOSED: 'Kapalı',
      SUSPENDED: 'Askıda',
      DERDEST: 'Derdest',
    };
    return labels[status] || status;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-4">
        <div className="h-6 bg-gray-200 rounded w-32 mb-4 animate-pulse" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-12 bg-gray-100 rounded-lg mb-2 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-500" />
          Son Dosyalar
        </h3>
        <Link href="/cases" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
          Tümü <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {cases.length === 0 ? (
        <p className="text-center text-gray-500 py-8 text-sm">Henüz dosya yok</p>
      ) : (
        <div className="space-y-2">
          {cases.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 border"
            >
              <Link href={`/cases/${c.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{c.fileNumber}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {c.clientName} → {c.debtorName || 'Borçlu'}
                  </p>
                </div>
              </Link>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs px-2 py-1 rounded ${getStatusColor(c.status)}`}>
                  {getStatusLabel(c.status)}
                </span>
                <button
                  onClick={() => toggleFavorite(c.id)}
                  className={`p-1 rounded hover:bg-gray-100 ${favorites.includes(c.id) ? 'text-yellow-500' : 'text-gray-300'}`}
                >
                  {favorites.includes(c.id) ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
