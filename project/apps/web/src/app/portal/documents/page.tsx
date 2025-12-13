"use client";

import { useEffect, useState, useRef } from "react";
import { FileText, Upload, Download, Trash2, Clock, CheckCircle, XCircle, File } from "lucide-react";

interface Document {
  id: string;
  type: string;
  title: string;
  description?: string;
  fileName: string;
  fileSize: number;
  status: string;
  reviewNote?: string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    const token = localStorage.getItem("portal_token");
    if (!token) return;
    try {
      const res = await fetch("http://localhost:8080/api/portal/documents", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadForm.title) return;
    const token = localStorage.getItem("portal_token");
    if (!token) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("type", uploadForm.type);
      formData.append("title", uploadForm.title);
      if (uploadForm.description) formData.append("description", uploadForm.description);

      const res = await fetch("http://localhost:8080/api/portal/documents/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        setShowUpload(false);
        setSelectedFile(null);
        setUploadForm({ type: "DIGER", title: "", description: "" });
        fetchDocuments();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: Document) => {
    const token = localStorage.getItem("portal_token");
    if (!token) return;
    try {
      const res = await fetch(`http://localhost:8080/api/portal/documents/${doc.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.fileName;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu belgeyi silmek istediğinize emin misiniz?")) return;
    const token = localStorage.getItem("portal_token");
    if (!token) return;
    try {
      const res = await fetch(`http://localhost:8080/api/portal/documents/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchDocuments();
      }
    } catch (e) {
      console.error(e);
    }
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
                    {doc.reviewNote && doc.status === "REJECTED" && <div className="text-xs text-red-500 mt-1">Not: {doc.reviewNote}</div>}
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
