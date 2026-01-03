'use client';

import { useState, useEffect } from 'react';
import { Button, Spinner } from '@hukuk/ui';
import { Building2, X } from 'lucide-react';
import { api, InstitutionType, InstitutionTemplateInfo } from '@/lib/api';

interface InstitutionLetterModalProps {
  open: boolean;
  onClose: () => void;
  caseDebtorId: string;
  onSuccess?: () => void;
}

const INSTITUTION_ICONS: Record<InstitutionType, string> = {
  SGK: '🏥',
  VERGI_DAIRESI: '💰',
  TICARET_SICILI: '📋',
  BELEDIYE: '🏛️',
  TAPU: '🏠',
  NUFUS: '👤',
};

const INSTITUTION_NAMES: Record<InstitutionType, string> = {
  SGK: 'SGK',
  VERGI_DAIRESI: 'Vergi Dairesi',
  TICARET_SICILI: 'Ticaret Sicili',
  BELEDIYE: 'Belediye',
  TAPU: 'Tapu',
  NUFUS: 'Nüfus',
};

export function InstitutionLetterModal({
  open,
  onClose,
  caseDebtorId,
  onSuccess,
}: InstitutionLetterModalProps) {
  const [templates, setTemplates] = useState<InstitutionTemplateInfo[]>([]);
  const [selectedInstitution, setSelectedInstitution] = useState<InstitutionType | null>(null);
  const [selectedLetterType, setSelectedLetterType] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      loadTemplates();
    }
  }, [open]);

  useEffect(() => {
    if (selectedInstitution) {
      const template = templates.find(t => t.institution === selectedInstitution);
      if (template) {
        setSubject(template.defaultSubject);
        setSelectedLetterType(template.letterTypes[0] || '');
      }
    }
  }, [selectedInstitution, templates]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await api.getInstitutionTemplates();
      setTemplates(data);
    } catch (error) {
      console.error('Şablonlar yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedInstitution || !selectedLetterType) return;

    try {
      setSubmitting(true);
      await api.createInstitutionLetter({
        caseDebtorId,
        institution: selectedInstitution,
        letterType: selectedLetterType,
        subject: subject || undefined,
        body: body || undefined,
      });
      onSuccess?.();
      onClose();
    } catch (error: any) {
      alert(error.message || 'Yazı oluşturulamadı');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTemplate = templates.find(t => t.institution === selectedInstitution);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Yeni Kurum Yazısı
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 overflow-y-auto max-h-[60vh]">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="md" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Institution Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Kurum</label>
                  <div className="grid grid-cols-3 gap-2">
                    {templates.map((template) => {
                      const isSelected = selectedInstitution === template.institution;
                      return (
                        <button
                          key={template.institution}
                          type="button"
                          className={`p-3 rounded-lg border text-center transition-colors ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-blue-300'
                          }`}
                          onClick={() => setSelectedInstitution(template.institution)}
                        >
                          <span className="text-2xl block mb-1">
                            {INSTITUTION_ICONS[template.institution]}
                          </span>
                          <span className="text-xs font-medium">{template.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Letter Type */}
                {selectedTemplate && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Yazı Türü</label>
                    <select
                      value={selectedLetterType}
                      onChange={(e) => setSelectedLetterType(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Yazı türü seçin</option>
                      {selectedTemplate.letterTypes.map((type) => (
                        <option key={type} value={type}>
                          {type.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Subject */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Konu</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Yazı konusu..."
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Body (Optional) */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">İçerik (Opsiyonel)</label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Özel içerik eklemek isterseniz buraya yazın..."
                    rows={4}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                  <p className="text-xs text-gray-500">
                    Boş bırakırsanız seçilen kurum ve yazı türüne göre otomatik içerik oluşturulur.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              İptal
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedInstitution || !selectedLetterType || submitting}
            >
              {submitting ? <Spinner size="sm" /> : 'Yazı Oluştur'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
