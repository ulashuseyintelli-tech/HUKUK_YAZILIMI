'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { FileText, Download, Loader2, CheckCircle, AlertCircle, X, Files } from 'lucide-react';

interface BulkDocumentGeneratorProps {
  selectedCaseIds: string[];
  isOpen: boolean;
  onClose: () => void;
}

interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
}

const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  { id: 'odeme_emri', name: 'Ödeme Emri', description: 'İcra ödeme emri belgesi', category: 'İcra' },
  { id: 'haciz_talebi', name: 'Haciz Talebi', description: 'Haciz talep dilekçesi', category: 'İcra' },
  { id: 'satis_talebi', name: 'Satış Talebi', description: 'Satış talep dilekçesi', category: 'İcra' },
  { id: 'maaş_haczi', name: 'Maaş Haczi Müzekkeresi', description: 'Maaş haczi yazısı', category: 'Haciz' },
  { id: 'banka_haczi', name: 'Banka Haczi Müzekkeresi', description: 'Banka hesap haczi yazısı', category: 'Haciz' },
  { id: 'arac_haczi', name: 'Araç Haczi Müzekkeresi', description: 'Araç haczi yazısı', category: 'Haciz' },
  { id: 'tapu_haczi', name: 'Tapu Haczi Müzekkeresi', description: 'Taşınmaz haczi yazısı', category: 'Haciz' },
  { id: 'muvekkil_rapor', name: 'Müvekkil Raporu', description: 'Dosya durum raporu', category: 'Rapor' },
  { id: 'tahsilat_rapor', name: 'Tahsilat Raporu', description: 'Tahsilat özet raporu', category: 'Rapor' },
];

export function BulkDocumentGenerator({ selectedCaseIds, isOpen, onClose }: BulkDocumentGeneratorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ caseId: string; success: boolean; message: string }[]>([]);
  const [step, setStep] = useState<'select' | 'generating' | 'complete'>('select');

  const handleGenerate = async () => {
    if (!selectedTemplate || selectedCaseIds.length === 0) return;

    setStep('generating');
    setGenerating(true);
    setProgress(0);
    setResults([]);

    const newResults: typeof results = [];

    for (let i = 0; i < selectedCaseIds.length; i++) {
      const caseId = selectedCaseIds[i];
      
      try {
        await api.post(`/documents/generate`, {
          caseId,
          templateId: selectedTemplate,
        });
        
        newResults.push({
          caseId,
          success: true,
          message: 'Belge oluşturuldu',
        });
      } catch (e: any) {
        newResults.push({
          caseId,
          success: false,
          message: e.message || 'Hata oluştu',
        });
      }

      setProgress(((i + 1) / selectedCaseIds.length) * 100);
      setResults([...newResults]);
      
      // Simüle edilmiş gecikme
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setGenerating(false);
    setStep('complete');
  };

  const handleDownloadAll = async () => {
    try {
      const response = await api.get(`/documents/download-bulk?templateId=${selectedTemplate}&caseIds=${selectedCaseIds.join(',')}`, {
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `belgeler_${new Date().toISOString().split('T')[0]}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      console.error('İndirme hatası:', e);
    }
  };

  const handleClose = () => {
    setStep('select');
    setSelectedTemplate('');
    setProgress(0);
    setResults([]);
    onClose();
  };

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Files className="h-5 w-5 text-blue-600" />
            Toplu Belge Oluştur
            <span className="text-sm font-normal text-gray-500">
              ({selectedCaseIds.length} dosya seçili)
            </span>
          </h3>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {step === 'select' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Seçili {selectedCaseIds.length} dosya için oluşturulacak belge türünü seçin:
              </p>

              {/* Template Categories */}
              {['İcra', 'Haciz', 'Rapor'].map((category) => (
                <div key={category}>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">{category}</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {DOCUMENT_TEMPLATES.filter(t => t.category === category).map((template) => (
                      <button
                        key={template.id}
                        onClick={() => setSelectedTemplate(template.id)}
                        className={`p-3 border rounded-lg text-left transition-all ${
                          selectedTemplate === template.id
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                            : 'hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <FileText className={`h-4 w-4 mt-0.5 ${
                            selectedTemplate === template.id ? 'text-blue-600' : 'text-gray-400'
                          }`} />
                          <div>
                            <p className="font-medium text-sm">{template.name}</p>
                            <p className="text-xs text-gray-500">{template.description}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 'generating' && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <Loader2 className="h-12 w-12 mx-auto text-blue-600 animate-spin mb-4" />
                <p className="font-medium">Belgeler Oluşturuluyor...</p>
                <p className="text-sm text-gray-500">
                  {results.length} / {selectedCaseIds.length} dosya işlendi
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Results List */}
              <div className="max-h-48 overflow-y-auto space-y-1">
                {results.map((result, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 p-2 rounded text-sm ${
                      result.success ? 'bg-green-50' : 'bg-red-50'
                    }`}
                  >
                    {result.success ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span className="font-mono text-xs">{result.caseId.slice(0, 8)}...</span>
                    <span className={result.success ? 'text-green-700' : 'text-red-700'}>
                      {result.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <CheckCircle className="h-12 w-12 mx-auto text-green-600 mb-4" />
                <p className="font-medium text-lg">İşlem Tamamlandı</p>
                <p className="text-sm text-gray-500 mt-2">
                  {successCount} başarılı, {failCount} başarısız
                </p>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-600">{successCount}</p>
                  <p className="text-sm text-green-700">Başarılı</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-red-600">{failCount}</p>
                  <p className="text-sm text-red-700">Başarısız</p>
                </div>
              </div>

              {/* Failed Results */}
              {failCount > 0 && (
                <div className="border border-red-200 rounded-lg p-3 bg-red-50">
                  <p className="text-sm font-medium text-red-800 mb-2">Başarısız İşlemler:</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {results.filter(r => !r.success).map((result, idx) => (
                      <div key={idx} className="text-xs text-red-700">
                        • {result.caseId.slice(0, 8)}... - {result.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
          {step === 'select' && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 border rounded-lg hover:bg-gray-100"
              >
                İptal
              </button>
              <button
                onClick={handleGenerate}
                disabled={!selectedTemplate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                Belgeleri Oluştur
              </button>
            </>
          )}

          {step === 'complete' && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 border rounded-lg hover:bg-gray-100"
              >
                Kapat
              </button>
              {successCount > 0 && (
                <button
                  onClick={handleDownloadAll}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Tümünü İndir (ZIP)
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
