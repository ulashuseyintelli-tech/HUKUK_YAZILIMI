'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Bell, BellOff, ExternalLink, Trash2, Loader2, Search, Star } from 'lucide-react';

interface WatchedCase {
  id: string;
  caseId: string;
  fileNumber: string;
  debtorName: string;
  clientName: string;
  status: string;
  lastChange?: string;
  lastChangeDate?: string;
  notifyOnChange: boolean;
  addedAt: string;
}

interface CaseWatchlistProps {
  userId?: string;
  onNavigate?: (caseId: string) => void;
}

const STORAGE_KEY = 'caseWatchlist';

export function CaseWatchlist({ userId, onNavigate }: CaseWatchlistProps) {
  const [watchlist, setWatchlist] = useState<WatchedCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadWatchlist();
  }, []);

  const loadWatchlist = () => {
    setLoading(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setWatchlist(JSON.parse(stored));
      } else {
        // Demo data
        setWatchlist([
          {
            id: '1',
            caseId: 'c1',
            fileNumber: '2024/1234',
            debtorName: 'Ahmet Yılmaz',
            clientName: 'ABC Şirketi',
            status: 'ISLEMDE',
            lastChange: 'Durum güncellendi',
            lastChangeDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            notifyOnChange: true,
            addedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: '2',
            caseId: 'c2',
            fileNumber: '2024/1235',
            debtorName: 'XYZ Ltd.',
            clientName: 'DEF Holding',
            status: 'DERDEST',
            lastChange: 'Tahsilat eklendi',
            lastChangeDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            notifyOnChange: true,
            addedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: '3',
            caseId: 'c3',
            fileNumber: '2024/1236',
            debtorName: 'Mehmet Kaya',
            clientName: 'GHI A.Ş.',
            status: 'HITAM',
            notifyOnChange: false,
            addedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ]);
      }
    } catch (e) {
      console.error('Failed to load watchlist');
    } finally {
      setLoading(false);
    }
  };

  const saveWatchlist = (list: WatchedCase[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setWatchlist(list);
  };

  const handleToggleNotify = (id: string) => {
    const updated = watchlist.map(w =>
      w.id === id ? { ...w, notifyOnChange: !w.notifyOnChange } : w
    );
    saveWatchlist(updated);
  };

  const handleRemove = (id: string) => {
    if (!confirm('Bu dosyayı izleme listesinden çıkarmak istiyor musunuz?')) return;
    saveWatchlist(watchlist.filter(w => w.id !== id));
  };

  const handleNavigate = (caseId: string) => {
    if (onNavigate) {
      onNavigate(caseId);
    } else {
      window.location.href = `/cases/${caseId}`;
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      DERDEST: 'bg-blue-100 text-blue-700',
      ISLEMDE: 'bg-yellow-100 text-yellow-700',
      HITAM: 'bg-green-100 text-green-700',
      DERKENAR: 'bg-gray-100 text-gray-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  const formatRelativeTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (hours < 1) return 'Az önce';
    if (hours < 24) return `${hours} saat önce`;
    if (days < 7) return `${days} gün önce`;
    return new Date(date).toLocaleDateString('tr-TR');
  };

  const filteredList = watchlist.filter(w =>
    w.fileNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.debtorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.clientName.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          <Eye className="h-4 w-4" />
          İzleme Listesi
          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
            {watchlist.length}
          </span>
        </h3>
      </div>

      {/* Search */}
      {watchlist.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Dosya ara..."
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
          />
        </div>
      )}

      {/* List */}
      {filteredList.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <EyeOff className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">İzleme listesi boş</p>
          <p className="text-xs mt-1">Dosya detayından izlemeye ekleyebilirsiniz</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredList.map((item) => (
            <div
              key={item.id}
              className="p-3 border rounded-lg hover:bg-gray-50 group"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleNavigate(item.caseId)}
                      className="font-medium text-blue-600 hover:underline flex items-center gap-1"
                    >
                      {item.fileNumber}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                    <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(item.status)}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 truncate">{item.debtorName}</p>
                  <p className="text-xs text-gray-400">{item.clientName}</p>

                  {item.lastChange && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded">
                        {item.lastChange}
                      </span>
                      <span className="text-gray-400">
                        {formatRelativeTime(item.lastChangeDate!)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleToggleNotify(item.id)}
                    className={`p-1.5 rounded ${
                      item.notifyOnChange
                        ? 'text-blue-600 hover:bg-blue-50'
                        : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={item.notifyOnChange ? 'Bildirimleri Kapat' : 'Bildirimleri Aç'}
                  >
                    {item.notifyOnChange ? (
                      <Bell className="h-4 w-4" />
                    ) : (
                      <BellOff className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                    title="Listeden Çıkar"
                  >
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

// Helper function to add case to watchlist
export function addToWatchlist(caseData: {
  caseId: string;
  fileNumber: string;
  debtorName: string;
  clientName: string;
  status: string;
}) {
  const stored = localStorage.getItem(STORAGE_KEY);
  const watchlist: WatchedCase[] = stored ? JSON.parse(stored) : [];

  // Check if already exists
  if (watchlist.some(w => w.caseId === caseData.caseId)) {
    return false;
  }

  const newItem: WatchedCase = {
    id: Date.now().toString(),
    ...caseData,
    notifyOnChange: true,
    addedAt: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify([newItem, ...watchlist]));
  return true;
}

// Helper function to remove case from watchlist
export function removeFromWatchlist(caseId: string) {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return false;

  const watchlist: WatchedCase[] = JSON.parse(stored);
  const filtered = watchlist.filter(w => w.caseId !== caseId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return true;
}

// Helper function to check if case is in watchlist
export function isInWatchlist(caseId: string): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return false;

  const watchlist: WatchedCase[] = JSON.parse(stored);
  return watchlist.some(w => w.caseId === caseId);
}
