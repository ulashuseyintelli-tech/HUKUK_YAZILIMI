'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Archive, X, Loader2, AlertTriangle, Check, RotateCcw, Trash2, Search } from 'lucide-react';

interface CaseArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId?: string;
  caseNumber?: string;
  onArchived?: () => void;
}

export function CaseArchiveModal({ isOpen, onClose, caseId, caseNumber, onArchived }: CaseArchiveModalProps) {
  const [reason, setReason] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleArchive = async () => {
    if (!caseId) return;
    setArchiving(true);
    try {
      await api.post(`/cases/${caseId}/archive`, { reason });
      setSuccess(true);
      setTimeout(() => {
        onArchived?.();
        onClose();
        setSuccess(false);
        setReason('');
      }, 1500);
    } catch (e) {
      console.error(e);
      alert('Arşivleme sırasında bir hata oluştu');
    } finally {
      setArchiving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-md mx-4">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Archive className="h-5 w-5 text-amber-600" />
            Dosyayı Arşivle
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
            <h4 className="text-lg font-semibold text-green-700">Arşivlendi!</h4>
            <p className="text-gray-500 mt-2">Dosya başarıyla arşive taşındı.</p>
          </div>
        ) : (
          <>
            <div className="p-4 space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800">Dikkat</p>
                    <p className="text-sm text-amber-700">
                      <strong>{caseNumber}</strong> numaralı dosya arşive taşınacak. 
                      Arşivlenen dosyalar aktif listede görünmez ancak daha sonra geri yüklenebilir.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Arşivleme Nedeni (Opsiyonel)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Örn: Dosya kapatıldı, tahsilat tamamlandı..."
                  rows={3}
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 border rounded-lg hover:bg-gray-100"
              >
                İptal
              </button>
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
              >
                {archiving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Arşivleniyor...
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4" />
                    Arşivle
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

// Arşiv Listesi Bileşeni
interface ArchivedCase {
  id: string;
  fileNumber: string;
  clientName?: string;
  archivedAt: string;
  archivedBy?: string;
  archiveReason?: string;
}

interface CaseArchiveListProps {
  isOpen: boolean;
  onClose: () => void;
  onRestore?: (caseId: string) => void;
}

export function CaseArchiveList({ isOpen, onClose, onRestore }: CaseArchiveListProps) {
  const [cases, setCases] = useState<ArchivedCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [restoring, setRestoring] = useState<string | null>(null);

  useState(() => {
    if (isOpen) {
      loadArchivedCases();
    }
  });

  const loadArchivedCases = async () => {
    setLoading(true);
    try {
      const res = await api.get('/cases/archived');
      setCases(res.data?.data || []);
    } catch (e) {
      // Demo data
      setCases([
        {
          id: '1',
          fileNumber: '2024/1001',
          clientName: 'ABC Şirketi',
          archivedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          archivedBy: 'Admin',
          archiveReason: 'Tahsilat tamamlandı',
        },
        {
          id: '2',
          fileNumber: '2024/1002',
          clientName: 'XYZ Ltd.',
          archivedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
          archivedBy: 'Admin',
          archiveReason: 'Dosya kapatıldı',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (caseId: string) => {
    setRestoring(caseId);
    try {
      await api.post(`/cases/${caseId}/restore`);
      setCases(prev => prev.filter(c => c.id !== caseId));
      onRestore?.(caseId);
    } catch (e) {
      console.error(e);
      // Demo: remove from list
      setCases(prev => prev.filter(c => c.id !== caseId));
    } finally {
      setRestoring(null);
    }
  };

  const filteredCases = cases.filter(c =>
    c.fileNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.clientName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Archive className="h-5 w-5 text-amber-600" />
            Arşivlenmiş Dosyalar
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Dosya no veya müvekkil ara..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Archive className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Arşivlenmiş dosya bulunamadı</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCases.map((c) => (
                <div key={c.id} className="p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{c.fileNumber}</p>
                      <p className="text-sm text-gray-500">{c.clientName}</p>
                      {c.archiveReason && (
                        <p className="text-xs text-gray-400 mt-1">Neden: {c.archiveReason}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">{formatDate(c.archivedAt)}</p>
                      <button
                        onClick={() => handleRestore(c.id)}
                        disabled={restoring === c.id}
                        className="mt-2 px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 flex items-center gap-1"
                      >
                        {restoring === c.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3" />
                        )}
                        Geri Yükle
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50">
          <p className="text-xs text-gray-500 text-center">
            Toplam {filteredCases.length} arşivlenmiş dosya
          </p>
        </div>
      </div>
    </div>
  );
}
