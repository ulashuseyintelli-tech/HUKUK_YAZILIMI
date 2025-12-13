'use client';

import { useState, useEffect } from 'react';
import { FileText, Plus, Trash2, Save, FolderOpen } from 'lucide-react';

interface CaseTemplate {
  id: string;
  name: string;
  description?: string;
  type: string;
  subCategory?: string;
  interestRate?: number;
  defaultDues?: { type: string; description: string }[];
  createdAt: string;
}

interface CaseTemplatesProps {
  onSelectTemplate: (template: CaseTemplate) => void;
  currentType?: string;
}

export function CaseTemplates({ onSelectTemplate, currentType }: CaseTemplatesProps) {
  const [templates, setTemplates] = useState<CaseTemplate[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', description: '' });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = () => {
    const saved = localStorage.getItem('caseTemplates');
    if (saved) {
      setTemplates(JSON.parse(saved));
    } else {
      // Varsayılan şablonlar
      const defaults: CaseTemplate[] = [
        {
          id: '1',
          name: 'Standart İlamlı Takip',
          description: 'Mahkeme kararına dayalı takip',
          type: 'ILAM',
          interestRate: 24,
          defaultDues: [{ type: 'PRINCIPAL', description: 'Asıl Alacak' }],
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          name: 'Çek Takibi',
          description: 'Karşılıksız çek takibi',
          type: 'CHECK',
          interestRate: 30,
          defaultDues: [
            { type: 'PRINCIPAL', description: 'Çek Bedeli' },
            { type: 'INTEREST', description: 'Temerrüt Faizi' },
          ],
          createdAt: new Date().toISOString(),
        },
        {
          id: '3',
          name: 'Kira Alacağı',
          description: 'Kira borcu takibi',
          type: 'RENTAL',
          interestRate: 18,
          defaultDues: [
            { type: 'PRINCIPAL', description: 'Kira Borcu' },
            { type: 'EXPENSE', description: 'Aidat Borcu' },
          ],
          createdAt: new Date().toISOString(),
        },
      ];
      setTemplates(defaults);
      localStorage.setItem('caseTemplates', JSON.stringify(defaults));
    }
  };

  const saveTemplate = (templateData: Partial<CaseTemplate>) => {
    const template: CaseTemplate = {
      id: Date.now().toString(),
      name: newTemplate.name,
      description: newTemplate.description,
      type: currentType || 'GENERAL_EXECUTION',
      createdAt: new Date().toISOString(),
      ...templateData,
    };

    const updated = [...templates, template];
    setTemplates(updated);
    localStorage.setItem('caseTemplates', JSON.stringify(updated));
    setNewTemplate({ name: '', description: '' });
    setShowSaveModal(false);
  };

  const deleteTemplate = (id: string) => {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    localStorage.setItem('caseTemplates', JSON.stringify(updated));
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      ILAM: 'İlamlı',
      CHECK: 'Çek',
      BOND: 'Senet',
      RENTAL: 'Kira',
      GENERAL_EXECUTION: 'Genel Haciz',
    };
    return labels[type] || type;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
      >
        <FolderOpen className="h-4 w-4 text-blue-600" />
        Şablonlar
        {templates.length > 0 && (
          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
            {templates.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white border rounded-lg shadow-lg z-50">
          <div className="p-3 border-b flex items-center justify-between">
            <h4 className="font-medium text-sm">Dosya Şablonları</h4>
            <button
              onClick={() => { setShowSaveModal(true); setIsOpen(false); }}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Yeni Şablon
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {templates.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>Henüz şablon yok</p>
              </div>
            ) : (
              templates.map((template) => (
                <div
                  key={template.id}
                  className="p-3 border-b last:border-0 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between">
                    <button
                      onClick={() => { onSelectTemplate(template); setIsOpen(false); }}
                      className="flex-1 text-left"
                    >
                      <p className="font-medium text-sm">{template.name}</p>
                      {template.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                          {getTypeLabel(template.type)}
                        </span>
                        {template.interestRate && (
                          <span className="text-xs text-gray-500">%{template.interestRate}</span>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={() => deleteTemplate(template.id)}
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

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

      {/* Save Template Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-sm mx-4 p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Save className="h-5 w-5 text-blue-600" />
              Şablon Kaydet
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Şablon Adı</label>
                <input
                  type="text"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                  placeholder="Ör: Standart Çek Takibi"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Açıklama (Opsiyonel)</label>
                <input
                  type="text"
                  value={newTemplate.description}
                  onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                  placeholder="Kısa açıklama"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowSaveModal(false); setNewTemplate({ name: '', description: '' }); }}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={() => saveTemplate({})}
                disabled={!newTemplate.name.trim()}
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
