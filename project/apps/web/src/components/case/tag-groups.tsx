'use client';

import { useState, useEffect } from 'react';
import { Tag, Plus, Trash2, Edit, ChevronDown, ChevronRight, Palette, FolderOpen } from 'lucide-react';

interface TagItem {
  id: string;
  name: string;
  color: string;
}

interface TagGroup {
  id: string;
  name: string;
  color: string;
  tags: TagItem[];
  isExpanded: boolean;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#6B7280'];
const STORAGE_KEY = 'tagGroups';

export function TagGroups() {
  const [groups, setGroups] = useState<TagGroup[]>([]);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showTagForm, setShowTagForm] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState({ name: '', color: COLORS[0] });
  const [tagForm, setTagForm] = useState({ name: '', color: COLORS[0] });

  useEffect(() => { loadGroups(); }, []);

  const loadGroups = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setGroups(JSON.parse(stored));
      else {
        const demo: TagGroup[] = [
          { id: '1', name: 'Öncelik', color: '#EF4444', isExpanded: true, tags: [
            { id: '1-1', name: 'Acil', color: '#EF4444' },
            { id: '1-2', name: 'Yüksek', color: '#F59E0B' },
            { id: '1-3', name: 'Normal', color: '#3B82F6' },
          ]},
          { id: '2', name: 'Durum', color: '#10B981', isExpanded: true, tags: [
            { id: '2-1', name: 'Beklemede', color: '#F59E0B' },
            { id: '2-2', name: 'İşlemde', color: '#3B82F6' },
            { id: '2-3', name: 'Tamamlandı', color: '#10B981' },
          ]},
          { id: '3', name: 'Tür', color: '#8B5CF6', isExpanded: false, tags: [
            { id: '3-1', name: 'İcra', color: '#8B5CF6' },
            { id: '3-2', name: 'Dava', color: '#EC4899' },
          ]},
        ];
        setGroups(demo);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
      }
    } catch (e) { console.error('Failed to load tag groups'); }
  };

  const saveGroups = (list: TagGroup[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setGroups(list);
  };

  const addGroup = () => {
    if (!groupForm.name) return;
    saveGroups([...groups, { id: Date.now().toString(), name: groupForm.name, color: groupForm.color, tags: [], isExpanded: true }]);
    setGroupForm({ name: '', color: COLORS[0] });
    setShowGroupForm(false);
  };

  const deleteGroup = (id: string) => saveGroups(groups.filter(g => g.id !== id));
  const toggleExpand = (id: string) => saveGroups(groups.map(g => g.id === id ? { ...g, isExpanded: !g.isExpanded } : g));

  const addTag = (groupId: string) => {
    if (!tagForm.name) return;
    saveGroups(groups.map(g => g.id === groupId ? { ...g, tags: [...g.tags, { id: Date.now().toString(), name: tagForm.name, color: tagForm.color }] } : g));
    setTagForm({ name: '', color: COLORS[0] });
    setShowTagForm(null);
  };

  const deleteTag = (groupId: string, tagId: string) => {
    saveGroups(groups.map(g => g.id === groupId ? { ...g, tags: g.tags.filter(t => t.id !== tagId) } : g));
  };

  const totalTags = groups.reduce((sum, g) => sum + g.tags.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><FolderOpen className="h-5 w-5" />Etiket Grupları ({totalTags} etiket)</h3>
        <button onClick={() => setShowGroupForm(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus className="h-4 w-4" />Yeni Grup
        </button>
      </div>

      {/* Group Form */}
      {showGroupForm && (
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <input type="text" value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} placeholder="Grup adı" className="w-full border rounded-lg px-3 py-2" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Renk:</span>
            {COLORS.map((c) => (
              <button key={c} onClick={() => setGroupForm({ ...groupForm, color: c })} className={`w-6 h-6 rounded-full ${groupForm.color === c ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`} style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowGroupForm(false)} className="px-3 py-1.5 border rounded-lg hover:bg-gray-50 text-sm">İptal</button>
            <button onClick={addGroup} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Ekle</button>
          </div>
        </div>
      )}

      {/* Groups */}
      {groups.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Tag className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Henüz etiket grubu yok</p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            <div key={group.id} className="bg-white border rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(group.id)}>
                {group.isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: group.color }} />
                <span className="font-medium flex-1">{group.name}</span>
                <span className="text-xs text-gray-400">{group.tags.length} etiket</span>
                <button onClick={(e) => { e.stopPropagation(); deleteGroup(group.id); }} className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {group.isExpanded && (
                <div className="border-t px-3 py-2 bg-gray-50">
                  <div className="flex flex-wrap gap-2 mb-2">
                    {group.tags.map((tag) => (
                      <div key={tag.id} className="flex items-center gap-1 px-2 py-1 rounded-full text-white text-sm" style={{ backgroundColor: tag.color }}>
                        <span>{tag.name}</span>
                        <button onClick={() => deleteTag(group.id, tag.id)} className="hover:bg-white/20 rounded-full p-0.5"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    ))}
                    {showTagForm === group.id ? (
                      <div className="flex items-center gap-2">
                        <input type="text" value={tagForm.name} onChange={(e) => setTagForm({ ...tagForm, name: e.target.value })} placeholder="Etiket adı" className="border rounded px-2 py-1 text-sm w-24" autoFocus />
                        <div className="flex gap-1">
                          {COLORS.slice(0, 4).map((c) => (
                            <button key={c} onClick={() => setTagForm({ ...tagForm, color: c })} className={`w-4 h-4 rounded-full ${tagForm.color === c ? 'ring-1 ring-offset-1 ring-blue-500' : ''}`} style={{ backgroundColor: c }} />
                          ))}
                        </div>
                        <button onClick={() => addTag(group.id)} className="text-green-600 text-sm">✓</button>
                        <button onClick={() => setShowTagForm(null)} className="text-gray-400 text-sm">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setShowTagForm(group.id)} className="flex items-center gap-1 px-2 py-1 border border-dashed rounded-full text-gray-400 text-sm hover:border-gray-500 hover:text-gray-500">
                        <Plus className="h-3 w-3" />Etiket
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
