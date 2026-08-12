'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { FileText, Clock, ChevronRight, Star, StarOff } from 'lucide-react';
import Link from 'next/link';
import {
  type DashboardReadState,
  fromResponse,
  fromError,
  freshData,
  staleData,
  isPending,
  isStale,
} from '@/lib/dashboard-read-state';

interface RecentCase {
  id: string;
  fileNumber: string;
  clientName?: string;
  debtorName?: string;
  status: string;
  lastViewedAt?: string;
  isFavorite?: boolean;
}

/**
 * WSMR-A2: GET başarısızsa ÜÇ SAHTE DOSYA üretiliyordu — uydurma takip numarası,
 * müvekkil ve borçlu adı ("2024/1234 · ABC Ltd. · Ahmet Yılmaz") gerçek dosya gibi
 * listeleniyordu. Artık hata görünür; gerçek boşluk yalnız doğrulanmış yanıttan doğar.
 */
const validateCases = (raw: unknown): RecentCase[] | undefined => {
  const body = raw as { data?: unknown };
  const inner = (body?.data as { data?: unknown })?.data;
  const list = Array.isArray(inner) ? inner : Array.isArray(body?.data) ? body.data : undefined;
  if (!Array.isArray(list)) return undefined;
  const out: RecentCase[] = [];
  for (const c of list.slice(0, 5) as Array<Record<string, any>>) {
    if (!c || typeof c !== 'object' || typeof c.id !== 'string') return undefined;
    out.push({
      id: c.id,
      fileNumber: c.fileNumber,
      clientName: c.client?.displayName || c.client?.name,
      debtorName: c.debtors?.[0]?.debtor?.name,
      status: c.caseStatus || c.status,
    } as RecentCase);
  }
  return out;
};

export function RecentCases() {
  const [state, setState] = useState<DashboardReadState<RecentCase[]>>({ status: 'IDLE' });
  const cases = freshData(state) ?? staleData(state) ?? [];
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    loadRecentCases();
    loadFavorites();
  }, []);

  const loadRecentCases = async () => {
    setState((p) => (isPending(p) ? { status: 'LOADING' } : p));
    try {
      const res = await api.get('/cases?limit=5&sort=updatedAt');
      setState(fromResponse(res, validateCases, (v) => v.length === 0, Date.now()));
    } catch (e) {
      setState((prev) => fromError(e, prev, { endpoint: '/cases', widget: 'Son dosyalar' }));
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

  if (isPending(state)) {
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

      {isStale(state) && (
        <p className="mb-2 text-xs text-yellow-700">Güncel olmayabilir</p>
      )}
      {state.status === 'ERROR' && !isStale(state) ? (
        <div className="text-center py-8">
          <p className="text-sm font-medium text-red-600">Dosyalar alınamadı</p>
          <button
            type="button"
            onClick={loadRecentCases}
            className="mt-1 text-xs text-blue-600 underline hover:text-blue-800"
          >
            Tekrar dene
          </button>
        </div>
      ) : cases.length === 0 ? (
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
