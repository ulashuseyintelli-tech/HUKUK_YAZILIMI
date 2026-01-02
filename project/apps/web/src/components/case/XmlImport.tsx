"use client";

import { useState, useRef } from "react";
import {
  Upload,
  FileCode,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { api } from "@/lib/api";

interface XmlImportProps {
  onImportComplete?: (caseId: string) => void;
}

interface ParsedXmlData {
  dosyaTipi: string;
  takipTuru: string;
  mahiyetKodu: string;
  birimKodu: string;
  takipTarihi: string;
  tarafSayisi: number;
  alacakKalemiSayisi: number;
  toplamTutar: number;
  paraBirimi: string;
}

export function XmlImport({ onImportComplete }: XmlImportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedXmlData | null>(null);
  const [xmlContent, setXmlContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xml')) {
      setError('Sadece XML dosyaları yüklenebilir');
      return;
    }

    setUploading(true);
    setError(null);
    setParsedData(null);

    try {
      const content = await file.text();
      setXmlContent(content);
      
      // XML'i parse et
      setParsing(true);
      const parsed = parseXml(content);
      setParsedData(parsed);
    } catch (err: any) {
      setError(err.message || 'XML dosyası okunamadı');
    } finally {
      setUploading(false);
      setParsing(false);
    }
  };

  const parseXml = (xml: string): ParsedXmlData => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    
    // Parse error kontrolü
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      throw new Error('Geçersiz XML formatı');
    }

    const dosya = doc.querySelector('dosya');
    if (!dosya) {
      throw new Error('XML içinde <dosya> elementi bulunamadı');
    }

    const taraflar = doc.querySelectorAll('taraf');
    const alacakKalemleri = doc.querySelectorAll('alacakKalemi');
    
    // Toplam tutarı hesapla
    let toplamTutar = 0;
    alacakKalemleri.forEach(kalem => {
      const tutar = kalem.querySelector('tutar')?.textContent;
      if (tutar) toplamTutar += parseFloat(tutar);
    });

    return {
      dosyaTipi: dosya.getAttribute('dosyaTipi') || '1',
      takipTuru: dosya.getAttribute('takipTuru') || '1',
      mahiyetKodu: dosya.getAttribute('mahiyetKodu') || '',
      birimKodu: dosya.getAttribute('birimKodu') || '',
      takipTarihi: dosya.getAttribute('takipTarihi') || '',
      tarafSayisi: taraflar.length,
      alacakKalemiSayisi: alacakKalemleri.length,
      toplamTutar,
      paraBirimi: dosya.getAttribute('paraBirimi') || 'TL',
    };
  };

  const handleImport = async () => {
    if (!xmlContent) return;
    
    setImporting(true);
    setError(null);
    
    try {
      // Backend'e XML gönder
      const response = await api.post('/uyap/xml/import', {
        xml: xmlContent,
      });
      
      if (response.data?.caseId) {
        onImportComplete?.(response.data.caseId);
      }
    } catch (err: any) {
      setError(err.message || 'XML import başarısız');
    } finally {
      setImporting(false);
    }
  };

  const takipTuruLabels: Record<string, string> = {
    '1': 'İlamsız Takip',
    '2': 'İlamlı Takip',
    '3': 'Kambiyo Takibi',
    '4': 'Rehin Takibi',
    '5': 'İpotek Takibi',
    '6': 'İflas Takibi',
  };

  const resetForm = () => {
    setParsedData(null);
    setXmlContent(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Upload className="h-4 w-4 text-green-600" />
          UYAP XML Import
        </h3>
      </div>

      {/* File Upload */}
      {!parsedData && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary hover:bg-gray-50 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml"
            onChange={handleFileSelect}
            className="hidden"
          />
          {uploading || parsing ? (
            <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-primary" />
          ) : (
            <FileCode className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          )}
          <p className="text-sm text-muted-foreground">
            {uploading ? 'Yükleniyor...' : parsing ? 'XML analiz ediliyor...' : 'XML dosyası seçin veya sürükleyin'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            exchange.dtd formatında UYAP XML dosyası
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm">
          <XCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Hata</p>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Parsed Data Preview */}
      {parsedData && (
        <div className="space-y-4">
          <div className="p-3 bg-green-50 border border-green-200 rounded">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="font-medium text-green-800">XML Başarıyla Okundu</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-2 bg-gray-50 rounded">
              <p className="text-xs text-muted-foreground">Takip Türü</p>
              <p className="font-medium">{takipTuruLabels[parsedData.takipTuru] || parsedData.takipTuru}</p>
            </div>
            <div className="p-2 bg-gray-50 rounded">
              <p className="text-xs text-muted-foreground">Mahiyet Kodu</p>
              <p className="font-medium font-mono">{parsedData.mahiyetKodu || '-'}</p>
            </div>
            <div className="p-2 bg-gray-50 rounded">
              <p className="text-xs text-muted-foreground">Birim Kodu</p>
              <p className="font-medium font-mono">{parsedData.birimKodu || '-'}</p>
            </div>
            <div className="p-2 bg-gray-50 rounded">
              <p className="text-xs text-muted-foreground">Takip Tarihi</p>
              <p className="font-medium">{parsedData.takipTarihi || '-'}</p>
            </div>
            <div className="p-2 bg-gray-50 rounded">
              <p className="text-xs text-muted-foreground">Taraf Sayısı</p>
              <p className="font-medium">{parsedData.tarafSayisi}</p>
            </div>
            <div className="p-2 bg-gray-50 rounded">
              <p className="text-xs text-muted-foreground">Alacak Kalemi</p>
              <p className="font-medium">{parsedData.alacakKalemiSayisi}</p>
            </div>
            <div className="p-2 bg-blue-50 rounded col-span-2">
              <p className="text-xs text-blue-600">Toplam Tutar</p>
              <p className="font-bold text-blue-800">
                {parsedData.toplamTutar.toLocaleString('tr-TR')} {parsedData.paraBirimi}
              </p>
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">Dikkat</p>
              <p className="text-amber-700">
                Import işlemi yeni bir takip dosyası oluşturacaktır. Mevcut verilerle çakışma olup olmadığını kontrol edin.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={resetForm}
              className="flex-1 px-4 py-2 border rounded hover:bg-gray-50"
            >
              İptal
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Import Ediliyor...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Sisteme Aktar
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
