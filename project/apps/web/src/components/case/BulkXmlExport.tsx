"use client";

import { useState } from "react";
import {
  FileCode,
  Download,
  Loader2,
  CheckCircle,
  XCircle,
  Package,
} from "lucide-react";
import { api } from "@/lib/api";
import JSZip from "jszip";

interface BulkXmlExportProps {
  caseIds: string[];
  onComplete?: () => void;
}

interface ExportResult {
  caseId: string;
  fileNumber: string;
  success: boolean;
  error?: string;
}

export function BulkXmlExport({ caseIds, onComplete }: BulkXmlExportProps) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ExportResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  const handleExport = async () => {
    if (caseIds.length === 0) return;
    
    setExporting(true);
    setProgress(0);
    setResults([]);
    
    const zip = new JSZip();
    const exportResults: ExportResult[] = [];
    
    for (let i = 0; i < caseIds.length; i++) {
      const caseId = caseIds[i];
      try {
        const response = await api.get(`/uyap/xml/case/${caseId}`);
        const data = response.data;
        
        // Dosya adı için case bilgisi
        const fileName = `e-takip-${caseId.substring(0, 8)}.xml`;
        zip.file(fileName, data.xml);
        
        exportResults.push({
          caseId,
          fileNumber: fileName,
          success: true,
        });
      } catch (err: any) {
        exportResults.push({
          caseId,
          fileNumber: caseId,
          success: false,
          error: err.message || 'XML oluşturulamadı',
        });
      }
      
      setProgress(Math.round(((i + 1) / caseIds.length) * 100));
    }
    
    setResults(exportResults);
    setShowResults(true);
    
    // ZIP dosyasını indir
    const successCount = exportResults.filter(r => r.success).length;
    if (successCount > 0) {
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `uyap-xml-toplu-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
    
    setExporting(false);
    onComplete?.();
  };

  return (
    <div className="space-y-4">
      {/* Export Button */}
      <button
        onClick={handleExport}
        disabled={exporting || caseIds.length === 0}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {exporting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>XML Oluşturuluyor... ({progress}%)</span>
          </>
        ) : (
          <>
            <Package className="h-5 w-5" />
            <span>{caseIds.length} Dosya için Toplu XML İndir</span>
          </>
        )}
      </button>

      {/* Progress Bar */}
      {exporting && (
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Results */}
      {showResults && results.length > 0 && (
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Export Sonuçları</h4>
            <button
              onClick={() => setShowResults(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Kapat
            </button>
          </div>
          
          <div className="flex gap-4 text-sm">
            <span className="text-green-600">
              ✓ {results.filter(r => r.success).length} başarılı
            </span>
            <span className="text-red-600">
              ✗ {results.filter(r => !r.success).length} başarısız
            </span>
          </div>
          
          {results.filter(r => !r.success).length > 0 && (
            <div className="max-h-32 overflow-y-auto space-y-1">
              {results.filter(r => !r.success).map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-red-600">
                  <XCircle className="h-3 w-3" />
                  <span>{r.fileNumber}: {r.error}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
