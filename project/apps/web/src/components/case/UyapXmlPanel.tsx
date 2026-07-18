"use client";

import { useState } from "react";
import {
  FileCode,
  Download,
  Eye,
  Send,
  XCircle,
  Loader2,
  Copy,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";

interface UyapXmlPanelProps {
  caseId: string;
  fileNumber: string;
  hasUyapCode?: boolean;
}

interface XmlValidation {
  isValid: boolean;
  errors: string[];
  // F2: yerel yapısal ön-kontrol; resmî DTD doğrulaması DEĞİL.
  validationMode?: string;
  officialDtdValidated?: boolean;
}

interface XmlResponse {
  xml: string;
  validation: XmlValidation;
  // F1: legacy/local envelope — resmî sözleşme uyumluluğu iddia edilmez.
  contractMode?: string;
  officialContractCompliant?: boolean;
  officialContractVersion?: string | null;
  cutoverStatus?: string;
  generatedAt: string;
}

export function UyapXmlPanel({ caseId, fileNumber, hasUyapCode }: UyapXmlPanelProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [xmlData, setXmlData] = useState<XmlResponse | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // XML Oluştur
  const handleGenerateXml = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/uyap/xml/case/${caseId}`);
      setXmlData(response.data);
      setShowPreview(true);
    } catch (err: any) {
      setError(err.message || "XML oluşturulurken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  // XML İndir
  const handleDownloadXml = async () => {
    try {
      const response = await api.get(`/uyap/xml/case/${caseId}/download`, { responseType: 'blob' });
      const blob = response.data as unknown as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `e-takip-${fileNumber.replace(/\//g, '-')}.xml`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.message || "İndirme başarısız");
    }
  };

  // Yerel Simülasyon (STUB)
  const handleSubmitToUyap = async () => {
    if (!confirm("Yerel simülasyon çalıştırılsın mı? Gerçek UYAP iletimi YAPILMAZ (STUB).")) return;
    
    setSubmitting(true);
    setError(null);
    setSubmitResult(null);
    try {
      const response = await api.post(`/uyap/xml/submit/${caseId}`);
      setSubmitResult(response.data);
    } catch (err: any) {
      setError(err.message || "UYAP'a gönderim başarısız");
    } finally {
      setSubmitting(false);
    }
  };

  // XML Kopyala
  const handleCopyXml = () => {
    if (xmlData?.xml) {
      navigator.clipboard.writeText(xmlData.xml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <FileCode className="h-4 w-4 text-blue-600" />
          UYAP e-Takip XML
        </h3>
        <span className="text-xs text-amber-600">Yerel legacy XML · resmî UYAP ile doğrulanmamış</span>
      </div>

      {/* UYAP Kodu Uyarısı */}
      {!hasUyapCode && (
        <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">UYAP Birim Kodu Eksik</p>
            <p className="text-amber-700">İcra dairesi UYAP kodu tanımlanmamış. XML oluşturulabilir ancak gönderim yapılamaz.</p>
          </div>
        </div>
      )}

      {/* Butonlar */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleGenerateXml}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
          Önizle
        </button>
        
        <button
          onClick={handleDownloadXml}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded hover:bg-gray-50"
        >
          <Download className="h-3 w-3" />
          İndir
        </button>
        
        <button
          onClick={handleSubmitToUyap}
          disabled={submitting || !hasUyapCode}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Yerel Simülasyon (STUB)
        </button>
      </div>

      {/* Hata Mesajı */}
      {error && (
        <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-xs">
          <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Gönderim Sonucu — STUB: gerçek UYAP iletimi YOK */}
      {submitResult && (
        <div className={`p-3 rounded border ${submitResult.success ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            {submitResult.success ? (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600" />
            )}
            <span className={`text-sm font-medium ${submitResult.success ? 'text-amber-800' : 'text-red-800'}`}>
              {submitResult.success ? 'Yerel simülasyon tamamlandı' : 'Yerel simülasyon başarısız'}
            </span>
          </div>
          <p className="text-xs text-amber-700">Gerçek UYAP iletimi yapılmadı (STUB).</p>
          {submitResult.stubReference && (
            <p className="text-xs text-muted-foreground mt-1">
              Simülasyon referansı: <span className="font-mono">{submitResult.stubReference}</span> (resmî EVK değildir)
            </p>
          )}
          {submitResult.message && (
            <p className="text-xs mt-1">{submitResult.message}</p>
          )}
          {submitResult.errors && submitResult.errors.length > 0 && (
            <ul className="text-xs text-red-700 mt-2 space-y-1">
              {submitResult.errors.map((err: string, i: number) => (
                <li key={i}>• {err}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* XML Önizleme Modal */}
      {showPreview && xmlData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-semibold">UYAP e-Takip XML Önizleme</h3>
                <p className="text-xs text-amber-600">
                  Yerel legacy XML · resmî UYAP Contract A ile doğrulanmamış · Oluşturulma: {new Date(xmlData.generatedAt).toLocaleString('tr-TR')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyXml}
                  className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-gray-50"
                >
                  <Copy className="h-3 w-3" />
                  {copied ? 'Kopyalandı!' : 'Kopyala'}
                </button>
                <button
                  onClick={handleDownloadXml}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  <Download className="h-3 w-3" />
                  İndir
                </button>
                <button
                  onClick={() => setShowPreview(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Validation Status — yerel yapısal ön-kontrol (resmî DTD doğrulaması DEĞİL) */}
            <div className={`px-4 py-2 flex items-center gap-2 ${xmlData.validation.isValid ? 'bg-amber-50' : 'bg-red-50'}`}>
              {xmlData.validation.isValid ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm text-amber-800">Yerel yapısal ön-kontrol geçti. Resmî UYAP DTD doğrulaması yapılmadı.</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-red-800">
                    Yerel yapısal ön-kontrol hatası ({xmlData.validation.errors.length} hata)
                  </span>
                </>
              )}
            </div>

            {/* Validation Errors */}
            {!xmlData.validation.isValid && xmlData.validation.errors.length > 0 && (
              <div className="px-4 py-2 bg-red-50 border-b border-red-200">
                <ul className="text-xs text-red-700 space-y-1">
                  {xmlData.validation.errors.map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* XML Content */}
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-xs font-mono bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto whitespace-pre">
                {xmlData.xml}
              </pre>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t bg-gray-50">
              <div className="text-xs text-muted-foreground">
                {xmlData.xml.length.toLocaleString()} karakter
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPreview(false)}
                  className="px-4 py-2 text-sm border rounded hover:bg-gray-100"
                >
                  Kapat
                </button>
                <button
                  onClick={handleSubmitToUyap}
                  disabled={submitting || !hasUyapCode || !xmlData.validation.isValid}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Yerel Simülasyon (STUB)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
