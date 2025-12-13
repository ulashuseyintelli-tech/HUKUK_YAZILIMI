'use client';

import { useState, useEffect } from 'react';
import { Tag, Plus, Edit, Trash2, Check, X, Loader2, BarChart3 } from 'lucide-react';

interface TagDefinition {
  id: string;
  name: string;
  color: string;
  usageCount: number;
  createdAt: string;
}

interface TagManagerProps {
  onTagSelect?: (tag: TagDefinition) => void;
}

const COLORS = [
  { id: 'red', bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
  { id: 'orange', bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  { id: 'yellow', bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  { id: 'green', bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  { id: 'blue', bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  { id: 'purple', bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  { id: 'pink', bg: 'bg-pink-100', text: 'text-pink-700', dot: 'bg-pink-500' },
  { id: 'gray', bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' },
];

const STORAGE_KEY = 'globalTags';

export function TagManager({ onTagSelect }: TagManagerProps) {
  const [tags, setTags] = useState<TagDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', color: 'blue' });
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = () => {
    setLoading(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setTags(JSON.parse(stored));
      } else {
        const defaults: TagDefinition[] = [
          { id: '1', name: 'Acil', color: 'red', usageCount: 12, createdAt: new Date().toISOString() },
          { id: '2', name: 'VIP Müvekkil', color: 'purple', usageCount: 8, createdAt: new Date().toISOString() },
          { id: '3', name: 'Yüksek Tutar', color: 'green', usageCount: 15, createdAt: new Date().toISOString() },
          { id: '4', name: 'Takipte', color: 'blue', usageCount: 25, createdAt: new Date().toISOString() },
          { id: '5', name: 'Beklemede', color: 'orange', usageCount: 10, createdAt: new Date().toISOString() },
        ];
        setTags(defaults);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
      }
    } catch (e) {
      console.error('Failed to load tags');
    } finally {
      setLoading(false);
    }
  };

  const saveTags = (list: TagDefinition[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setTags(list);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) return;

    if (editingId) {
      saveTags(tags.map(t => 
        t.id === editingId ? { ...t, name: formData.name, color: formData.color } : t
      ));
    } else {
      const newTag: TagDefinition = {
        id: Date.now().toString(),
        name: formData.name.trim(),
        color: formData.color,
        usageCount: 0,
        createdAt: new Date().toISOString(),
      };
      saveTags([...tags, newTag]);
    }

    resetForm();
  };

  const handleEdit = (tag: TagDefinition) => {
    setEditingId(tag.id);
    setFormData({ name: tag.name, color: tag.color });
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Bu etiketi silmek istediğinize emin misiniz?')) return;
    saveTags(tags.filter(t => t.id !== id));
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '', color: 'blue' });
  };

  const getColorClasses = (colorId: string) => {
    return COLORS.find(c => c.id === colorId) || COLORS[4];
  };

  const totalUsage = tags.reduce((sum, t) => sum + t.usageCount, 0);

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
          <Tag className="h-4 w-4" />
          Etiket Yönetimi
          <span className="text-xs text-gray-400">({tags.length} etiket)</span>
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStats(!showStats)}
            className={`p-1.5 rounded-lg ${showStats ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
          >
            <BarChart3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Yeni Etiket
          </button>
        </div>
      </div>

      {/* Stats */}
      {showStats && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium mb-3">Kullanım İstatistikleri</h4>
          <div className="space-y-2">
            {tags.sort((a, b) => b.usageCount - a.usageCount).map((tag) => {
              const colorClasses = getColorClasses(tag.color);
              const percent = totalUsage > 0 ? Math.round((tag.usageCount / totalUsage) * 100) : 0;
              return (
                <div key={tag.id} className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${colorClasses.bg} ${colorClasses.text}`}>
                    {tag.name}
                  </span>
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${colorClasses.dot}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-16 text-right">
                    {tag.usageCount} (%{percent})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="border rounded-lg p-4 bg-gray-50">
          <h4 className="font-medium mb-3">{editingId ? 'Etiketi Düzenle' : 'Yeni Etiket'}</h4>
          <div className="flex gap-3">
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Etiket adı"
              className="flex-1 border rounded-lg px-3 py-2"
            />
            <div className="flex items-center gap-1 p-1 border rounded-lg bg-white">
              {COLORS.map((color) => (
                <button
                  key={color.id}
                  onClick={() => setFormData(prev => ({ ...prev, color: color.id }))}
                  className={`w-6 h-6 rounded ${color.dot} ${
                    formData.color === color.id ? 'ring-2 ring-offset-1 ring-blue-500' : ''
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={resetForm} className="px-3 py-1.5 border rounded-lg hover:bg-gray-100">
              İptal
            </button>
            <button
              onClick={handleSubmit}
              disabled={!formData.name.trim()}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              <Check className="h-4 w-4" />
              {editingId ? 'Güncelle' : 'Ekle'}
            </button>
          </div>
        </div>
      )}

      {/* Tags List */}
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const colorClasses = getColorClasses(tag.color);
          return (
            <div
              key={tag.id}
              className={`group flex items-center gap-1 px-3 py-1.5 rounded-lg ${colorClasses.bg} ${colorClasses.text}`}
            >
              <span
                className="cursor-pointer"
                onClick={() => onTagSelect?.(tag)}
              >
                {tag.name}
              </span>
              <span className="text-xs opacity-60">({tag.usageCount})</span>
              <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                <button
                  onClick={() => handleEdit(tag)}
                  className="p-0.5 hover:bg-white/30 rounded"
                >
                  <Edit className="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleDelete(tag.id)}
                  className="p-0.5 hover:bg-white/30 rounded"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Helper to increment tag usage
export function incrementTagUsage(tagId: string) {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return;
  
  const tags: TagDefinition[] = JSON.parse(stored);
  const updated = tags.map(t => 
    t.id === tagId ? { ...t, usageCount: t.usageCount + 1 } : t
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

// Helper to get all tags
export function getAllTags(): TagDefinition[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
}
