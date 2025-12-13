'use client';

import { useState, useEffect } from 'react';
import { Filter, Save, Trash2, Star, StarOff, Edit, X, Check, Loader2, FolderOpen, Clock, Search } from 'lucide-react';

interface FilterCondition {
  field: string;
  operator: string;
  value: string | number | boolean | string[];
}

interface SavedFilter {
  id: string;
  name: string;
  description?: string;
  conditions: FilterCondition[];
  isFavorite: boolean;
  createdAt: string;
  lastUsed?: string;
  useCount: number;
}

interface AdvancedFilterSaveProps {
  currentFilters: FilterCondition[];
  onApplyFilter: (conditions: FilterCondition[]) => void;
  storageKey?: string;
}

const FILTER_FIELDS = [
  { id: 'status', label: 'Durum', type: 'select', options: ['DERDEST', 'ISLEMDE', 'HITAM', 'DERKENAR'] },
  { id: 'riskLevel', label: 'Risk', type: 'select', options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
  { id: 'caseType', label: 'Takip Türü', type: 'select', options: ['ILAMSIZ', 'ILAMLI', 'KAMBIYO', 'REHIN', 'IPOTEKLI'] },
  { id: 'principalAmount', label: 'Ana Para', type: 'number' },
  { id: 'caseDate', label: 'Dosya Tarihi', type: 'date' },
  { id: 'lawyerId', label: 'Avukat', type: 'text' },
  { id: 'clientId', label: 'Müvekkil', type: 'text' },
  { id: 'hasCollection', label: 'Tahsilat Var', type: 'boolean' },
];

const OPERATORS = {
  text: [
    { id: 'contains', label: 'İçerir' },
    { id: 'equals', label: 'Eşittir' },
    { id: 'startsWith', label: 'İle Başlar' },
    { id: 'endsWith', label: 'İle Biter' },
  ],
  number: [
    { id: 'equals', label: '=' },
    { id: 'gt', label: '>' },
    { id: 'gte', label: '>=' },
    { id: 'lt', label: '<' },
    { id: 'lte', label: '<=' },
    { id: 'between', label: 'Arasında' },
  ],
  date: [
    { id: 'equals', label: 'Tarihinde' },
    { id: 'before', label: 'Önce' },
    { id: 'after', label: 'Sonra' },
    { id: 'between', label: 'Arasında' },
  ],
  select: [
    { id: 'equals', label: 'Eşittir' },
    { id: 'in', label: 'İçinde' },
    { id: 'notIn', label: 'Dışında' },
  ],
  boolean: [
    { id: 'equals', label: 'Eşittir' },
  ],
};

export function AdvancedFilterSave({ currentFilters, onApplyFilter, storageKey = 'advancedFilters' }: AdvancedFilterSaveProps) {
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const [newFilterDesc, setNewFilterDesc] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        setSavedFilters(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse saved filters');
      }
    }
  }, [storageKey]);

  const saveToStorage = (filters: SavedFilter[]) => {
    localStorage.setItem(storageKey, JSON.stringify(filters));
    setSavedFilters(filters);
  };

  const handleSaveFilter = () => {
    if (!newFilterName.trim() || currentFilters.length === 0) return;
    setSaving(true);

    setTimeout(() => {
      const newFilter: SavedFilter = {
        id: Date.now().toString(),
        name: newFilterName.trim(),
        description: newFilterDesc.trim() || undefined,
        conditions: currentFilters,
        isFavorite: false,
        createdAt: new Date().toISOString(),
        useCount: 0,
      };

      saveToStorage([newFilter, ...savedFilters]);
      setNewFilterName('');
      setNewFilterDesc('');
      setShowSaveModal(false);
      setSaving(false);
    }, 300);
  };

  const handleApplyFilter = (filter: SavedFilter) => {
    const updated = savedFilters.map(f => 
      f.id === filter.id 
        ? { ...f, lastUsed: new Date().toISOString(), useCount: f.useCount + 1 }
        : f
    );
    saveToStorage(updated);
    onApplyFilter(filter.conditions);
  };

  const handleToggleFavorite = (id: string) => {
    const updated = savedFilters.map(f => 
      f.id === id ? { ...f, isFavorite: !f.isFavorite } : f
    );
    saveToStorage(updated);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Bu filtreyi silmek istediğinize emin misiniz?')) return;
    saveToStorage(savedFilters.filter(f => f.id !== id));
  };

  const handleEditName = (filter: SavedFilter) => {
    setEditingId(filter.id);
    setEditName(filter.name);
  };

  const handleSaveEdit = () => {
    if (!editingId || !editName.trim()) return;
    const updated = savedFilters.map(f => 
      f.id === editingId ? { ...f, name: editName.trim() } : f
    );
    saveToStorage(updated);
    setEditingId(null);
    setEditName('');
  };

  const getFieldLabel = (fieldId: string) => {
    return FILTER_FIELDS.find(f => f.id === fieldId)?.label || fieldId;
  };

  const getOperatorLabel = (fieldId: string, operatorId: string) => {
    const field = FILTER_FIELDS.find(f => f.id === fieldId);
    const type = field?.type || 'text';
    const operators = OPERATORS[type as keyof typeof OPERATORS] || OPERATORS.text;
    return operators.find(o => o.id === operatorId)?.label || operatorId;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('tr-TR');
  };

  const formatRelativeTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Az önce';
    if (minutes < 60) return `${minutes} dk önce`;
    if (hours < 24) return `${hours} saat önce`;
    if (days < 7) return `${days} gün önce`;
    return formatDate(date);
  };

  const filteredFilters = savedFilters.filter(f => 
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const favoriteFilters = filteredFilters.filter(f => f.isFavorite);
  const recentFilters = filteredFilters
    .filter(f => !f.isFavorite)
    .sort((a, b) => {
      if (a.lastUsed && b.lastUsed) return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
      if (a.lastUsed) return -1;
      if (b.lastUsed) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Kayıtlı Filtreler
        </h3>
        <button
          onClick={() => setShowSaveModal(true)}
          disabled={currentFilters.length === 0}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="h-4 w-4" />
          Mevcut Filtreyi Kaydet
        </button>
      </div>

      {/* Search */}
      {savedFilters.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtre ara..."
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
          />
        </div>
      )}

      {/* Favorites */}
      {favoriteFilters.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase flex items-center gap-1">
            <Star className="h-3 w-3" />
            Favoriler
          </p>
          {favoriteFilters.map((filter) => (
            <FilterCard
              key={filter.id}
              filter={filter}
              editingId={editingId}
              editName={editName}
              setEditName={setEditName}
              onApply={handleApplyFilter}
              onToggleFavorite={handleToggleFavorite}
              onEdit={handleEditName}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={() => setEditingId(null)}
              onDelete={handleDelete}
              getFieldLabel={getFieldLabel}
              getOperatorLabel={getOperatorLabel}
              formatRelativeTime={formatRelativeTime}
            />
          ))}
        </div>
      )}

      {/* Recent */}
      {recentFilters.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Son Kullanılan
          </p>
          {recentFilters.map((filter) => (
            <FilterCard
              key={filter.id}
              filter={filter}
              editingId={editingId}
              editName={editName}
              setEditName={setEditName}
              onApply={handleApplyFilter}
              onToggleFavorite={handleToggleFavorite}
              onEdit={handleEditName}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={() => setEditingId(null)}
              onDelete={handleDelete}
              getFieldLabel={getFieldLabel}
              getOperatorLabel={getOperatorLabel}
              formatRelativeTime={formatRelativeTime}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {savedFilters.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <FolderOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Henüz kayıtlı filtre yok</p>
          <p className="text-xs mt-1">Filtreleri uygulayıp kaydedin</p>
        </div>
      )}

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Filtreyi Kaydet</h3>
              <button onClick={() => setShowSaveModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Filtre Adı *</label>
                <input
                  type="text"
                  value={newFilterName}
                  onChange={(e) => setNewFilterName(e.target.value)}
                  placeholder="Örn: Yüksek Riskli Aktif Dosyalar"
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Açıklama</label>
                <textarea
                  value={newFilterDesc}
                  onChange={(e) => setNewFilterDesc(e.target.value)}
                  placeholder="Bu filtre ne işe yarar?"
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 resize-none"
                />
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 mb-2">Filtre Koşulları ({currentFilters.length})</p>
                <div className="space-y-1">
                  {currentFilters.map((cond, i) => (
                    <p key={i} className="text-sm">
                      <span className="font-medium">{getFieldLabel(cond.field)}</span>
                      {' '}
                      <span className="text-gray-500">{getOperatorLabel(cond.field, cond.operator)}</span>
                      {' '}
                      <span className="text-blue-600">{String(cond.value)}</span>
                    </p>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleSaveFilter}
                disabled={!newFilterName.trim() || saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface FilterCardProps {
  filter: SavedFilter;
  editingId: string | null;
  editName: string;
  setEditName: (name: string) => void;
  onApply: (filter: SavedFilter) => void;
  onToggleFavorite: (id: string) => void;
  onEdit: (filter: SavedFilter) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  getFieldLabel: (fieldId: string) => string;
  getOperatorLabel: (fieldId: string, operatorId: string) => string;
  formatRelativeTime: (date: string) => string;
}

function FilterCard({
  filter,
  editingId,
  editName,
  setEditName,
  onApply,
  onToggleFavorite,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  getFieldLabel,
  getOperatorLabel,
  formatRelativeTime,
}: FilterCardProps) {
  const isEditing = editingId === filter.id;

  return (
    <div className="p-3 border rounded-lg hover:bg-gray-50 group">
      <div className="flex items-start gap-2">
        <button
          onClick={() => onToggleFavorite(filter.id)}
          className={`p-1 rounded ${filter.isFavorite ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-500'}`}
        >
          {filter.isFavorite ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
        </button>

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="flex-1 border rounded px-2 py-1 text-sm"
                autoFocus
              />
              <button onClick={onSaveEdit} className="p-1 text-green-600 hover:bg-green-50 rounded">
                <Check className="h-4 w-4" />
              </button>
              <button onClick={onCancelEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <p className="font-medium text-sm">{filter.name}</p>
              {filter.description && (
                <p className="text-xs text-gray-500 truncate">{filter.description}</p>
              )}
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                <span>{filter.conditions.length} koşul</span>
                <span>•</span>
                <span>{filter.useCount} kullanım</span>
                {filter.lastUsed && (
                  <>
                    <span>•</span>
                    <span>{formatRelativeTime(filter.lastUsed)}</span>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {!isEditing && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onApply(filter)}
              className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
            >
              Uygula
            </button>
            <button
              onClick={() => onEdit(filter)}
              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
            >
              <Edit className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(filter.id)}
              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
