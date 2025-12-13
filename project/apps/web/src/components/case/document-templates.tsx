'use client';

import { useState, useEffect } from 'react';
import { FileText, Plus, Search, Download, Eye, Edit, Trash2, Copy, Variable } from 'lucide-react';

interface DocumentTemplate {
  id: string;
  name: string;
  category: string;
  content: string;
  variables: string[];
  usageCount: number;
  createdAt: string;
}

const CATEGORIES = ['Tümü', 'İcra', 'Tebligat', 'Haciz', 'Dilekçe', 'Sözleşme'];
const STORAGE_KEY = 'documentTemplates';

const DEFAULT_VARIABLES = ['{{dosya_no}}', '{{borclu_adi}}', '{{alacakli_adi}}', '{{tutar}}', '{{tarih}}', '{{avukat_adi}}'];

export function DocumentTemplateManager() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Tümü');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<DocumentTemplate | null>(null);
  const [form, setForm] = useState({ name: '', category: 'İcra', content: '' });

  useEffect(() => { loadTemplates(); }, []);

  const loadTemplates = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setTemplates(JSON.parse(stored));
      else {
        const demo: DocumentTemplate[] = [
          { id: '1', name: 'Ödeme Emri', category: 'İcra', content: 'Sayın {{borclu_adi}},\n\n{{dosya_no}} sayılı dosyamızdan {{tutar}} TL borcunuz bulunmaktadır.\n\nÖdeme tarihi: {{tarih}}\n\nSaygılarımızla,\n{{avukat_adi}}', variables: ['dosya_no', 'borclu_adi', 'tutar', 'tarih', 'avukat_adi'], usageCount: 45, createdAt: '2024-01-15' },
          { id: '2', name: 'Haciz Talebi', category: 'Haciz', content: '{{alacakli_adi}} vekili olarak {{borclu_adi}} aleyhine açılan {{dosya_no}} sayılı dosyadan haciz talep ediyoruz.', variables: ['alacakli_adi', 'borclu_adi', 'dosya_no'], usageCount: 32, createdAt: '2024-02-10' },
          { id: '3', name: 'Tebligat Yazısı', category: 'Tebligat', content: 'Tebliğ edilmek üzere {{borclu_adi}} adresine gönderilmiştir.\n\nDosya No: {{dosya_no}}\nTarih: {{tarih}}', variables: ['borclu_adi', 'dosya_no', 'tarih'], usageCount: 28, createdAt: '2024-03-05' },
        ];
        setTemplates(demo);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
      }
    } catch (e) { console.error('Failed to load templates'); }
  };

  const saveTemplates = (list: DocumentTemplate[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setTemplates(list);
  };

  const extractVariables = (content: string): string[] => {
    const matches = content.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
  };

  const handleSave = () => {
    if (!form.name || !form.content) return;
    const variables = extractVariables(form.content);
    if (editingId) {
      saveTemplates(templates.map(t => t.id === editingId ? { ...t, name: form.name, category: form.category, content: form.content, variables } : t));
    } else {
      saveTemplates([...templates, { id: Date.now().toString(), name: form.name, category: form.category, content: form.content, variables, usageCount: 0, createdAt: new Date().toISOString() }]);
    }
    resetForm();
  };

  const handleEdit = (t: DocumentTemplate) => { setForm({ name: t.name, category: t.category, content: t.content }); setEditingId(t.id); setShowForm(true); };
  const handleDelete = (id: string) => saveTemplates(templates.filter(t => t.id !== id));
  const handleDuplicate = (t: DocumentTemplate) => saveTemplates([...templates, { ...t, id: Date.now().toString(), name: `${t.name} (Kopya)`, usageCount: 0, createdAt: new Date().toISOString() }]);
  const resetForm = () => { setForm({ name: '', category: 'İcra', content: '' }); setEditingId(null); setShowForm(false); };

  const insertVariable = (variable: string) => setForm({ ...form, content: form.content + `{{${variable}}}` });

  const filtered = templates.filter(t => category === 'Tümü' || t.category === category).filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><FileText className="h-5 w-5" />Belge Şablonları</h3>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><Plus className="h-4 w-4" />Yeni Şablon</button>
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

      {/* Form */}
      {showForm && (
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Şablon adı" className="border rounded-lg px-3 py-2" />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="border rounded-lg px-3 py-2">
              {CATEGORIES.filter(c => c !== 'Tümü').map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Variable className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">Değişkenler:</span>
              {DEFAULT_VARIABLES.map((v) => (
                <button key={v} onClick={() => insertVariable(v.replace(/\{\{|\}\}/g, ''))} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200">{v}</button>
              ))}
            </div>
            <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Şablon içeriği..." className="w-full border rounded-lg px-3 py-2 font-mono text-sm" rows={6} />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={resetForm} className="px-4 py-2 border rounded-lg hover:bg-gray-50">İptal</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editingId ? 'Güncelle' : 'Kaydet'}</button>
          </div>
        </div>
      )}

      {/* Templates Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((t) => (
          <div key={t.id} className="bg-white border rounded-xl p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-2">
              <div><p className="font-medium">{t.name}</p><span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{t.category}</span></div>
              <span className="text-xs text-gray-400">{t.usageCount} kullanım</span>
            </div>
            <p className="text-sm text-gray-500 line-clamp-2 mb-3">{t.content.substring(0, 100)}...</p>
            <div className="flex flex-wrap gap-1 mb-3">
              {t.variables.slice(0, 3).map((v) => <span key={v} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{`{{${v}}}`}</span>)}
              {t.variables.length > 3 && <span className="text-xs text-gray-400">+{t.variables.length - 3}</span>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPreview(t)} className="p-1.5 border rounded hover:bg-gray-50"><Eye className="h-4 w-4 text-gray-500" /></button>
              <button onClick={() => handleEdit(t)} className="p-1.5 border rounded hover:bg-gray-50"><Edit className="h-4 w-4 text-gray-500" /></button>
              <button onClick={() => handleDuplicate(t)} className="p-1.5 border rounded hover:bg-gray-50"><Copy className="h-4 w-4 text-gray-500" /></button>
              <button onClick={() => handleDelete(t.id)} className="p-1.5 border rounded hover:bg-red-50"><Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" /></button>
            </div>
          </div>
        ))}
      </div>

      {/* Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-2">{preview.name}</h3>
            <pre className="bg-gray-50 rounded-lg p-4 text-sm whitespace-pre-wrap font-mono">{preview.content}</pre>
            <button onClick={() => setPreview(null)} className="mt-4 w-full px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">Kapat</button>
          </div>
        </div>
      )}
    </div>
  );
}
