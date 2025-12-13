'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Tag, Plus, X, Check, Palette } from 'lucide-react';

interface CaseTag {
  id: string;
  name: string;
  color: string;
}

interface CaseTagsProps {
  caseId: string;
  onTagsChange?: (tags: CaseTag[]) => void;
}

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#64748b',
];

export function CaseTags({ caseId, onTagsChange }: CaseTagsProps) {
  const [tags, setTags] = useState<CaseTag[]>([]);
  const [allTags, setAllTags] = useState<CaseTag[]>([]);
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTags();
  }, [caseId]);

  const loadTags = async () => {
    try {
      const [caseTagsRes, allTagsRes] = await Promise.all([
        api.get(`/cases/${caseId}/tags`),
        api.get('/tags'),
      ]);
      setTags(caseTagsRes.data || []);
      setAllTags(allTagsRes.data || []);
    } catch (e) {
      // localStorage'dan yükle
      const savedTags = localStorage.getItem(`caseTags_${caseId}`);
      const savedAllTags = localStorage.getItem('allCaseTags');
      if (savedTags) setTags(JSON.parse(savedTags));
      if (savedAllTags) setAllTags(JSON.parse(savedAllTags));
    } finally {
      setLoading(false);
    }
  };

  const addTag = async (tag: CaseTag) => {
    const updated = [...tags, tag];
    setTags(updated);
    localStorage.setItem(`caseTags_${caseId}`, JSON.stringify(updated));
    onTagsChange?.(updated);

    try {
      await api.post(`/cases/${caseId}/tags/${tag.id}`);
    } catch (e) {
      // Sessizce geç
    }
  };

  const removeTag = async (tagId: string) => {
    const updated = tags.filter(t => t.id !== tagId);
    setTags(updated);
    localStorage.setItem(`caseTags_${caseId}`, JSON.stringify(updated));
    onTagsChange?.(updated);

    try {
      await api.delete(`/cases/${caseId}/tags/${tagId}`);
    } catch (e) {
      // Sessizce geç
    }
  };

  const createTag = async () => {
    if (!newTagName.trim()) return;

    const newTag: CaseTag = {
      id: Date.now().toString(),
      name: newTagName.trim(),
      color: newTagColor,
    };

    const updatedAllTags = [...allTags, newTag];
    setAllTags(updatedAllTags);
    localStorage.setItem('allCaseTags', JSON.stringify(updatedAllTags));

    // Yeni etiketi dosyaya da ekle
    addTag(newTag);

    setNewTagName('');
    setShowAddTag(false);

    try {
      await api.post('/tags', newTag);
    } catch (e) {
      // Sessizce geç
    }
  };

  const availableTags = allTags.filter(t => !tags.find(ct => ct.id === t.id));

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-gray-400 animate-pulse" />
        <span className="text-sm text-gray-400">Yükleniyor...</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Mevcut Etiketler */}
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
          >
            {tag.name}
            <button
              onClick={() => removeTag(tag.id)}
              className="hover:bg-black/10 rounded-full p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        
        {/* Etiket Ekle Butonu */}
        <button
          onClick={() => setShowAddTag(!showAddTag)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600"
        >
          <Plus className="h-3 w-3" />
          Etiket
        </button>
      </div>

      {/* Etiket Ekleme Dropdown */}
      {showAddTag && (
        <div className="p-3 bg-white border rounded-lg shadow-lg space-y-3">
          {/* Mevcut Etiketler */}
          {availableTags.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Mevcut Etiketler</p>
              <div className="flex flex-wrap gap-1.5">
                {availableTags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => { addTag(tag); setShowAddTag(false); }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium hover:opacity-80"
                    style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                  >
                    <Plus className="h-3 w-3" />
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Yeni Etiket Oluştur */}
          <div className="border-t pt-3">
            <p className="text-xs text-gray-500 mb-2">Yeni Etiket Oluştur</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Etiket adı"
                className="flex-1 border rounded px-2 py-1 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && createTag()}
              />
              <button
                onClick={createTag}
                disabled={!newTagName.trim()}
                className="px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
            
            {/* Renk Seçimi */}
            <div className="flex items-center gap-1 mt-2">
              <Palette className="h-3 w-3 text-gray-400" />
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewTagColor(color)}
                  className={`w-5 h-5 rounded-full border-2 ${newTagColor === color ? 'border-gray-800' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
