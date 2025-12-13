'use client';

import { useState, useEffect } from 'react';
import { Filter, Save, Trash2, Check, X, Plus } from 'lucide-react';

interface SavedFilter {
  id: string;
  name: string;
  filters: Record<string, any>;
  createdAt: string;
}

interface SavedFiltersProps {
  currentFilters: Record<string, any>;
  onApplyFilter: (filters: Record<string, any>) => void;
  storageKey?: string;
}

export function SavedFilters({ currentFilters, onApplyFilter, storageKey = 'savedFilters' }: SavedFiltersProps) {
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadFilters();
  }, []);

  const loadFilters = () => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      setSavedFilters(JSON.parse(saved));
    }
  };

  const saveFilter = () => {
    if (!newFilterName.trim()) return;

    const newFilter: SavedFilter = {
      id: Date.now().toString(),
      name: newFilterName.trim(),
      filters: currentFilters,
      createdAt: new Date().toISOString(),
    };

    const updated = [...savedFilters, newFilter];
    setSavedFilters(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
    setNewFilterName('');
    setShowSaveModal(false);
  };

  const deleteFilter = (id: string) => {
    const updated = savedFilters.filter(f => f.id !== id);
    setSavedFilters(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const applyFilter = (filter: SavedFilter) => {
    onApplyFilter(filter.filters);
    setIsOpen(false);
  };

  const hasActiveFilters = Object.values(currentFilters).some(v => v && v !== '' && v !== 'ALL');

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-1 px-3 py-1.5 border rounded-lg text-sm ${
            savedFilters.length > 0 ? 'border-blue-300 text-blue-600' : 'border-gray-300 text-gray-600'
          } hover:bg-gray-50`}
        >
          <Filter className="h-4 w-4" />
          Kayıtlı Filtreler
          {savedFilters.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
              {savedFilters.length}
            </span>
          )}
        </button>

        {hasActiveFilters && (
          <button
            onClick={() => setShowSaveModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            <Save className="h-4 w-4" />
            Filtreyi Kaydet
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border rounded-lg shadow-lg z-50">
          <div className="p-2 border-b">
            <p className="text-xs text-gray-500 font-medium">Kayıtlı Filtreler</p>
          </div>
          {savedFilters.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              <Filter className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p>Henüz kayıtlı filtre yok</p>
              <p className="text-xs mt-1">Filtreleri uygulayıp kaydedin</p>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {savedFilters.map((filter) => (
                <div
                  key={filter.id}
                  className="flex items-center justify-between p-2 hover:bg-gray-50 border-b last:border-0"
                >
                  <button
                    onClick={() => applyFilter(filter)}
                    className="flex-1 text-left text-sm font-medium truncate"
                  >
                    {filter.name}
                  </button>
                  <button
                    onClick={() => deleteFilter(filter.id)}
                    className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="p-2 border-t bg-gray-50">
            <button
              onClick={() => setIsOpen(false)}
              className="w-full text-xs text-gray-500 hover:text-gray-700"
            >
              Kapat
            </button>
          </div>
        </div>
      )}

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-sm mx-4 p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Save className="h-5 w-5 text-blue-600" />
              Filtreyi Kaydet
            </h3>
            <input
              type="text"
              value={newFilterName}
              onChange={(e) => setNewFilterName(e.target.value)}
              placeholder="Filtre adı (ör: Yüksek Riskli Dosyalar)"
              className="w-full border rounded-lg px-3 py-2 text-sm mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowSaveModal(false); setNewFilterName(''); }}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={saveFilter}
                disabled={!newFilterName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
