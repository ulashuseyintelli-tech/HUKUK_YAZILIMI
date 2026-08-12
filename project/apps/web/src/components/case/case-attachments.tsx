'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { ActionError } from '@/components/ui/action-error';
import { toActionErrorMessage } from '@/lib/action-error';
import { runMutation, runRefreshOnly } from '@/lib/mutation-outcome';
import { useKeyedSubmitLock, useSubmitLock } from '@/lib/use-submit-lock';
import { Paperclip, Upload, Download, Trash2, Eye, File, FileText, Image, FileSpreadsheet, Loader2, X, FolderOpen } from 'lucide-react';

interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  category: string;
  uploadedAt: string;
  uploadedBy: string;
  url?: string;
}

interface CaseAttachmentsProps {
  caseId: string;
}

const FILE_CATEGORIES = [
  { id: 'vekalet', name: 'Vekaletname', color: 'purple' },
  { id: 'belge', name: 'Belge', color: 'blue' },
  { id: 'karar', name: 'Karar/Karar', color: 'green' },
  { id: 'tebligat', name: 'Tebligat', color: 'orange' },
  { id: 'rapor', name: 'Rapor', color: 'cyan' },
  { id: 'diger', name: 'Diğer', color: 'gray' },
];

const getFileIcon = (type: string) => {
  if (type.includes('image')) return <Image className="h-5 w-5" />;
  if (type.includes('pdf')) return <FileText className="h-5 w-5" />;
  if (type.includes('spreadsheet') || type.includes('excel')) return <FileSpreadsheet className="h-5 w-5" />;
  return <File className="h-5 w-5" />;
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function CaseAttachments({ caseId }: CaseAttachmentsProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // PR-2A1: mutation hatasi GORUNUR; yuklenmemis dosya listeye EKLENMEZ.
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [refreshingStale, setRefreshingStale] = useState(false);
  const submitLock = useSubmitLock();
  const rowLock = useKeyedSubmitLock();
  const handleStaleRefresh = async () => {
    setRefreshingStale(true);
    const ok = await runRefreshOnly(() => loadAttachments({ propagateError: true }));
    setRefreshingStale(false);
    if (ok) setStaleNotice(null);
  };
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadAttachments();
  }, [caseId]);

  // PR-2A1 DEPENDENCY_FIXED: hata YUTULMAZ, demo dosya URETILMEZ, malformed empty SAYILMAZ.
  const loadAttachments = async (opts?: { propagateError?: boolean }): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get(`/cases/${caseId}/attachments`);
      const rows = (res as { data?: { data?: unknown } })?.data?.data;
      if (!Array.isArray(rows)) throw new Error('MALFORMED_LIST_RESPONSE');
      setAttachments(rows as Attachment[]);
    } catch (e) {
      setLoadError(toActionErrorMessage(e, 'Ekler yuklenemedi.'));
      if (opts?.propagateError) throw e;
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // PR-2A1: upload yolunda idempotency anahtarı YOK → senkron kilit şart.
    // Sürükle-bırak ile dosya seçici aynı tick içinde iki POST üretebiliyordu.
    await submitLock.run(async () => {
      setUploading(true);
      setActionError(null);
      setStaleNotice(null);

      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });
      formData.append('category', selectedCategory || 'diger');

      const outcome = await runMutation({
        mutate: () =>
          api.post(`/cases/${caseId}/attachments`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          }),
        // Başarı YALNIZ sunucudan yeniden okunarak yansıtılır. Eski davranış yüklenmemiş
        // dosyaları listeye ekliyordu — kullanıcı vekaletnameyi yüklendi sanıyor, dosya
        // hiçbir yerde yok. Bir hukuk bürosunda bu, kayıp evrak demektir.
        refresh: () => loadAttachments({ propagateError: true }),
        failureMessage: 'Dosya yüklenemedi. Hiçbir dosya KAYDEDİLMEDİ, lütfen tekrar deneyin.',
        staleMessage: 'Dosya YÜKLENDİ, ancak liste yenilenemedi.',
      });

      if (!submitLock.isMounted()) return;
      setUploading(false);
      if (outcome.status === 'FAILED') {
        // Kategori seçimi ve dosya girdisi KORUNUR; kullanıcı yeniden gönderebilir.
        setActionError(outcome.error.message);
        return;
      }
      // SUCCESS ve SUCCESS_STALE: yükleme KESİNLEŞTİ → aynı dosyalar yeniden gönderilemez.
      setSelectedCategory('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
    });
  };

  const handleDownload = async (attachment: Attachment) => {
    try {
      const res = await api.get(`/cases/${caseId}/attachments/${attachment.id}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('İndirme başarısız');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu dosyayı silmek istediğinize emin misiniz?')) return;

    setActionError(null);
    setStaleNotice(null);

    // PR-2A1: PESSIMISTIC silme + satır bazlı kilit. Satır çıkarma `try/catch` DIŞINDA
    // idi → silme başarısız olsa bile evrak ekrandan kayboluyordu.
    await rowLock.run(`attachment:${caseId}:${id}`, async () => {
      const outcome = await runMutation({
        mutate: () => api.delete(`/cases/${caseId}/attachments/${id}`),
        refresh: () => loadAttachments({ propagateError: true }),
        failureMessage: 'Dosya silinemedi. Evrak DURUYOR, lütfen tekrar deneyin.',
        staleMessage: 'Dosya SİLİNDİ, ancak liste yenilenemedi.',
      });
      if (!rowLock.isMounted()) return;
      // Hata hâlinde satır ve seçim durumu AYNEN korunur.
      if (outcome.status === 'FAILED') setActionError(outcome.error.message);
      else if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  const getCategoryInfo = (categoryId: string) => {
    return FILE_CATEGORIES.find(c => c.id === categoryId) || FILE_CATEGORIES[5];
  };

  const getCategoryColor = (color: string) => {
    const colors: Record<string, string> = {
      purple: 'bg-purple-100 text-purple-700',
      blue: 'bg-blue-100 text-blue-700',
      green: 'bg-green-100 text-green-700',
      orange: 'bg-orange-100 text-orange-700',
      cyan: 'bg-cyan-100 text-cyan-700',
      gray: 'bg-gray-100 text-gray-700',
    };
    return colors[color] || colors.gray;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('tr-TR');
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
      {/* PR-2A1: okuma ve mutation hataları GÖRÜNÜR; sessizce yutulmaz. */}
      <ActionError message={loadError} />
      <ActionError message={actionError} />
      {/* Yükleme başarılı ama tazeleme başarısız → evrak durur, görünüm bayat.
          Yalnız refresh-only eylemi sunulur; yükleme ASLA tekrarlanmaz. */}
      {staleNotice ? (
        <div
          role="status"
          data-testid="stale-notice"
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          <span className="flex-1">{staleNotice}</span>
          <button
            type="button"
            onClick={handleStaleRefresh}
            disabled={refreshingStale}
            data-testid="stale-refresh"
            className="shrink-0 rounded border border-amber-300 px-1.5 py-0.5 font-medium hover:bg-amber-100 disabled:opacity-50"
          >
            Listeyi yenile
          </button>
        </div>
      ) : null}

      {/* Upload Area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => handleUpload(e.target.files)}
          className="hidden"
        />
        
        {uploading ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <span className="text-blue-600">Yükleniyor...</span>
          </div>
        ) : (
          <>
            <Upload className="h-10 w-10 mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-600 mb-2">
              Dosyaları sürükleyip bırakın veya
            </p>
            <div className="flex items-center justify-center gap-2">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="">Kategori Seç</option>
                {FILE_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                Dosya Seç
              </button>
            </div>
          </>
        )}
      </div>

      {/* Attachments List */}
      {attachments.length === 0 ? (
        <div className="text-center py-6 text-gray-500">
          <FolderOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Henüz dosya eki yok</p>
        </div>
      ) : (
        <div className="space-y-2">
          {attachments.map((attachment) => {
            const category = getCategoryInfo(attachment.category);
            return (
              <div
                key={attachment.id}
                className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50"
              >
                <div className="p-2 bg-gray-100 rounded-lg text-gray-600">
                  {getFileIcon(attachment.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{attachment.name}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{formatFileSize(attachment.size)}</span>
                    <span>•</span>
                    <span>{formatDate(attachment.uploadedAt)}</span>
                    <span>•</span>
                    <span>{attachment.uploadedBy}</span>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs ${getCategoryColor(category.color)}`}>
                  {category.name}
                </span>
                <div className="flex items-center gap-1">
                  {attachment.type.includes('image') && (
                    <button
                      onClick={() => setPreviewUrl(attachment.url || '#')}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                      title="Önizle"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDownload(attachment)}
                    className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"
                    title="İndir"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(attachment.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                    title="Sil"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute top-4 right-4 p-2 bg-white rounded-full"
          >
            <X className="h-6 w-6" />
          </button>
          <img src={previewUrl} alt="Preview" className="max-w-[90vw] max-h-[90vh] rounded-lg" />
        </div>
      )}
    </div>
  );
}
