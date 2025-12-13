'use client';

import { useState, useEffect } from 'react';
import { History, X, Search, Clock, Trash2 } from 'lucide-react';

interface SearchHistoryItem {
  id: string;
  query: string;
  timestamp: string;
  type: 'case' | 'client' | 'debtor' | 'general';
}

interface SearchHistoryProps {
  onSelect: (query: string) => void;
  currentQuery?: string;
  storageKey?: string;
  maxItems?: number;
}

export function SearchHistory({ onSelect, currentQuery, storageKey = 'searchHistory', maxItems = 10 }: SearchHistoryProps) {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  // Yeni arama ekle
  useEffect(() => {
    if (currentQuery && currentQuery.length >= 2) {
      addToHistory(currentQuery);
    }
  }, [currentQuery]);

  const loadHistory = () => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      setHistory(JSON.parse(saved));
    }
  };

  const addToHistory = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return;

    // Aynı sorgu zaten varsa güncelle
    const existing = history.find(h => h.query.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      const updated = [
        { ...existing, timestamp: new Date().toISOString() },
        ...history.filter(h => h.id !== existing.id),
      ].slice(0, maxItems);
      setHistory(updated);
      localStorage.setItem(storageKey, JSON.stringify(updated));
      return;
    }

    const newItem: SearchHistoryItem = {
      id: Date.now().toString(),
      query: trimmed,
      timestamp: new Date().toISOString(),
      type: 'general',
    };

    const updated = [newItem, ...history].slice(0, maxItems);
    setHistory(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const removeFromHistory = (id: string) => {
    const updated = history.filter(h => h.id !== id);
    setHistory(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(storageKey);
    setIsOpen(false);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Az önce';
    if (minutes < 60) return `${minutes} dk önce`;
    if (hours < 24) return `${hours} saat önce`;
    if (days < 7) return `${days} gün önce`;
    return date.toLocaleDateString('tr-TR');
  };

  if (history.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
        title="Arama Geçmişi"
      >
        <History className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-white border rounded-lg shadow-lg z-50">
          <div className="p-2 border-b flex items-center justify-between">
            <p className="text-xs text-gray-500 font-medium flex items-center gap-1">
              <Clock className="h-3 w-3" /> Arama Geçmişi
            </p>
            <button
              onClick={clearHistory}
              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" /> Temizle
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 hover:bg-gray-50 border-b last:border-0"
              >
                <button
                  onClick={() => { onSelect(item.query); setIsOpen(false); }}
                  className="flex items-center gap-2 flex-1 text-left"
                >
                  <Search className="h-3 w-3 text-gray-400" />
                  <div className="min-w-0">
                    <p className="text-sm truncate">{item.query}</p>
                    <p className="text-xs text-gray-400">{formatTime(item.timestamp)}</p>
                  </div>
                </button>
                <button
                  onClick={() => removeFromHistory(item.id)}
                  className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
