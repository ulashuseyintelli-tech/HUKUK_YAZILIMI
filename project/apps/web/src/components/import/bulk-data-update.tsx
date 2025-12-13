'use client';

import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, ArrowRight, Check, X, AlertTriangle, Loader2, Download, Eye } from 'lucide-react';

interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  sampleValue?: string;
}

interface UpdatePreview {
  id: string;
  identifier: string;
  changes: { field: string; oldValue: string; newValue: string }[];
  status: 'pending' | 'success' | 'error';
  error?: string;
}

interface BulkDataUpdateProps {
  entityType: 'case' | 'client' | 'debtor';
  onComplete?: (results: { success: number; failed: number }) => void;
}

const FIELD_OPTIONS: Record<string, { id: string; label: string }[]> = {
  case: [
    { id: 'fileNumber', label: 'Dosya No' },
    { id: 'status', label: 'Durum' },
    { id: 'riskLevel', label: 'Risk Seviyesi' },
    { id: 'statusLabel', label: 'Durum Etiketi' },
    { id: 'principalAmount', label: 'Ana Para' },
    { id: 'interestAmount', label: 'Faiz' },
    { id: 'notes', label: 'Notlar' },
  ],
  client: [
    { id: 'displayName', label: 'Ad/Unvan' },
    { id: 'phone', label: 'Telefon' },
    { id: 'email', label: 'E-posta' },
    { id: 'address', label: 'Adres' },
    { id: 'city', label: 'İl' },
  ],
  debtor: [
    { id: 'displayName', label: 'Ad/Unvan' },
    { id: 'phone', label: 'Telefon' },
    { id: 'email', label: 'E-posta' },
    { id: 'address', label: 'Adres' },
    { id: 'city', label: 'İl' },
  ],
};

const IDENTIFIER_FIELDS: Record<string, string> = {
  case: 'fileNumber',
  client: 'tckn',
  debtor: 'tckn',
};

export function BulkDataUpdate({ entityType, onComplete }: BulkDataUpdateProps) {
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'processing' | 'complete'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [sampleData, setSampleData] = useState<Record<string, string>[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [previews, setPreviews] = useState<UpdatePreview[]>([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState({ success: 0, failed: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const entityLabels: Record<string, string> = {
    case: 'Dosya',
    client: 'Müvekkil',
    debtor: 'Borçlu',
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);

    // Parse Excel/CSV (simplified - in real app use xlsx library)
    // Demo: simulate parsing
    setTimeout(() => {
      const demoColumns = ['Dosya No', 'Durum', 'Risk', 'Ana Para', 'Notlar'];
      const demoData = [
        { 'Dosya No': '2024/1234', 'Durum': 'ISLEMDE', 'Risk': 'HIGH', 'Ana Para': '150000', 'Notlar': 'Güncellendi' },
        { 'Dosya No': '2024/1235', 'Durum': 'DERDEST', 'Risk': 'MEDIUM', 'Ana Para': '85000', 'Notlar': '' },
        { 'Dosya No': '2024/1236', 'Durum': 'HITAM', 'Risk': 'LOW', 'Ana Para': '200000', 'Notlar': 'Kapatıldı' },
      ];

      setColumns(demoColumns);
      setSampleData(demoData);
      setMappings(demoColumns.map(col => ({
        sourceColumn: col,
        targetField: '',
        sampleValue: (demoData[0] as Record<string, string>)?.[col],
      })));
      setStep('mapping');
    }, 500);
  };

  const handleMappingChange = (sourceColumn: string, targetField: string) => {
    setMappings(prev => prev.map(m =>
      m.sourceColumn === sourceColumn ? { ...m, targetField } : m
    ));
  };

  const handlePreview = () => {
    // Generate preview based on mappings
    const identifierMapping = mappings.find(m => m.targetField === IDENTIFIER_FIELDS[entityType]);
    if (!identifierMapping) {
      alert(`Lütfen ${entityLabels[entityType]} tanımlayıcı alanını eşleştirin`);
      return;
    }

    const previewData: UpdatePreview[] = sampleData.map((row, i) => ({
      id: `preview-${i}`,
      identifier: row[identifierMapping.sourceColumn] || `Kayıt ${i + 1}`,
      changes: mappings
        .filter(m => m.targetField && m.targetField !== IDENTIFIER_FIELDS[entityType])
        .map(m => ({
          field: FIELD_OPTIONS[entityType].find(f => f.id === m.targetField)?.label || m.targetField,
          oldValue: '(mevcut değer)',
          newValue: row[m.sourceColumn] || '',
        }))
        .filter(c => c.newValue),
      status: 'pending',
    }));

    setPreviews(previewData);
    setStep('preview');
  };

  const handleProcess = async () => {
    setProcessing(true);
    setStep('processing');

    let success = 0;
    let failed = 0;

    // Process each row
    for (let i = 0; i < previews.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 300));

      // Simulate API call
      const isSuccess = Math.random() > 0.1;

      setPreviews(prev => prev.map((p, idx) =>
        idx === i
          ? { ...p, status: isSuccess ? 'success' : 'error', error: isSuccess ? undefined : 'Kayıt bulunamadı' }
          : p
      ));

      if (isSuccess) success++;
      else failed++;
    }

    setResults({ success, failed });
    setProcessing(false);
    setStep('complete');
    onComplete?.({ success, failed });
  };

  const handleDownloadTemplate = () => {
    // In real app, generate and download Excel template
    alert('Şablon indirme özelliği - Excel şablonu indirilecek');
  };

  const resetWizard = () => {
    setStep('upload');
    setFile(null);
    setColumns([]);
    setSampleData([]);
    setMappings([]);
    setPreviews([]);
    setResults({ success: 0, failed: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-2">
        {['upload', 'mapping', 'preview', 'complete'].map((s, i) => (
          <div key={s} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === s ? 'bg-blue-600 text-white' :
              ['upload', 'mapping', 'preview', 'processing', 'complete'].indexOf(step) > i
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-400'
            }`}>
              {['upload', 'mapping', 'preview', 'processing', 'complete'].indexOf(step) > i ? (
                <Check className="h-4 w-4" />
              ) : (
                i + 1
              )}
            </div>
            {i < 3 && <div className="w-12 h-0.5 bg-gray-200 mx-1" />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="text-center py-8">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-xl p-12 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-lg font-medium mb-2">Excel Dosyası Yükle</p>
            <p className="text-sm text-gray-500 mb-4">
              .xlsx, .xls veya .csv dosyası seçin
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); handleDownloadTemplate(); }}
              className="text-blue-600 hover:underline text-sm flex items-center gap-1 mx-auto"
            >
              <Download className="h-4 w-4" />
              Şablon İndir
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Mapping */}
      {step === 'mapping' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Alan Eşleştirme</h3>
            <span className="text-sm text-gray-500">{file?.name}</span>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left">Excel Kolonu</th>
                  <th className="px-4 py-2 text-left">Örnek Değer</th>
                  <th className="px-4 py-2 text-left">Hedef Alan</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping) => (
                  <tr key={mapping.sourceColumn} className="border-t">
                    <td className="px-4 py-2 font-medium">{mapping.sourceColumn}</td>
                    <td className="px-4 py-2 text-gray-500">{mapping.sampleValue || '-'}</td>
                    <td className="px-4 py-2">
                      <select
                        value={mapping.targetField}
                        onChange={(e) => handleMappingChange(mapping.sourceColumn, e.target.value)}
                        className="w-full border rounded px-2 py-1"
                      >
                        <option value="">-- Seçin --</option>
                        {FIELD_OPTIONS[entityType].map((field) => (
                          <option key={field.id} value={field.id}>{field.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between">
            <button onClick={resetWizard} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
              Geri
            </button>
            <button
              onClick={handlePreview}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Eye className="h-4 w-4" />
              Önizle
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Güncelleme Önizleme</h3>
            <span className="text-sm text-gray-500">{previews.length} kayıt</span>
          </div>

          <div className="border rounded-lg max-h-96 overflow-auto">
            {previews.map((preview) => (
              <div key={preview.id} className="p-3 border-b last:border-b-0">
                <p className="font-medium">{preview.identifier}</p>
                <div className="mt-2 space-y-1">
                  {preview.changes.map((change, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">{change.field}:</span>
                      <span className="text-red-500 line-through">{change.oldValue}</span>
                      <ArrowRight className="h-3 w-3 text-gray-400" />
                      <span className="text-green-600">{change.newValue}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <p className="text-sm text-orange-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Bu işlem geri alınamaz. Devam etmeden önce verileri kontrol edin.
            </p>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('mapping')} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
              Geri
            </button>
            <button
              onClick={handleProcess}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Check className="h-4 w-4" />
              Güncelle ({previews.length} kayıt)
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Processing */}
      {step === 'processing' && (
        <div className="space-y-4">
          <div className="text-center py-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600 mb-2" />
            <p className="font-medium">Güncelleniyor...</p>
          </div>

          <div className="border rounded-lg max-h-64 overflow-auto">
            {previews.map((preview) => (
              <div key={preview.id} className="flex items-center gap-3 p-2 border-b last:border-b-0">
                {preview.status === 'pending' && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                {preview.status === 'success' && <Check className="h-4 w-4 text-green-600" />}
                {preview.status === 'error' && <X className="h-4 w-4 text-red-600" />}
                <span className={preview.status === 'error' ? 'text-red-600' : ''}>{preview.identifier}</span>
                {preview.error && <span className="text-xs text-red-500 ml-auto">{preview.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 5: Complete */}
      {step === 'complete' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Güncelleme Tamamlandı</h3>
          <div className="flex items-center justify-center gap-6 mb-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{results.success}</p>
              <p className="text-sm text-gray-500">Başarılı</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{results.failed}</p>
              <p className="text-sm text-gray-500">Başarısız</p>
            </div>
          </div>
          <button
            onClick={resetWizard}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Yeni Güncelleme
          </button>
        </div>
      )}
    </div>
  );
}
