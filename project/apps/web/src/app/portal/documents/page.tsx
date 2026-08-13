"use client";

import { useEffect, useState, useRef } from "react";
import { FileText, Upload, Download, Trash2, Clock, CheckCircle, XCircle, File } from "lucide-react";
// CLIENT-CONFIG-P01: belge çağrıları `NEXT_PUBLIC_API_URL`'i hiç okumayan sabit
// `http://localhost:8080` adresine gidiyordu — farklı origin'li dağıtımlarda belge
// listeleme/yükleme/indirme/silme sessizce çalışmıyordu. İndirme akışında yalnız API
// ENDPOINT'i bu helper'dan gelir; `URL.createObjectURL` ile üretilen yerel blob URL'i
// API base URL ile BİRLEŞTİRİLMEZ (mevcut davranış korundu).
import { portalApiUrl } from "@/lib/config/portal-api-url";
import { ActionError } from "@/components/ui/action-error";
import { toActionErrorMessage } from "@/lib/action-error";
import { runMutation, runRefreshOnly } from "@/lib/mutation-outcome";
import { downloadVerified } from "@/lib/verified-download";
import { useSubmitLock } from "@/lib/use-submit-lock";

interface Document {
  id: string;
  type: string;
  title: string;
  description?: string;
  fileName: string;
  fileSize: number;
  status: string;
  createdAt: string;
}

const DOC_TYPES = [
  { value: "VEKALET", label: "Vekaletname" },
  { value: "KIMLIK", label: "Kimlik Belgesi" },
  { value: "SOZLESME", label: "Sözleşme" },
  { value: "DIGER", label: "Diğer" },
];

export default function PortalDocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ type: "DIGER", title: "", description: "" });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // PR-2A1: yukleme hatasi GORUNUR; basarisiz yukleme "yuklendi" gibi davranamaz.
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [refreshingStale, setRefreshingStale] = useState(false);
  const submitLock = useSubmitLock();
  const handleStaleRefresh = async () => {
    setRefreshingStale(true);
    const ok = await runRefreshOnly(() => fetchDocuments({ propagateError: true }));
    setRefreshingStale(false);
    if (ok) setStaleNotice(null);
  };

  /** `fetch` HTTP hatasinda throw ETMEZ; sozlesme burada acikca kurulur. */
  const throwIfNotOk = async (res: Response): Promise<Response> => {
    if (res.ok) return res;
    const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
    throw {
      status: res.status,
      body: { message: typeof body?.message === "string" ? body.message : undefined },
    };
  };
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async (opts?: { propagateError?: boolean }) => {
    const token = localStorage.getItem("portal_token");
    // CLIENT-REMEDIATION-CLOSEOUT-R01: erken dönüşte de loading KESİN olarak kapatılır.
    // Önceki halde `return` ifadesi aşağıdaki try/finally'den ÖNCE çalıştığı için
    // `setLoading(false)` hiç çağrılmıyor ve token yokken kullanıcı KALICI spinner
    // görüyordu. API çağrısı yine yapılmaz (mevcut guard aynen korunur).
    if (!token) {
      setLoading(false);
      return;
    }
    setLoadError(null);
    try {
      // PR-2A1 DEPENDENCY_FIXED: !ok sessizce yutuluyordu (liste bayat kaliyordu);
      // malformed yanit GERCEK EMPTY sayilmaz.
      const res = await throwIfNotOk(
        await fetch(portalApiUrl("/api/portal/documents"), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      const data: unknown = await res.json();
      if (!Array.isArray(data)) throw new Error("MALFORMED_LIST_RESPONSE");
      setDocuments(data as Document[]);
    } catch (e) {
      setLoadError(toActionErrorMessage(e, "Belgeler yüklenemedi."));
      if (opts?.propagateError) throw e;
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadForm.title) return;
    const token = localStorage.getItem("portal_token");
    if (!token) return;

    // PR-2A1: create yolunda idempotency anahtari YOK -> senkron kilit sart.
    await submitLock.run(async () => {
      setUploading(true);
      setActionError(null);
      setStaleNotice(null);
      try {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("type", uploadForm.type);
        formData.append("title", uploadForm.title);
        if (uploadForm.description) formData.append("description", uploadForm.description);

        const outcome = await runMutation({
          mutate: async () =>
            throwIfNotOk(
              await fetch(portalApiUrl("/api/portal/documents/upload"), {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
              }),
            ),
          refresh: () => fetchDocuments({ propagateError: true }),
          failureMessage: "Belge yüklenemedi. Dosya GÖNDERİLMEDİ, lütfen tekrar deneyin.",
          staleMessage: "Belge YÜKLENDİ, ancak liste yenilenemedi.",
        });

        if (!submitLock.isMounted()) return;
        if (outcome.status === "FAILED") {
          // Form ve modal KORUNUR; eski davranis !ok'ta SESSIZCE hicbir sey yapmiyordu.
          setActionError(outcome.error.message);
          return;
        }
        // SUCCESS ve SUCCESS_STALE: yukleme KESINLESTI -> ayni dosya yeniden gonderilemez.
        setShowUpload(false);
        setSelectedFile(null);
        setUploadForm({ type: "DIGER", title: "", description: "" });
        if (outcome.status === "SUCCESS_STALE") setStaleNotice(outcome.stale);
      } finally {
        if (submitLock.isMounted()) setUploading(false);
      }
    });
  };

  /**
   * WSMR-A4g · SESSIZ INDIRME HATASI KALDIRILDI.
   *
   * Eski hâlde `res.ok` degilse HICBIR SEY olmuyordu: tiklama hicbir iz
   * birakmadan yutuluyordu. Ayrica govde HIC dogrulanmadan indiriliyordu —
   * sunucu JSON hata govdesi dondurse bile o govde belge adiyla diske
   * yaziliyordu. Artik indirme A3g'nin `downloadVerified` primitifinden gecer:
   * bos govde / sifir bayt / JSON hata govdesi indirilmez, hata gorunur olur.
   */
  const handleDownload = async (doc: Document) => {
    const token = localStorage.getItem("portal_token");
    if (!token) return;
    setActionError(null);
    try {
      const res = await throwIfNotOk(
        await fetch(portalApiUrl(`/api/portal/documents/${doc.id}/download`), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      const blob = await res.blob();
      const outcome = downloadVerified(blob, {
        fileName: doc.fileName,
        fallbackFileName: "belge",
      });
      if (!outcome.ok) setActionError(outcome.message);
    } catch (e) {
      setActionError(toActionErrorMessage(e, "Belge indirilemedi."));
    }
  };

  /**
   * WSMR-A4g · SESSIZ SILME HATASI KALDIRILDI.
   *
   * Kullanici onay diyalogunu kabul ettikten sonra istek basarisiz olursa eski
   * hâlde hicbir sey gorunmuyordu; liste de tazelenmedigi icin belge yerinde
   * kaliyor, kullanici ise silme isleminin gectigini varsayabiliyordu.
   */
  const handleDelete = async (id: string) => {
    if (!confirm("Bu belgeyi silmek istediğinize emin misiniz?")) return;
    const token = localStorage.getItem("portal_token");
    if (!token) return;
    setActionError(null);
    const outcome = await runMutation({
      mutate: async () => {
        await throwIfNotOk(
          await fetch(portalApiUrl(`/api/portal/documents/${id}`), {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
        return true;
      },
      refresh: fetchDocuments,
      failureMessage: "Belge silinemedi.",
    });
    if (outcome.status === "FAILED") {
      setActionError(outcome.error.message);
      return;
    }
    if (outcome.status === "SUCCESS_STALE") setStaleNotice(outcome.stale);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-700"><Clock className="h-3 w-3" /> Beklemede</span>;
      case "APPROVED":
        return <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-green-100 text-green-700"><CheckCircle className="h-3 w-3" /> Onaylandı</span>;
      case "REJECTED":
        return <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-red-100 text-red-700"><XCircle className="h-3 w-3" /> Reddedildi</span>;
      default:
        return null;
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="space-y-4">
      {/* PR-2A1: okuma ve yukleme hatalari GORUNUR; sessizce yutulmaz. */}
      <ActionError message={loadError} />
      <ActionError message={actionError} />
      {staleNotice ? (
        <div role="status" data-testid="stale-notice" className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="flex-1">{staleNotice}</span>
          <button type="button" onClick={handleStaleRefresh} disabled={refreshingStale} data-testid="stale-refresh" className="shrink-0 rounded border border-amber-300 px-1.5 py-0.5 font-medium hover:bg-amber-100 disabled:opacity-50">
            Listeyi yenile
          </button>
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2"><FileText className="h-5 w-5" /> Belgelerim</h1>
        <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Upload className="h-4 w-4" /> Belge Yükle
        </button>
      </div>

      {/* Yükleme Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Belge Yükle</h2>
            <ActionError message={actionError} />
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Belge Türü</label>
                <select value={uploadForm.type} onChange={e => setUploadForm({ ...uploadForm, type: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                  {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Başlık *</label>
                <input type="text" value={uploadForm.title} onChange={e => setUploadForm({ ...uploadForm, title: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="Belge başlığı" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Açıklama</label>
                <textarea value={uploadForm.description} onChange={e => setUploadForm({ ...uploadForm, description: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={2} placeholder="Opsiyonel açıklama" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Dosya *</label>
                <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e => setSelectedFile(e.target.files?.[0] || null)} className="w-full border rounded-lg px-3 py-2" />
                <p className="text-xs text-gray-500 mt-1">PDF, JPG, PNG, DOC, DOCX (max 10MB)</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => { setShowUpload(false); setSelectedFile(null); }} className="px-4 py-2 border rounded-lg hover:bg-gray-50">İptal</button>
              <button onClick={handleUpload} disabled={uploading || !selectedFile || !uploadForm.title} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {uploading ? "Yükleniyor..." : "Yükle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Belge Listesi */}
      {documents.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <File className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">Henüz belge yüklemediniz</p>
          <button onClick={() => setShowUpload(true)} className="mt-3 text-blue-600 hover:underline">İlk belgenizi yükleyin</button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Belge</th>
                <th className="text-left px-4 py-3 font-medium">Tür</th>
                <th className="text-left px-4 py-3 font-medium">Boyut</th>
                <th className="text-left px-4 py-3 font-medium">Durum</th>
                <th className="text-left px-4 py-3 font-medium">Tarih</th>
                <th className="text-right px-4 py-3 font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {documents.map(doc => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{doc.title}</div>
                    <div className="text-xs text-gray-500">{doc.fileName}</div>
                    {doc.description && <div className="text-xs text-gray-400 mt-1">{doc.description}</div>}
                  </td>
                  <td className="px-4 py-3">{DOC_TYPES.find(t => t.value === doc.type)?.label || doc.type}</td>
                  <td className="px-4 py-3 text-gray-600">{formatFileSize(doc.fileSize)}</td>
                  <td className="px-4 py-3">{getStatusBadge(doc.status)}</td>
                  <td className="px-4 py-3 text-gray-600">{new Date(doc.createdAt).toLocaleDateString("tr-TR")}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleDownload(doc)} className="p-1 text-gray-500 hover:text-blue-600" title="İndir"><Download className="h-4 w-4" /></button>
                      {doc.status === "PENDING" && (
                        <button onClick={() => handleDelete(doc.id)} className="p-1 text-gray-500 hover:text-red-600" title="Sil"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
