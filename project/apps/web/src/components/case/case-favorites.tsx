'use client';

import { useState, useEffect } from 'react';
import { Star, Trash2, ExternalLink, FolderOpen, Search, SortAsc, SortDesc } from 'lucide-react';

interface FavoriteCase {
  id: string;
  fileNumber: string;
  debtorName: string;
  clientName: string;
  principalAmount: number;
  status: string;
  addedAt: string;
  note?: string;
}

const STORAGE_KEY = 'caseFavorites';

type SortField = 'addedAt' | 'fileNumber' | 'debtorName' | 'principalAmount';

export function CaseFavorites() {
  const [favorites, setFavorites] = useState<FavoriteCase[]>([]);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('addedAt');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setFavorites(JSON.parse(stored));
    } catch (e) {
      console.error('Failed to load favorites');
    }
  };

  const saveFavorites = (list: FavoriteCase[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setFavorites(list);
  };

  const removeFavorite = (id: string) => {
    saveFavorites(favorites.filter(f => f.id !== id));
  };

  const updateNote = (id: string, note: string) => {
    saveFavorites(favorites.map(f => f.id === id ? { ...f, note } : f));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount);
  };

  const filtered = favorites
    .filter(f => 
      f.fileNumber.toLowerCase().includes(search.toLowerCase()) ||
      f.debtorName.toLowerCase().includes(search.toLowerCase()) ||
      f.clientName.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === 'addedAt') cmp = new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
      else if (sortField === 'fileNumber') cmp = a.fileNumber.localeCompare(b.fileNumber);
      else if (sortField === 'debtorName') cmp = a.debtorName.localeCompare(b.debtorName);
      else if (sortField === 'principalAmount') cmp = a.principalAmount - b.principalAmount;
      return sortAsc ? cmp : -cmp;
    });

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const SortIcon = sortAsc ? SortAsc : SortDesc;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-500 fill-current" />
          Favori Dosyalar ({favorites.length})
        </h3>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Dosya ara..."
          className="w-full pl-10 pr-4 py-2 border rounded-lg"
        />
      </div>

      {/* Sort Buttons */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">Sırala:</span>
        {[
          { field: 'addedAt' as SortField, label: 'Eklenme' },
          { field: 'fileNumber' as SortField, label: 'Dosya No' },
          { field: 'debtorName' as SortField, label: 'Borçlu' },
          { field: 'principalAmount' as SortField, label: 'Tutar' },
        ].map(({ field, label }) => (
          <button
            key={field}
            onClick={() => toggleSort(field)}
            className={`px-2 py-1 rounded flex items-center gap-1 ${sortField === field ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
          >
            {label}
            {sortField === field && <SortIcon className="h-3 w-3" />}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>{search ? 'Sonuç bulunamadı' : 'Henüz favori dosya yok'}</p>
          <p className="text-sm mt-1">Dosya detay sayfasından yıldız ikonuna tıklayarak favori ekleyebilirsiniz</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((fav) => (
            <div key={fav.id} className="bg-white border rounded-lg p-3 hover:shadow-sm transition-shadow">
              <div className="flex items-start gap-3">
                <Star className="h-5 w-5 text-yellow-500 fill-current flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <a href={`/cases/${fav.id}`} className="font-medium text-blue-600 hover:underline">{fav.fileNumber}</a>
                    <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">{fav.status}</span>
                  </div>
                  <p className="text-sm text-gray-600 truncate">{fav.debtorName}</p>
                  <p className="text-xs text-gray-400">{fav.clientName}</p>
                  {fav.note && <p className="text-xs text-blue-600 mt-1 italic">"{fav.note}"</p>}
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(fav.principalAmount)}</p>
                  <p className="text-xs text-gray-400">{new Date(fav.addedAt).toLocaleDateString('tr-TR')}</p>
                </div>
                <div className="flex items-center gap-1">
                  <a href={`/cases/${fav.id}`} className="p-1.5 hover:bg-gray-100 rounded" title="Görüntüle">
                    <ExternalLink className="h-4 w-4 text-gray-400" />
                  </a>
                  <button onClick={() => removeFavorite(fav.id)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500" title="Kaldır">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper functions for external use
export function addToFavorites(caseData: Omit<FavoriteCase, 'addedAt'>) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const favorites: FavoriteCase[] = stored ? JSON.parse(stored) : [];
    if (!favorites.find(f => f.id === caseData.id)) {
      favorites.unshift({ ...caseData, addedAt: new Date().toISOString() });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    }
  } catch (e) { console.error('Failed to add favorite'); }
}

export function removeFromFavorites(caseId: string) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const favorites: FavoriteCase[] = JSON.parse(stored);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites.filter(f => f.id !== caseId)));
    }
  } catch (e) { console.error('Failed to remove favorite'); }
}

export function isFavorite(caseId: string): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const favorites: FavoriteCase[] = JSON.parse(stored);
      return favorites.some(f => f.id === caseId);
    }
  } catch (e) {}
  return false;
}
