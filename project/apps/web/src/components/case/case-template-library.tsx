'use client';

import { useState, useEffect } from 'react';
import { FileText, Plus, Search, Star, Download, Eye, Trash2, FolderOpen, Tag } from 'lucide-react';

interface CaseTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  caseType: string;
  defaultValues: Record<string, unknown>;
  usageCount: number;
  isFavorite: boolean;
  createdAt: string;
}

const CATEGORIES = ['Tümü', 'İcra', 'Dava', 'Arabuluculuk', 'Özel'];
const STORAGE_KEY = 'caseTemplateLibrary';

export function CaseTemplateLibrary() {
  const [templates, setTemplates] = useState<CaseTemplate[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Tümü');
  const [showForm, setShowForm] = useState(false);
  const [preview, setPreview] = useState<CaseTemplate | null>(null);
  const [form, setForm] = useState({ name: '', description: '', category: 'İcra', caseType: 'ILAMSIZ' });

  useEffect(() => { loadTemplates(); }, []);

  const loadTemplates = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setTemplates(JSON.parse(stored));
      else {
        const demo: CaseTemplate[] = [
          { id: '1', name: 'Standart İlamsız Takip', description: 'Temel ilamsız icra takibi şablonu', category: 'İcra', caseType: 'ILAMSIZ', defaultValues: { interestRate: 24 }, usageCount: 45, isFavorite: true, createdAt: '2024-01-15' },
          { id: '2', name: 'Çek Takibi', description: 'Karşılıksız çek için kambiyo takibi', category: 'İcra', caseType: 'KAMBIYO', defaultValues: { interestRate: 30 }, usageCount: 32, isFavorite: true, createdAt: '2024-02-10' },
          { id: '3', name: 'Kira Alacağı', description: 'Kira alacağı için ilamsız takip', category: 'İcra', caseType: 'ILAMSIZ', defaultValues: { interestRate: 24 }, usageCount: 28, isFavorite: false, createdAt: '2024-03-05' },
          { id: '4', name: 'İlamlı Takip', description: 'Mahkeme kararına dayalı takip', category: 'İcra', caseType: 'ILAMLI', defaultValues: {}, usageCount: 15, isFavorite: false, createdAt: '2024-04-20' },
        ];
        setTemplates(demo);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
      }
    } catch (e) { console.error('Failed to load templates'); }
  };

  const saveTemplates = (list: CaseTemplate[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setTemplates(list);
  };

  const handleCreate = () => {
    if (!form.name) return;
    const newTemplate: CaseTemplate = {
      id: Date.now().toString(), name: form.name, description: form.description, category: form.category,
      caseType: form.caseType, defaultValues: {}, usageCount: 0, isFavorite: false, createdAt: new Date().toISOString()
    };
    saveTemplates([...templates, newTemplate]);
    setForm({ name: '', description: '', category: 'İcra', caseType: 'ILAMSIZ' });
    setShowForm(false);
  };

  const toggleFavorite = (id: string) => saveTemplates(templates.map(t => t.id === id ? { ...t, isFavorite: !t.isFavorite } : t));
  const deleteTemplate = (id: string) => saveTemplates(templates.filter(t => t.id !== id));
  const useTemplate = (t: CaseTemplate) => {
    saveTemplates(templates.map(tt => tt.id === t.id ? { ...tt, usageCount: tt.usageCount + 1 } : tt));
    alert(`"${t.name}" şablonu kullanıldı. Yeni takip sayfasına yönlendiriliyorsunuz...`);
  };

  const filtered = templates
    .filter(t => category === 'Tümü' || t.category === category)
    .filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0) || b.usageCount - a.usageCount);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><FolderOpen className="h-5 w-5" />Şablon Kütüphanesi</h3>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus className="h-4 w-4" />Yeni Şablon
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Şablon ara..." className="w-full pl-10 pr-4 py-2 border rounded-lg" />
        </div>
        <div className="flex gap-1">
          {CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => setCategory(cat)} className={`px-3 py-1.5 rounded-lg text-sm ${category === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{cat}</button>
          ))}
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Şablon adı" className="w-full border rounded-lg px-3 py-2" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Açıklama" className="w-full border rounded-lg px-3 py-2" rows={2} />
          <div className="grid grid-cols-2 gap-3">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="border rounded-lg px-3 py-2">
              {CATEGORIES.filter(c => c !== 'Tümü').map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={form.caseType} onChange={(e) => setForm({ ...form, caseType: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="ILAMSIZ">İlamsız</option>
              <option value="ILAMLI">İlamlı</option>
              <option value="KAMBIYO">Kambiyo</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">İptal</button>
            <button onClick={handleCreate} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Oluştur</button>
          </div>
        </div>
      )}

      {/* Templates Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Şablon bulunamadı</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <div key={t.id} className="bg-white border rounded-xl p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <span className="font-medium">{t.name}</span>
                </div>
                <button onClick={() => toggleFavorite(t.id)} className={`p-1 rounded ${t.isFavorite ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-500'}`}>
                  <Star className={`h-4 w-4 ${t.isFavorite ? 'fill-current' : ''}`} />
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-3">{t.description}</p>
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{t.category}</span>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{t.caseType}</span>
                <span className="text-xs text-gray-400 ml-auto">{t.usageCount} kullanım</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => useTemplate(t)} className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                  <Download className="h-4 w-4" />Kullan
                </button>
                <button onClick={() => setPreview(t)} className="p-1.5 border rounded-lg hover:bg-gray-50"><Eye className="h-4 w-4 text-gray-500" /></button>
                <button onClick={() => deleteTemplate(t.id)} className="p-1.5 border rounded-lg hover:bg-red-50"><Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-2">{preview.name}</h3>
            <p className="text-gray-600 mb-4">{preview.description}</p>
            <div className="space-y-2 text-sm">
              <p><strong>Kategori:</strong> {preview.category}</p>
              <p><strong>Takip Türü:</strong> {preview.caseType}</p>
              <p><strong>Kullanım:</strong> {preview.usageCount} kez</p>
              <p><strong>Oluşturulma:</strong> {new Date(preview.createdAt).toLocaleDateString('tr-TR')}</p>
            </div>
            <button onClick={() => setPreview(null)} className="mt-4 w-full px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">Kapat</button>
          </div>
        </div>
      )}
    </div>
  );
}
