'use client';

import { useState, useEffect } from 'react';
import { Printer, FileText, Settings, Eye, Save, Trash2, Plus, Loader2 } from 'lucide-react';

interface PrintTemplate {
  id: string;
  name: string;
  type: 'case_summary' | 'debt_notice' | 'collection_report' | 'custom';
  showLogo: boolean;
  showHeader: boolean;
  headerText: string;
  footerText: string;
  pageSize: 'A4' | 'A5' | 'Letter';
  orientation: 'portrait' | 'landscape';
  margins: { top: number; right: number; bottom: number; left: number };
  fontSize: number;
  isDefault: boolean;
}

interface PrintTemplatesProps {
  onPrint?: (template: PrintTemplate, data: any) => void;
}

const STORAGE_KEY = 'printTemplates';

const DEFAULT_TEMPLATES: PrintTemplate[] = [
  {
    id: 'default-summary',
    name: 'Dosya Özeti',
    type: 'case_summary',
    showLogo: true,
    showHeader: true,
    headerText: 'DOSYA ÖZET RAPORU',
    footerText: 'Bu belge bilgi amaçlıdır.',
    pageSize: 'A4',
    orientation: 'portrait',
    margins: { top: 20, right: 15, bottom: 20, left: 15 },
    fontSize: 12,
    isDefault: true,
  },
  {
    id: 'default-notice',
    name: 'Borç Bildirimi',
    type: 'debt_notice',
    showLogo: true,
    showHeader: true,
    headerText: 'BORÇ BİLDİRİMİ',
    footerText: '',
    pageSize: 'A4',
    orientation: 'portrait',
    margins: { top: 25, right: 20, bottom: 25, left: 20 },
    fontSize: 11,
    isDefault: true,
  },
];

export function PrintTemplates({ onPrint }: PrintTemplatesProps) {
  const [templates, setTemplates] = useState<PrintTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PrintTemplate | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = () => {
    setLoading(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setTemplates(JSON.parse(stored));
      } else {
        setTemplates(DEFAULT_TEMPLATES);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_TEMPLATES));
      }
    } catch (e) {
      setTemplates(DEFAULT_TEMPLATES);
    } finally {
      setLoading(false);
    }
  };

  const saveTemplates = (list: PrintTemplate[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setTemplates(list);
  };

  const handleSaveTemplate = () => {
    if (!editingTemplate) return;

    if (editingTemplate.id.startsWith('new-')) {
      const newTemplate = { ...editingTemplate, id: Date.now().toString() };
      saveTemplates([...templates, newTemplate]);
    } else {
      saveTemplates(templates.map(t => t.id === editingTemplate.id ? editingTemplate : t));
    }
    setShowEditor(false);
    setEditingTemplate(null);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Bu şablonu silmek istediğinize emin misiniz?')) return;
    saveTemplates(templates.filter(t => t.id !== id));
  };

  const handleNewTemplate = () => {
    setEditingTemplate({
      id: `new-${Date.now()}`,
      name: 'Yeni Şablon',
      type: 'custom',
      showLogo: true,
      showHeader: true,
      headerText: '',
      footerText: '',
      pageSize: 'A4',
      orientation: 'portrait',
      margins: { top: 20, right: 15, bottom: 20, left: 15 },
      fontSize: 12,
      isDefault: false,
    });
    setShowEditor(true);
  };

  const handlePreview = (template: PrintTemplate) => {
    // Open print preview
    const previewWindow = window.open('', '_blank');
    if (previewWindow) {
      previewWindow.document.write(`
        <html>
          <head>
            <title>${template.name} - Önizleme</title>
            <style>
              @page { size: ${template.pageSize} ${template.orientation}; margin: ${template.margins.top}mm ${template.margins.right}mm ${template.margins.bottom}mm ${template.margins.left}mm; }
              body { font-family: Arial, sans-serif; font-size: ${template.fontSize}pt; }
              .header { text-align: center; font-weight: bold; font-size: 16pt; margin-bottom: 20px; }
              .footer { text-align: center; font-size: 10pt; color: #666; margin-top: 30px; }
            </style>
          </head>
          <body>
            ${template.showHeader ? `<div class="header">${template.headerText}</div>` : ''}
            <div class="content">
              <p>Bu bir önizleme sayfasıdır.</p>
              <p>Gerçek yazdırma işleminde dosya verileri burada görünecektir.</p>
            </div>
            ${template.footerText ? `<div class="footer">${template.footerText}</div>` : ''}
          </body>
        </html>
      `);
      previewWindow.document.close();
      previewWindow.print();
    }
  };

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
          <Printer className="h-4 w-4" />
          Yazdırma Şablonları
        </h3>
        <button
          onClick={handleNewTemplate}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Yeni Şablon
        </button>
      </div>

      {/* Templates List */}
      <div className="grid grid-cols-2 gap-4">
        {templates.map((template) => (
          <div
            key={template.id}
            className={`p-4 border rounded-lg hover:shadow-md transition-shadow cursor-pointer ${
              selectedId === template.id ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={() => setSelectedId(template.id)}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="font-medium">{template.name}</p>
                  <p className="text-xs text-gray-500">
                    {template.pageSize} • {template.orientation === 'portrait' ? 'Dikey' : 'Yatay'}
                  </p>
                </div>
              </div>
              {template.isDefault && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">Varsayılan</span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={(e) => { e.stopPropagation(); handlePreview(template); }}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 border rounded text-sm hover:bg-gray-50"
              >
                <Eye className="h-3.5 w-3.5" />
                Önizle
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setEditingTemplate(template); setShowEditor(true); }}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 border rounded text-sm hover:bg-gray-50"
              >
                <Settings className="h-3.5 w-3.5" />
                Düzenle
              </button>
              {!template.isDefault && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(template.id); }}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Editor Modal */}
      {showEditor && editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold mb-4">Şablon Düzenle</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Şablon Adı</label>
                <input
                  type="text"
                  value={editingTemplate.name}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Sayfa Boyutu</label>
                  <select
                    value={editingTemplate.pageSize}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, pageSize: e.target.value as any })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="A4">A4</option>
                    <option value="A5">A5</option>
                    <option value="Letter">Letter</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Yön</label>
                  <select
                    value={editingTemplate.orientation}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, orientation: e.target.value as any })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="portrait">Dikey</option>
                    <option value="landscape">Yatay</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Başlık Metni</label>
                <input
                  type="text"
                  value={editingTemplate.headerText}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, headerText: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Alt Bilgi</label>
                <input
                  type="text"
                  value={editingTemplate.footerText}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, footerText: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Yazı Boyutu (pt)</label>
                <input
                  type="number"
                  value={editingTemplate.fontSize}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, fontSize: parseInt(e.target.value) || 12 })}
                  className="w-full border rounded-lg px-3 py-2"
                  min={8}
                  max={18}
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editingTemplate.showLogo}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, showLogo: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Logo Göster</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editingTemplate.showHeader}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, showHeader: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Başlık Göster</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => { setShowEditor(false); setEditingTemplate(null); }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleSaveTemplate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
