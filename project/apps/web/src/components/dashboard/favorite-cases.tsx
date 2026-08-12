'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { reportClientError } from '@/lib/error-reporter';
import { Star, FileText, ChevronRight, X } from 'lucide-react';
import Link from 'next/link';

interface FavoriteCase {
  id: string;
  fileNumber: string;
  clientName?: string;
  status: string;
}

/**
 * WSMR-A2: her favori için `api.get(...).catch(() => null)` yapılıp `null`'lar
 * filtreleniyordu. Beş favoriden üçü yüklenemezse kullanıcı SESSİZCE yalnız ikisini
 * görüyor, kaybolanlardan haberi olmuyordu. Artık kısmi hata GÖRÜNÜR ve tekrar
 * denenebilir; hiçbir favori sessizce düşmez.
 */
export function FavoriteCases() {
  const [cases, setCases] = useState<FavoriteCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [failedCount, setFailedCount] = useState(0);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    setLoading(true);
    setFailedCount(0);
    const saved = localStorage.getItem('favoriteCases');
    if (!saved) {
      setCases([]);
      setLoading(false);
      return;
    }

    const ids = JSON.parse(saved) as string[];
    setFavoriteIds(ids);

    if (ids.length === 0) {
      setCases([]);
      setLoading(false);
      return;
    }

    const wanted = ids.slice(0, 5);
    const results = await Promise.allSettled(wanted.map((id) => api.get(`/cases/${id}`)));

    const loaded: FavoriteCase[] = [];
    let failed = 0;
    results.forEach((r, i) => {
      const body = r.status === 'fulfilled' ? (r.value as { data?: any })?.data : undefined;
      if (r.status !== 'fulfilled' || !body || typeof body.id !== 'string') {
        failed += 1;
        reportClientError({
          level: 'ERROR',
          message: 'favori dosya okunamadı',
          endpoint: '/cases/:id',
          metadata: { safeErrorCode: 'FAVORITE_CASE_READ_FAILED' },
        });
        return;
      }
      loaded.push({
        id: body.id,
        fileNumber: body.fileNumber,
        clientName: body.client?.displayName || body.client?.name,
        status: body.caseStatus || body.status,
      } as FavoriteCase);
    });

    setCases(loaded);
    setFailedCount(failed);
    setLoading(false);
  };

  const removeFavorite = (caseId: string) => {
    const newIds = favoriteIds.filter(id => id !== caseId);
    setFavoriteIds(newIds);
    setCases(cases.filter(c => c.id !== caseId));
    localStorage.setItem('favoriteCases', JSON.stringify(newIds));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-700';
      case 'CLOSED': return 'bg-gray-100 text-gray-700';
      default: return 'bg-blue-100 text-blue-700';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-4">
        <div className="h-6 bg-gray-200 rounded w-32 mb-4 animate-pulse" />
        <div className="h-20 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (favoriteIds.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-4">
        <h3 className="font-semibold flex items-center gap-2 mb-4">
          <Star className="h-5 w-5 text-yellow-500" />
          Favori Dosyalar
        </h3>
        <div className="text-center py-6 text-gray-500 text-sm">
          <Star className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p>Henüz favori dosya yok</p>
          <p className="text-xs mt-1">Dosya listesinde yıldız ikonuna tıklayarak ekleyin</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-500" />
          Favori Dosyalar
        </h3>
        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
          {favoriteIds.length}
        </span>
      </div>

      {/* Kısmi hata artık SESSİZ değil: kaç favorinin okunamadığı yazılır. */}
      {failedCount > 0 && (
        <div className="mb-2 rounded-lg bg-red-50 px-2 py-1.5">
          <p className="text-xs font-medium text-red-700">
            {failedCount} favori dosya alınamadı
          </p>
          <button
            type="button"
            onClick={loadFavorites}
            className="text-xs text-blue-600 underline hover:text-blue-800"
          >
            Tekrar dene
          </button>
        </div>
      )}

      <div className="space-y-2">
        {cases.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between p-2 rounded-lg hover:bg-yellow-50 border border-yellow-200"
          >
            <Link href={`/cases/${c.id}`} className="flex items-center gap-2 flex-1 min-w-0">
              <FileText className="h-4 w-4 text-yellow-600 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{c.fileNumber}</p>
                {c.clientName && (
                  <p className="text-xs text-gray-500 truncate">{c.clientName}</p>
                )}
              </div>
            </Link>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className={`text-xs px-1.5 py-0.5 rounded ${getStatusColor(c.status)}`}>
                {c.status === 'ACTIVE' ? 'Aktif' : c.status}
              </span>
              <button
                onClick={() => removeFavorite(c.id)}
                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
