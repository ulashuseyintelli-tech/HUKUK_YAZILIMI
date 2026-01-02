"use client";

import { useState } from "react";
import {
  Mail,
  Building2,
  FileText,
  Send,
  CheckCircle,
  XCircle,
  Loader2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";

interface BulkCase {
  id: string;
  fileNumber: string;
  executionFileNumber?: string;
  clientName?: string;
  principalAmount?: number;
  currency?: string;
  caseStatus: string;
  debtorCount?: number;
}

interface BulkOperationsPanelProps {
  cases: BulkCase[];
  onComplete?: () => void;
}

type OperationType = "tebligat" | "uyap" | "document" | "status";

interface OperationResult {
  caseId: string;
  fileNumber: string;
  success: boolean;
  message: string;
}

export function BulkOperationsPanel({ cases, onComplete }: BulkOperationsPanelProps) {
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [operationType, setOperationType] = useState<OperationType | "">("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<OperationResult[]>([]);
  const [showResultsDialog, setShowResultsDialog] = useState(false);

  // Tebligat options
  const [tebligatType, setTebligatType] = useState("ODEME_EMRI");
  const [tebligatChannel, setTebligatChannel] = useState("PTT");

  // UYAP options
  const [uyapDocType, setUyapDocType] = useState("TAKIP_TALEBI");

  // Status options
  const [newStatus, setNewStatus] = useState("");

  const toggleCase = (caseId: string) => {
    setSelectedCases(prev =>
      prev.includes(caseId)
        ? prev.filter(id => id !== caseId)
        : [...prev, caseId]
    );
  };

  const toggleAll = () => {
    if (selectedCases.length === cases.length) {
      setSelectedCases([]);
    } else {
      setSelectedCases(cases.map(c => c.id));
    }
  };

  const runBulkOperation = async () => {
    if (selectedCases.length === 0) {
      alert("Lütfen en az bir dosya seçin");
      return;
    }

    if (!operationType) {
      alert("Lütfen işlem türü seçin");
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setResults([]);

    const operationResults: OperationResult[] = [];
    const total = selectedCases.length;

    for (let i = 0; i < selectedCases.length; i++) {
      const caseId = selectedCases[i];
      const caseData = cases.find(c => c.id === caseId);

      try {
        let result: any;

        switch (operationType) {
          case "tebligat":
            result = await api.post(`/tebligat/bulk`, {
              caseIds: [caseId],
              tebligatType,
              channel: tebligatChannel,
            });
            operationResults.push({
              caseId,
              fileNumber: caseData?.fileNumber || caseId,
              success: true,
              message: "Tebligat oluşturuldu",
            });
            break;

          case "uyap":
            result = await api.post(`/uyap/document/submit`, {
              caseId,
              documentType: uyapDocType,
              documentContent: "Toplu işlem",
              documentName: `${uyapDocType}_${caseData?.fileNumber}`,
            });
            operationResults.push({
              caseId,
              fileNumber: caseData?.fileNumber || caseId,
              success: result.data?.success || false,
              message: result.data?.success ? "UYAP'a gönderildi" : (result.data?.errorMessage || "Hata"),
            });
            break;

          case "document":
            result = await api.post(`/template-engine/takip-talebi`, { caseId });
            operationResults.push({
              caseId,
              fileNumber: caseData?.fileNumber || caseId,
              success: true,
              message: "Belge üretildi",
            });
            break;

          case "status":
            if (newStatus) {
              result = await api.changeCaseStatus(caseId, newStatus, "Toplu işlem");
              operationResults.push({
                caseId,
                fileNumber: caseData?.fileNumber || caseId,
                success: true,
                message: `Durum ${newStatus} olarak güncellendi`,
              });
            }
            break;
        }
      } catch (error: any) {
        operationResults.push({
          caseId,
          fileNumber: caseData?.fileNumber || caseId,
          success: false,
          message: error.message || "İşlem başarısız",
        });
      }

      setProgress(Math.round(((i + 1) / total) * 100));
    }

    setResults(operationResults);
    setIsProcessing(false);
    setShowResultsDialog(true);

    if (onComplete) {
      onComplete();
    }
  };

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-xl p-4">
        <div className="mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Toplu İşlemler
          </h3>
          <p className="text-sm text-muted-foreground">
            Birden fazla dosya için toplu işlem yapın
          </p>
        </div>

        <div className="space-y-4">
          {/* Operation Type Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">İşlem Türü</label>
              <select
                value={operationType}
                onChange={(e) => setOperationType(e.target.value as OperationType)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">İşlem seçin</option>
                <option value="tebligat">📧 Toplu Tebligat</option>
                <option value="uyap">🏛️ Toplu UYAP Gönderimi</option>
                <option value="document">📄 Toplu Belge Üretimi</option>
                <option value="status">✅ Toplu Durum Değişikliği</option>
              </select>
            </div>

            {/* Operation-specific options */}
            {operationType === "tebligat" && (
              <>
                <div>
                  <label className="text-sm font-medium mb-2 block">Tebligat Türü</label>
                  <select
                    value={tebligatType}
                    onChange={(e) => setTebligatType(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="ODEME_EMRI">Ödeme Emri</option>
                    <option value="ICRA_EMRI">İcra Emri</option>
                    <option value="HACIZ_IHBARNAMESI_89_1">89/1 İhbarnamesi</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Kanal</label>
                  <select
                    value={tebligatChannel}
                    onChange={(e) => setTebligatChannel(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="PTT">PTT</option>
                    <option value="UETS">UETS</option>
                    <option value="KEP">KEP</option>
                  </select>
                </div>
              </>
            )}

            {operationType === "uyap" && (
              <div>
                <label className="text-sm font-medium mb-2 block">Belge Türü</label>
                <select
                  value={uyapDocType}
                  onChange={(e) => setUyapDocType(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="TAKIP_TALEBI">Takip Talebi</option>
                  <option value="HACIZ_TALEBI">Haciz Talebi</option>
                  <option value="DILEKCE">Dilekçe</option>
                </select>
              </div>
            )}

            {operationType === "status" && (
              <div>
                <label className="text-sm font-medium mb-2 block">Yeni Durum</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Durum seçin</option>
                  <option value="ACTIVE">Aktif</option>
                  <option value="PENDING">Beklemede</option>
                  <option value="CLOSED">Kapalı</option>
                  <option value="ARCHIVED">Arşivlendi</option>
                </select>
              </div>
            )}
          </div>

          {/* Case Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">
                Dosyalar ({selectedCases.length}/{cases.length} seçili)
              </label>
              <button
                type="button"
                onClick={toggleAll}
                className="text-sm text-primary hover:underline"
              >
                {selectedCases.length === cases.length ? "Hiçbirini Seçme" : "Tümünü Seç"}
              </button>
            </div>
            <div className="border rounded-lg max-h-64 overflow-y-auto">
              {cases.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggleCase(c.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedCases.includes(c.id)}
                    onChange={() => {}}
                    className="h-4 w-4 rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{c.fileNumber}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.clientName} - {c.principalAmount?.toLocaleString("tr-TR")} {c.currency}
                    </p>
                  </div>
                  <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                    {c.debtorCount || 0} borçlu
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Progress */}
          {isProcessing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>İşlem devam ediyor...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={runBulkOperation}
            disabled={isProcessing || selectedCases.length === 0 || !operationType}
            className="w-full py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                İşleniyor...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                {selectedCases.length} Dosya İçin İşlemi Başlat
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results Dialog */}
      {showResultsDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-semibold">İşlem Sonuçları</h3>
                <p className="text-sm text-muted-foreground">
                  {successCount} başarılı, {failCount} başarısız
                </p>
              </div>
              <button
                onClick={() => setShowResultsDialog(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto p-4 space-y-2">
              {results.map((result, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-2 p-2 rounded-lg ${
                    result.success ? "bg-green-50" : "bg-red-50"
                  }`}
                >
                  {result.success ? (
                    <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{result.fileNumber}</p>
                    <p className="text-xs text-muted-foreground truncate">{result.message}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t">
              <button
                onClick={() => setShowResultsDialog(false)}
                className="w-full py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
