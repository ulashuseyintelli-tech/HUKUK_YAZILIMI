'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Merge, X, Loader2, Search, Check, AlertTriangle, ArrowRight } from 'lucide-react';

interface CaseMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceCaseId: string;
  sourceCaseNumber: string;
  onMerged?: () => void;
}

interface CaseOption {
  id: string;
  fileNumber: string;
  clientName?: string;
  debtorCount: number;
  principalAmount?: number;
}

export function CaseMergeModal({ isOpen, onClose, sourceCaseId, sourceCaseNumber, onMerged }: CaseMergeModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CaseOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [targetCase, setTargetCase] = useState<CaseOption | null>(null);
  const [mergeOptions, setMergeOptions] = useState({
    debtors: true,
    receivables: true,
    collections: true,
    documents: true,
    notes: true,
    deleteSource: false,
  });
  const [merging, setMerging] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.get(`/cases?search=${encodeURIComponent(searchQuery)}&limit=5`);
      const results = (res.data?.data || [])
        .filter((c: any) => c.id !== sourceCaseId)
        .map((c: any) => ({
          id: c.id,
          fileNumber: c.fileNumber,
          clientName: c.client?.displayName || c.client?.name,
          debtorCount: c.debtors?.length || 0,
          principalAmount: c.principalAmount,
        }));
      setSearchResults(results);
    } catch (e) {
      console.error(e);
    } finally {
      setSearching(false);
    }
  };

  const handleMerge = async () => {
    if (!targetCase) return;
    setMerging(true);
    try {
      await api.post(`/cases/${sourceCaseId}/merge`, {
        targetCaseId: targetCase.id,
        options: mergeOptions,
      });
      setSuccess(true);
      setTimeout(() => {
        onMerged?.();
        onClose();
        resetForm();
      }, 2000);
    } catch (e) {
      console.error(e);
      alert('Birleştirme sırasında bir hata oluştu');
    } finally {
      setMerging(false);
    }
  };

  const resetForm = () => {
    setSearchQuery('');
    setSearchResults([]);
    setTargetCase(null);
    setMergeOptions({
      debtors: true,
      receivables: true,
      collections: true,
      documents: true,
      notes: true,
      deleteSource: false,
    });
    setSuccess(false);
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-auto">
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold flex items-center gap-2">
            <Merge className="h-5 w-5 text-purple-600" />
            Dosya Birleştir
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h4 className="text-lg font-semibold text-green-700">Birleştirildi!</h4>
            <p className="text-gray-500 mt-2">Dosyalar başarıyla birleştirildi.</p>
          </div>
        ) : (
          <>
            <div className="p-4 space-y-4">
              {/* Source Case */}
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-xs text-purple-600 mb-1">Kaynak Dosya</p>
                <p className="font-semibold text-purple-800">{sourceCaseNumber}</p>
              </div>

              {/* Target Case Selection */}
              {!targetCase ? (
                <div>
                  <label className="block text-sm font-medium mb-2">Hedef Dosya Seç</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Dosya no veya müvekkil ara..."
                        className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm"
                      />
                    </div>
                    <button
                      onClick={handleSearch}
                      disabled={searching}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                    >
                      {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ara'}
                    </button>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="mt-3 border rounded-lg divide-y max-h-48 overflow-auto">
                      {searchResults.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setTargetCase(c);
                            setSearchResults([]);
                          }}
                          className="w-full p-3 text-left hover:bg-gray-50 flex items-center justify-between"
                        >
                          <div>
                            <p className="font-medium">{c.fileNumber}</p>
                            <p className="text-sm text-gray-500">{c.clientName}</p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-gray-400" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">Hedef Dosya</label>
                    <button
                      onClick={() => setTargetCase(null)}
                      className="text-xs text-purple-600 hover:underline"
                    >
                      Değiştir
                    </button>
                  </div>
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="font-semibold text-green-800">{targetCase.fileNumber}</p>
                    <p className="text-sm text-green-600">{targetCase.clientName}</p>
                  </div>
                </div>
              )}

              {/* Merge Direction */}
              {targetCase && (
                <div className="flex items-center justify-center gap-3 py-2">
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Kaynak</p>
                    <p className="font-medium">{sourceCaseNumber}</p>
                  </div>
                  <ArrowRight className="h-6 w-6 text-purple-500" />
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Hedef</p>
                    <p className="font-medium">{targetCase.fileNumber}</p>
                  </div>
                </div>
              )}

              {/* Merge Options */}
              {targetCase && (
                <div>
                  <label className="block text-sm font-medium mb-2">Birleştirilecek Veriler</label>
                  <div className="space-y-2">
                    {[
                      { key: 'debtors', label: 'Borçlular' },
                      { key: 'receivables', label: 'Alacak Kalemleri' },
                      { key: 'collections', label: 'Tahsilatlar' },
                      { key: 'documents', label: 'Belgeler' },
                      { key: 'notes', label: 'Notlar' },
                    ].map((opt) => (
                      <label key={opt.key} className="flex items-center gap-2 p-2 border rounded-lg hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={mergeOptions[opt.key as keyof typeof mergeOptions] as boolean}
                          onChange={(e) => setMergeOptions({ ...mergeOptions, [opt.key]: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm">{opt.label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mergeOptions.deleteSource}
                        onChange={(e) => setMergeOptions({ ...mergeOptions, deleteSource: e.target.checked })}
                        className="rounded border-red-300"
                      />
                      <div>
                        <span className="text-sm font-medium text-red-700">Kaynak dosyayı sil</span>
                        <p className="text-xs text-red-600">Birleştirme sonrası kaynak dosya silinecek</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Warning */}
              {targetCase && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="text-sm text-amber-800">
                        Bu işlem geri alınamaz. Seçilen veriler kaynak dosyadan hedef dosyaya taşınacaktır.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 border rounded-lg hover:bg-gray-100"
              >
                İptal
              </button>
              <button
                onClick={handleMerge}
                disabled={!targetCase || merging}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
              >
                {merging ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Birleştiriliyor...
                  </>
                ) : (
                  <>
                    <Merge className="h-4 w-4" />
                    Birleştir
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
