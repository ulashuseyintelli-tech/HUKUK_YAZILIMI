"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { FileSignature, CheckCircle, XCircle, Clock, Upload, RefreshCw } from "lucide-react";

interface ESignPanelProps {
  caseId: string;
  documentId?: string;
  documentName?: string;
  onSigned?: (result: any) => void;
}

interface ESignLog {
  id: string;
  documentId: string;
  documentName: string;
  signerName: string;
  signerTcNo: string;
  signatureType: string;
  provider: string;
  transactionId?: string;
  status: string;
  signedAt?: string;
  createdAt: string;
  errorMessage?: string;
}

interface ESignStats {
  total: number;
  pending: number;
  success: number;
  failed: number;
}

export function ESignPanel({ caseId, documentId, documentName, onSigned }: ESignPanelProps) {
  const [history, setHistory] = useState<ESignLog[]>([]);
  const [stats, setStats] = useState<ESignStats | null>(null);
  const [providerStatus, setProviderStatus] = useState<{ provider: string; configured: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  
  // Form state
  const [signerName, setSignerName] = useState("");
  const [signerTcNo, setSignerTcNo] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerPhone, setSignerPhone] = useState("");
  const [signatureType, setSignatureType] = useState<"QUALIFIED" | "ADVANCED" | "SIMPLE">("QUALIFIED");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    loadData();
  }, [caseId, documentId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statusRes, historyRes] = await Promise.all([
        api.get("/esign/status"),
        api.get(`/esign/history?documentId=${documentId || caseId}&limit=20`),
      ]);
      
      setProviderStatus(statusRes.data);
      setStats(statusRes.data?.stats);
      setHistory(historyRes.data || []);
    } catch (error) {
      console.error("E-imza verisi yüklenemedi:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async () => {
    if (!signerName || !signerTcNo) {
      alert("İmzacı adı ve TC kimlik numarası zorunludur");
      return;
    }

    if (!selectedFile && !documentId) {
      alert("Lütfen imzalanacak belgeyi seçin");
      return;
    }

    setSigning(true);
    try {
      let documentContent = "";
      
      if (selectedFile) {
        // Dosyayı base64'e çevir
        const reader = new FileReader();
        documentContent = await new Promise((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.readAsDataURL(selectedFile);
        });
      }

      const result = await api.post("/esign/sign", {
        documentId: documentId || caseId,
        documentName: documentName || selectedFile?.name || "Belge",
        documentContent,
        signerId: caseId,
        signerName,
        signerTcNo,
        signerEmail,
        signerPhone,
        signatureType,
        signatureReason: "İcra Takibi",
        signatureLocation: "Türkiye",
      });

      if (result.data?.success) {
        alert("İmza isteği başarıyla gönderildi");
        onSigned?.(result.data);
        loadData();
        // Formu temizle
        setSignerName("");
        setSignerTcNo("");
        setSignerEmail("");
        setSignerPhone("");
        setSelectedFile(null);
      } else {
        alert(`İmza hatası: ${result.data?.errorMessage || "Bilinmeyen hata"}`);
      }
    } catch (error: any) {
      alert(`İmza hatası: ${error.message}`);
    } finally {
      setSigning(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; icon: any }> = {
      SUCCESS: { bg: "bg-green-100", text: "text-green-700", icon: CheckCircle },
      PENDING: { bg: "bg-yellow-100", text: "text-yellow-700", icon: Clock },
      FAILED: { bg: "bg-red-100", text: "text-red-700", icon: XCircle },
    };
    const style = styles[status] || styles.PENDING;
    const Icon = style.icon;
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        <Icon className="h-3 w-3" />
        {status === "SUCCESS" ? "İmzalandı" : status === "PENDING" ? "Bekliyor" : "Başarısız"}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-blue-600" />
            E-İmza
          </h3>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              providerStatus?.configured ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
            }`}>
              {providerStatus?.provider === "mock" ? "Test Modu" : providerStatus?.provider?.toUpperCase()}
            </span>
            <button onClick={loadData} className="p-1 hover:bg-gray-100 rounded">
              <RefreshCw className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-xs text-gray-500">Toplam</div>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
              <div className="text-xs text-gray-500">Bekleyen</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{stats.success}</div>
              <div className="text-xs text-gray-500">Başarılı</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
              <div className="text-xs text-gray-500">Başarısız</div>
            </div>
          </div>
        )}

        {/* Sign Form */}
        <div className="border rounded-lg p-4 space-y-4">
          <h4 className="font-medium text-gray-900">Yeni İmza İsteği</h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                İmzacı Adı Soyadı *
              </label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Av. Mehmet Yılmaz"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                TC Kimlik No *
              </label>
              <input
                type="text"
                value={signerTcNo}
                onChange={(e) => setSignerTcNo(e.target.value.replace(/\D/g, "").slice(0, 11))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="12345678901"
                maxLength={11}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                E-posta
              </label>
              <input
                type="email"
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="avukat@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Telefon (Mobil İmza için)
              </label>
              <input
                type="tel"
                value={signerPhone}
                onChange={(e) => setSignerPhone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="05XX XXX XX XX"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                İmza Türü
              </label>
              <select
                value={signatureType}
                onChange={(e) => setSignatureType(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="QUALIFIED">Nitelikli E-İmza</option>
                <option value="ADVANCED">Gelişmiş E-İmza</option>
                <option value="SIMPLE">Basit E-İmza</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Belge (PDF)
              </label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            onClick={handleSign}
            disabled={signing || !signerName || !signerTcNo}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {signing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                İmzalanıyor...
              </>
            ) : (
              <>
                <FileSignature className="h-4 w-4" />
                İmzala
              </>
            )}
          </button>
        </div>

        {/* History */}
        <div>
          <h4 className="font-medium text-gray-900 mb-3">İmza Geçmişi</h4>
          {history.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Henüz imza kaydı yok</p>
          ) : (
            <div className="space-y-2">
              {history.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900">{log.documentName}</div>
                    <div className="text-sm text-gray-500">
                      {log.signerName} • {new Date(log.createdAt).toLocaleString("tr-TR")}
                    </div>
                    {log.errorMessage && (
                      <div className="text-xs text-red-600 mt-1">{log.errorMessage}</div>
                    )}
                  </div>
                  {getStatusBadge(log.status)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
