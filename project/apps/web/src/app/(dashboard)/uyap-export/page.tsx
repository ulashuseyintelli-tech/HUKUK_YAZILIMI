"use client";

import { useState, useEffect } from "react";
import { FileCode, Download, AlertCircle, CheckCircle, Loader2, Search, CheckSquare, Square } from "lucide-react";
import { api, UyapExportResult, UyapExportableCasesResult } from "@/lib/api";

interface ExportableCase {
  id: string;
  fileNumber: string;
  clientName: string;
  debtorCount: number;
  hasWarnings: boolean;
}

export default function UyapExportPage() {
  const [cases, setCases] = useState<ExportableCase[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<UyapExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async () => {
    setIsLoading(true);
    try {
      const res = await api.getExportableCases(200);
      setCases(res.cases);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredCases = cases.filter(c => 
    c.fileNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.clientName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCases.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCases.map(c => c.id)));
    }
  };

  const handleExport = async () => {
    if (selectedIds.size === 0) return;
    
    setIsExporting(true);
    setError(null);
    setResult(null);

    try {
      const blob = await api.downloadBatchXml(Array.from(selectedIds));
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `etakip_toplu_${selectedIds.size}_dosya_${Date.now()}.xml`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setResult({ 
        success: true, 
        fileName: a.download, 
        fileSize: blob.size, 
        caseCount: selectedIds.size 
      });
    } catch (err: any) {
      setError(err.message || "Export hatası");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileCode className="w-6 h-6 text-purple-600" />
            UYAP e-Takip Export
          </h1>
          <p className="text-gray-500 mt-1">
            Dosyaları seçin ve toplu XML olarak indirin
          </p>
        </div>
        
        <button
          onClick={handleExport}
          disabled={selectedIds.size === 0 || isExporting}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {selectedIds.size > 0 ? `${selectedIds.size} Dosya İndir` : "Dosya Seçin"}
        </button>
      </div>

      {result?.success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <div>
            <div className="font-medium text-green-800">XML başarıyla indirildi</div>
            <div className="text-sm text-green-600">
              {result.caseCount} dosya, {(result.fileSize / 1024).toFixed(1)} KB
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <div className="text-red-800">{error}</div>
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-4 border-b flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Dosya no veya müvekkil ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="text-sm text-gray-500">
            {total} dosya ({filteredCases.length} gösteriliyor)
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Dosyalar yükleniyor...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 w-12">
                    <button onClick={toggleSelectAll} className="text-gray-400 hover:text-purple-600">
                      {selectedIds.size === filteredCases.length && filteredCases.length > 0 ? (
                        <CheckSquare className="w-5 h-5" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3">Dosya No</th>
                  <th className="px-4 py-3">Müvekkil</th>
                  <th className="px-4 py-3 text-center">Borçlu</th>
                  <th className="px-4 py-3 text-center">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredCases.map((c) => (
                  <tr 
                    key={c.id} 
                    className={`hover:bg-gray-50 cursor-pointer ${selectedIds.has(c.id) ? "bg-purple-50" : ""}`}
                    onClick={() => toggleSelect(c.id)}
                  >
                    <td className="px-4 py-3">
                      <button className="text-gray-400 hover:text-purple-600">
                        {selectedIds.has(c.id) ? (
                          <CheckSquare className="w-5 h-5 text-purple-600" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{c.fileNumber}</td>
                    <td className="px-4 py-3 text-gray-600">{c.clientName}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{c.debtorCount}</td>
                    <td className="px-4 py-3 text-center">
                      {c.hasWarnings ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-100 rounded-full">
                          <AlertCircle className="w-3 h-3" />
                          Uyarı
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                          <CheckCircle className="w-3 h-3" />
                          Hazır
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredCases.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                {searchTerm ? "Arama sonucu bulunamadı" : "Export edilebilir dosya yok"}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-medium text-blue-800 mb-2">UYAP e-Takip Hakkında</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• XML dosyası UYAP Avukat Portal'a yüklenebilir</li>
          <li>• Toplu dosya yüklemesi için "Ortak Vekil" sistemi kullanılır</li>
          <li>• Belge tarama standartları: TIFF, max 500KB, 75-100 DPI</li>
        </ul>
      </div>
    </div>
  );
}
