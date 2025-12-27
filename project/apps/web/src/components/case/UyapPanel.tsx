"use client";

import { useState, useEffect } from "react";
import {
  api,
  UyapStatus,
  UyapRequestLog,
  UyapCasePoaValidation,
  UyapDocumentType,
  HacizTargetType,
} from "@/lib/api";

interface UyapPanelProps {
  caseId: string;
  onDocumentSubmitted?: () => void;
}

export function UyapPanel({ caseId, onDocumentSubmitted }: UyapPanelProps) {
  const [status, setStatus] = useState<UyapStatus | null>(null);
  const [poaValidation, setPoaValidation] = useState<UyapCasePoaValidation | null>(null);
  const [history, setHistory] = useState<UyapRequestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"status" | "document" | "haciz" | "history">("status");
  
  // Document form state
  const [documentType, setDocumentType] = useState<UyapDocumentType>("TAKIP_TALEBI");
  const [documentName, setDocumentName] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Haciz form state
  const [hacizType, setHacizType] = useState<HacizTargetType>("BANK");
  const [hacizAmount, setHacizAmount] = useState("");
  const [hacizDetails, setHacizDetails] = useState("");

  useEffect(() => {
    loadData();
  }, [caseId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statusRes, poaRes, historyRes] = await Promise.all([
        api.getUyapStatus(),
        api.validateUyapCasePoa(caseId),
        api.getUyapRequestHistory(caseId, 20),
      ]);
      setStatus(statusRes);
      setPoaValidation(poaRes);
      setHistory(historyRes);
    } catch (error) {
      console.error("UYAP veri yükleme hatası:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentSubmit = async () => {
    if (!documentFile || !documentName) return;
    
    setSubmitting(true);
    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        await api.submitUyapDocument({
          caseId,
          documentType,
          documentContent: base64,
          documentName,
        });
        setDocumentName("");
        setDocumentFile(null);
        loadData();
        onDocumentSubmitted?.();
      };
      reader.readAsDataURL(documentFile);
    } catch (error) {
      console.error("Evrak gönderme hatası:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleHacizSubmit = async () => {
    if (!hacizAmount) return;
    
    setSubmitting(true);
    try {
      await api.sendUyapHacizRequest({
        caseId,
        targetType: hacizType,
        targetDetails: { notes: hacizDetails },
        amount: parseFloat(hacizAmount),
      });
      setHacizAmount("");
      setHacizDetails("");
      loadData();
    } catch (error) {
      console.error("Haciz talebi hatası:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryFailed = async () => {
    try {
      const result = await api.retryUyapFailedRequests();
      alert(`${result.retriedCount} istek yeniden denendi`);
      loadData();
    } catch (error) {
      console.error("Retry hatası:", error);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const documentTypes: { value: UyapDocumentType; label: string }[] = [
    { value: "TAKIP_TALEBI", label: "Takip Talebi" },
    { value: "DILEKCE", label: "Dilekçe" },
    { value: "BEYAN", label: "Beyan" },
    { value: "ITIRAZ", label: "İtiraz" },
    { value: "HACIZ_TALEBI", label: "Haciz Talebi" },
    { value: "DIGER", label: "Diğer" },
  ];

  const hacizTypes: { value: HacizTargetType; label: string }[] = [
    { value: "BANK", label: "Banka Hesabı" },
    { value: "VEHICLE", label: "Araç" },
    { value: "PROPERTY", label: "Taşınmaz" },
    { value: "SALARY", label: "Maaş" },
  ];

  const getStatusBadge = (reqStatus: string) => {
    const colors: Record<string, string> = {
      SUCCESS: "bg-green-100 text-green-800",
      FAILED: "bg-red-100 text-red-800",
      PENDING: "bg-yellow-100 text-yellow-800",
      RETRY: "bg-blue-100 text-blue-800",
    };
    return colors[reqStatus] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">UYAP Entegrasyonu</h3>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              status?.connected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            }`}>
              {status?.mode === "STUB" ? "Test Modu" : "Canlı"}
            </span>
            {status?.connected && (
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px">
          {[
            { id: "status", label: "Durum" },
            { id: "document", label: "Evrak Gönder" },
            { id: "haciz", label: "Haciz Talebi" },
            { id: "history", label: "Geçmiş" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-medium border-b-2 ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Status Tab */}
        {activeTab === "status" && (
          <div className="space-y-6">
            {/* Connection Status */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3">Bağlantı Durumu</h4>
              <p className="text-sm text-gray-600">{status?.message}</p>
              
              {status?.stats && (
                <div className="grid grid-cols-4 gap-4 mt-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{status.stats.total}</div>
                    <div className="text-xs text-gray-500">Toplam</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">{status.stats.pending}</div>
                    <div className="text-xs text-gray-500">Bekleyen</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{status.stats.success}</div>
                    <div className="text-xs text-gray-500">Başarılı</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{status.stats.failed}</div>
                    <div className="text-xs text-gray-500">Başarısız</div>
                  </div>
                </div>
              )}
            </div>

            {/* POA Validation */}
            <div className={`rounded-lg p-4 ${
              poaValidation?.isValid ? "bg-green-50" : "bg-red-50"
            }`}>
              <h4 className="font-medium text-gray-900 mb-2">Vekalet Kontrolü</h4>
              {poaValidation?.isValid ? (
                <p className="text-sm text-green-700">
                  ✓ Tüm vekaletler geçerli. UYAP işlemlerine devam edilebilir.
                </p>
              ) : (
                <div>
                  <p className="text-sm text-red-700 mb-2">
                    ✗ Vekalet sorunları tespit edildi:
                  </p>
                  <ul className="list-disc list-inside text-sm text-red-600">
                    {poaValidation?.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {status?.stats && status.stats.failed > 0 && (
              <button
                onClick={handleRetryFailed}
                className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Başarısız İstekleri Yeniden Dene ({status.stats.failed})
              </button>
            )}
          </div>
        )}

        {/* Document Tab */}
        {activeTab === "document" && (
          <div className="space-y-4">
            {!poaValidation?.canProceedToUyap && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800">
                  ⚠️ Vekalet sorunları nedeniyle evrak gönderimi engellenebilir.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Evrak Türü
              </label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as UyapDocumentType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {documentTypes.map((dt) => (
                  <option key={dt.value} value={dt.value}>{dt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Evrak Adı
              </label>
              <input
                type="text"
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                placeholder="Örn: Takip Talebi - 2025/12345"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PDF Dosyası
              </label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={handleDocumentSubmit}
              disabled={submitting || !documentFile || !documentName}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {submitting ? "Gönderiliyor..." : "UYAP'a Gönder"}
            </button>
          </div>
        )}

        {/* Haciz Tab */}
        {activeTab === "haciz" && (
          <div className="space-y-4">
            {!poaValidation?.canProceedToUyap && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800">
                  ⚠️ Vekalet sorunları nedeniyle haciz talebi engellenebilir.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Haciz Türü
              </label>
              <select
                value={hacizType}
                onChange={(e) => setHacizType(e.target.value as HacizTargetType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {hacizTypes.map((ht) => (
                  <option key={ht.value} value={ht.value}>{ht.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Haciz Tutarı (TL)
              </label>
              <input
                type="number"
                value={hacizAmount}
                onChange={(e) => setHacizAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Detaylar / Notlar
              </label>
              <textarea
                value={hacizDetails}
                onChange={(e) => setHacizDetails(e.target.value)}
                rows={3}
                placeholder="Banka adı, hesap no, araç plakası vb."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={handleHacizSubmit}
              disabled={submitting || !hacizAmount}
              className="w-full py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {submitting ? "Gönderiliyor..." : "Haciz Talebi Gönder"}
            </button>
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="space-y-3">
            {history.length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                Henüz UYAP işlemi yapılmamış.
              </p>
            ) : (
              history.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <div className="font-medium text-gray-900">{log.requestType}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(log.createdAt).toLocaleString("tr-TR")}
                      {log.evkNo && ` • EVK: ${log.evkNo}`}
                    </div>
                    {log.errorMessage && (
                      <div className="text-xs text-red-600 mt-1">{log.errorMessage}</div>
                    )}
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(log.status)}`}>
                    {log.status}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
