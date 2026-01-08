'use client';

import { useState, useEffect } from 'react';
import { History, Search, Star, Trash2, Clock, X, TrendingUp } from 'lucide-react';

interface SearchHistoryItem {
  id: string;
  query: string;
  timestamp: string;
  resultCount: number;
  isFavorite: boolean;
}

const STORAGE_KEY = 'searchHistory';
const MAX_HISTORY = 20;

export function SearchHistoryPanel() {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');

  useEffect(() => { loadHistory(); }, []);

  const loadHistory = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setHistory(JSON.parse(stored));
      else {
        const demo: SearchHistoryItem[] = [
          { id: '1', query: 'borçlu:Ahmet status:DERDEST', timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), resultCount: 12, isFavorite: true },
          { id: '2', query: 'tutar>100000', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), resultCount: 45, isFavorite: false },
          { id: '3', query: 'müvekkil:XYZ', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), resultCount: 8, isFavorite: true },
          { id: '4', query: 'risk:HIGH', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), resultCount: 23, isFavorite: false },
          { id: '5', query: 'tür:KAMBIYO tarih>2024-01-01', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(), resultCount: 67, isFavorite: false },
        ];
        setHistory(demo);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
      }
    } catch (e) { console.error('Failed to load history'); }
  };

  const saveHistory = (list: SearchHistoryItem[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setHistory(list);
  };

  const toggleFavorite = (id: string) => {
    saveHistory(history.map(h => h.id === id ? { ...h, isFavorite: !h.isFavorite } : h));
  };

  const deleteItem = (id: string) => {
    saveHistory(history.filter(h => h.id !== id));
  };

  const clearHistory = () => {
    if (confirm('Tüm arama geçmişi silinecek. Emin misiniz?')) {
      saveHistory(history.filter(h => h.isFavorite));
    }
  };

  const executeSearch = (query: string) => {
    alert(`Arama yapılıyor: ${query}`);
  };

  const formatTime = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 60) return `${mins} dk önce`;
    if (hours < 24) return `${hours} saat önce`;
    return `${days} gün önce`;
  };

  const filtered = filter === 'favorites' ? history.filter(h => h.isFavorite) : history;
  const frequentSearches = [...history].sort((a, b) => b.resultCount - a.resultCount).slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><History className="h-5 w-5" />Arama Geçmişi</h3>
        <button onClick={clearHistory} className="text-sm text-red-500 hover:text-red-700">Geçmişi Temizle</button>
      </div>

      {/* Frequent Searches */}
      {frequentSearches.length > 0 && (
        <div className="bg-blue-50 rounded-xl p-4">
          <h4 className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-1"><TrendingUp className="h-4 w-4" />Sık Kullanılan</h4>
          <div className="flex flex-wrap gap-2">
            {frequentSearches.map((s) => (
              <button key={s.id} onClick={() => executeSearch(s.query)} className="px-3 py-1.5 bg-white rounded-full text-sm hover:bg-blue-100 border border-blue-200">
                {s.query}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-lg text-sm ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
          Tümü ({history.length})
        </button>
        <button onClick={() => setFilter('favorites')} className={`px-3 py-1.5 rounded-lg text-sm ${filter === 'favorites' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
          <Star className="h-4 w-4 inline mr-1" />Favoriler ({history.filter(h => h.isFavorite).length})
        </button>
      </div>

      {/* History List */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Search className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>{filter === 'favorites' ? 'Favori arama yok' : 'Arama geçmişi boş'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-3 bg-white border rounded-lg hover:shadow-sm">
              <button onClick={() => executeSearch(item.query)} className="flex-1 text-left">
                <p className="font-medium text-sm">{item.query}</p>
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(item.timestamp)}</span>
                  <span>{item.resultCount} sonuç</span>
                </div>
              </button>
              <button onClick={() => toggleFavorite(item.id)} className={`p-1.5 rounded ${item.isFavorite ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-500'}`}>
                <Star className={`h-4 w-4 ${item.isFavorite ? 'fill-current' : ''}`} />
              </button>
              <button onClick={() => deleteItem(item.id)} className="p-1.5 rounded text-gray-300 hover:text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper function to add search to history
export function addToSearchHistory(query: string, resultCount: number) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const history: SearchHistoryItem[] = stored ? JSON.parse(stored) : [];
    const existing = history.find(h => h.query === query);
    if (existing) {
      existing.timestamp = new Date().toISOString();
      existing.resultCount = resultCount;
    } else {
      history.unshift({ id: Date.now().toString(), query, timestamp: new Date().toISOString(), resultCount, isFavorite: false });
      if (history.length > MAX_HISTORY) history.pop();
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (e) { console.error('Failed to save search'); }
}
