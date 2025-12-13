'use client';

import { useState, useEffect } from 'react';
import { Tag, X, Check, Filter } from 'lucide-react';

interface TagItem {
  id: string;
  name: string;
  color: string;
  count: number;
}

interface TagFilterProps {
  onFilter?: (tags: string[], logic: 'AND' | 'OR') => void;
}

const STORAGE_KEY = 'availableTags';

export function TagFilter({ onFilter }: TagFilterProps) {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [logic, setLogic] = useState<'AND' | 'OR'>('OR');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => { loadTags(); }, []);

  const loadTags = () => {
    // Demo tags
    setTags([
      { id: '1', name: 'Acil', color: '#EF4444', count: 12 },
      { id: '2', name: 'Yüksek Öncelik', color: '#F59E0B', count: 25 },
      { id: '3', name: 'Beklemede', color: '#3B82F6', count: 18 },
      { id: '4', name: 'Tamamlandı', color: '#10B981', count: 45 },
      { id: '5', name: 'İnceleme', color: '#8B5CF6', count: 8 },
      { id: '6', name: 'Haciz', color: '#EC4899', count: 15 },
    ]);
  };

  const toggleTag = (tagId: string) => {
    const newSelected = selected.includes(tagId) ? selected.filter(id => id !== tagId) : [...selected, tagId];
    setSelected(newSelected);
    onFilter?.(newSelected, logic);
  };

  const clearAll = () => { setSelected([]); onFilter?.([], logic); };

  const toggleLogic = () => {
    const newLogic = logic === 'AND' ? 'OR' : 'AND';
    setLogic(newLogic);
    onFilter?.(selected, newLogic);
  };

  return (
    <div className="relative">
      <button onClick={() => setIsOpen(!isOpen)} className={`flex items-center gap-2 px-3 py-2 border rounded-lg ${selected.length > 0 ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}>
        <Tag className="h-4 w-4" />
        <span>Etiketler</span>
        {selected.length > 0 && <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded-full text-xs">{selected.length}</span>}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border rounded-xl shadow-lg z-50">
          <div className="p-3 border-b">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-sm">Etiket Filtresi</span>
              {selected.length > 0 && <button onClick={clearAll} className="text-xs text-red-500 hover:underline">Temizle</button>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Mantık:</span>
              <button onClick={toggleLogic} className={`px-2 py-0.5 rounded text-xs ${logic === 'AND' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>VE</button>
              <button onClick={toggleLogic} className={`px-2 py-0.5 rounded text-xs ${logic === 'OR' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>VEYA</button>
            </div>
          </div>
          <div className="p-2 max-h-64 overflow-y-auto">
            {tags.map((tag) => (
              <button key={tag.id} onClick={() => toggleTag(tag.id)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 ${selected.includes(tag.id) ? 'bg-blue-50' : ''}`}>
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color }} />
                <span className="flex-1 text-left text-sm">{tag.name}</span>
                <span className="text-xs text-gray-400">{tag.count}</span>
                {selected.includes(tag.id) && <Check className="h-4 w-4 text-blue-600" />}
              </button>
            ))}
          </div>
          <div className="p-2 border-t">
            <button onClick={() => setIsOpen(false)} className="w-full px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Uygula</button>
          </div>
        </div>
      )}

      {/* Selected Tags Display */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selected.map((tagId) => {
            const tag = tags.find(t => t.id === tagId);
            if (!tag) return null;
            return (
              <span key={tagId} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-xs" style={{ backgroundColor: tag.color }}>
                {tag.name}
                <button onClick={() => toggleTag(tagId)} className="hover:bg-white/20 rounded-full"><X className="h-3 w-3" /></button>
              </span>
            );
          })}
          {selected.length > 1 && <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-600">{logic}</span>}
        </div>
      )}
    </div>
  );
}
