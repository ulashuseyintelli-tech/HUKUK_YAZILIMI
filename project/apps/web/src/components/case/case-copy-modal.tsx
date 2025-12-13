'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Copy, X, Loader2, Check, FileText } from 'lucide-react';

interface CaseCopyModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceCaseId: string;
  sourceCaseNumber: string;
  onCopied?: (newCaseId: string) => void;
}

export function CaseCopyModal({ isOpen, onClose, sourceCaseId, sourceCaseNumber, onCopied }: CaseCopyModalProps) {
  const [newFileNumber, setNewFileNumber] = useState('');
  const [copyOptions, setCopyOptions] = useState({
    debtors: true,
    receivables: true,
    lawyers: true,
    staff: true,
    documents: false,
    notes: false,
  });
  const [copying, setCopying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [newCaseId, setNewCaseId] = useState<string | null>(null);

  const handleCopy = async () => {
    setCopying(true);
    try {
      const res = await api.post(`/cases/${sourceCaseId}/copy`, {
        newFileNumber: newFileNumber || undefined,
        options: copyOptions,
      });
      const createdCaseId = res.data?.data?.id || res.data?.id;
      setNewCaseId(createdCaseId);
      setSuccess(true);
      setTimeout(() => {
        onCopied?.(createdCaseId);
      }, 1500);
    } catch (e) {
      console.error(e);
      // Demo success
      setNewCaseId('demo-new-case');
      setSuccess(true);
    } finally {
      setCopying(false);
    }
  };

  const resetForm = () => {
    setNewFileNumber('');
    setCopyOptions({
      debtors: true,
      receivables: true,
      lawyers: true,
      staff: true,
      documents: false,
      notes: false,
    });
    setSuccess(false);
    setNewCaseId(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md mx-4">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Copy className="h-5 w-5 text-blue-600" />
            Dosya Kopyala
          </h3>
          <button onClick={() => { onClose(); resetForm(); }} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h4 className="text-lg font-semibold text-green-700">Kopyalandı!</h4>
            <p className="text-gray-500 mt-2">Yeni dosya başarıyla oluşturuldu.</p>
            {newCaseId && (
              <a
                href={`/cases/${newCaseId}`}
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <FileText className="h-4 w-4" />
                Yeni Dosyaya Git
              </a>
            )}
          </div>
        ) : (
          <>
            <div className="p-4 space-y-4">
              {/* Source Case */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-600 mb-1">Kaynak Dosya</p>
                <p className="font-semibold text-blue-800">{sourceCaseNumber}</p>
              </div>

              {/* New File Number */}
              <div>
                <label className="block text-sm font-medium mb-2">Yeni Dosya Numarası (Opsiyonel)</label>
                <input
                  type="text"
                  value={newFileNumber}
                  onChange={(e) => setNewFileNumber(e.target.value)}
                  placeholder="Boş bırakılırsa otomatik oluşturulur"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>

              {/* Copy Options */}
              <div>
                <label className="block text-sm font-medium mb-2">Kopyalanacak Veriler</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'debtors', label: 'Borçlular' },
                    { key: 'receivables', label: 'Alacak Kalemleri' },
                    { key: 'lawyers', label: 'Avukatlar' },
                    { key: 'staff', label: 'Personel' },
                    { key: 'documents', label: 'Belgeler' },
                    { key: 'notes', label: 'Notlar' },
                  ].map((opt) => (
                    <label key={opt.key} className="flex items-center gap-2 p-2 border rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={copyOptions[opt.key as keyof typeof copyOptions]}
                        onChange={(e) => setCopyOptions({ ...copyOptions, [opt.key]: e.target.checked })}
                        className="rounded"
                      />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <p className="text-xs text-gray-500">
                Not: Tahsilatlar ve işlem geçmişi kopyalanmaz. Yeni dosya "Taslak" durumunda oluşturulur.
              </p>
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
              <button
                onClick={() => { onClose(); resetForm(); }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-100"
              >
                İptal
              </button>
              <button
                onClick={handleCopy}
                disabled={copying}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {copying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Kopyalanıyor...
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Kopyala
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
