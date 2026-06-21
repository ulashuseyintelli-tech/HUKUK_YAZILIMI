'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { FileText, Plus, Trash2, Download, Save, Play, X, GripVertical, Settings } from 'lucide-react';

interface ReportColumn {
  id: string;
  field: string;
  label: string;
  enabled: boolean;
}

interface SavedReport {
  id: string;
  name: string;
  columns: string[];
  filters: Record<string, string>;
  createdAt: string;
}

const AVAILABLE_COLUMNS: ReportColumn[] = [
  { id: '1', field: 'fileNumber', label: 'Dosya No', enabled: true },
  { id: '2', field: 'clientName', label: 'Müvekkil', enabled: true },
  { id: '3', field: 'debtorName', label: 'Borçlu', enabled: true },
  { id: '4', field: 'principalAmount', label: 'Ana Para', enabled: true },
  { id: '5', field: 'totalAmount', label: 'Toplam Alacak', enabled: false },
  { id: '6', field: 'collectedAmount', label: 'Tahsilat', enabled: false },
  { id: '7', field: 'caseStatus', label: 'Statü', enabled: true },
  { id: '8', field: 'risk', label: 'Risk', enabled: false },
  { id: '9', field: 'durumEtiketi', label: 'Durum Etiketi', enabled: false },
  { id: '10', field: 'takipTuru', label: 'Takip Türü', enabled: false },
  { id: '11', field: 'mahiyetTipi', label: 'Mahiyet', enabled: false },
  { id: '12', field: 'sorumlu', label: 'Dosya Sorumlusu', enabled: false },
  { id: '13', field: 'caseDate', label: 'Takip Tarihi', enabled: false },
  { id: '14', field: 'createdAt', label: 'Oluşturma Tarihi', enabled: false },
  { id: '15', field: 'lastActionDate', label: 'Son İşlem', enabled: false },
  { id: '16', field: 'daysOpen', label: 'Açık Gün', enabled: false },
  { id: '17', field: 'interestRate', label: 'Faiz Oranı', enabled: false },
  { id: '18', field: 'lawyerName', label: 'Avukat', enabled: false },
];

export function CustomReportBuilder() {
  const [columns, setColumns] = useState<ReportColumn[]>(AVAILABLE_COLUMNS);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [reportName, setReportName] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    status: '',
    minAmount: '',
    maxAmount: '',
  });

  // Load saved reports from localStorage
  useState(() => {
    const saved = localStorage.getItem('customReports');
    if (saved) {
      setSavedReports(JSON.parse(saved));
    }
  });

  const toggleColumn = (id: string) => {
    setColumns(prev => prev.map(col => 
      col.id === id ? { ...col, enabled: !col.enabled } : col
    ));
  };

  const enabledColumns = columns.filter(c => c.enabled);

  const generateReport = async () => {
    setGenerating(true);
    try {
      const params = new URLSearchParams();
      params.append('columns', enabledColumns.map(c => c.field).join(','));
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      if (filters.status) params.append('status', filters.status);
      if (filters.minAmount) params.append('minAmount', filters.minAmount);
      if (filters.maxAmount) params.append('maxAmount', filters.maxAmount);

      const res = await api.get(`/reports/custom?${params.toString()}`);
      setPreviewData(res.data?.data || []);
    } catch (e) {
      // Demo data
      setPreviewData([
        { fileNumber: '2024/001', clientName: 'ABC Ltd.', debtorName: 'Mehmet Y.', principalAmount: 50000, caseStatus: 'DERDEST' },
        { fileNumber: '2024/002', clientName: 'XYZ A.Ş.', debtorName: 'Ahmet K.', principalAmount: 125000, caseStatus: 'HACIZ' },
        { fileNumber: '2024/003', clientName: 'ABC Ltd.', debtorName: 'Fatma D.', principalAmount: 75000, caseStatus: 'DERDEST' },
      ]);
    } finally {
      setGenerating(false);
    }
  };

  const saveReport = () => {
    if (!reportName.trim()) return;

    const newReport: SavedReport = {
      id: Date.now().toString(),
      name: reportName,
      columns: enabledColumns.map(c => c.field),
      filters,
      createdAt: new Date().toISOString(),
    };

    const updated = [...savedReports, newReport];
    setSavedReports(updated);
    localStorage.setItem('customReports', JSON.stringify(updated));
    setReportName('');
    setShowSaveModal(false);
  };

  const loadReport = (report: SavedReport) => {
    setColumns(prev => prev.map(col => ({
      ...col,
      enabled: report.columns.includes(col.field),
    })));
    setFilters(report.filters as any);
  };

  const deleteReport = (id: string) => {
    const updated = savedReports.filter(r => r.id !== id);
    setSavedReports(updated);
    localStorage.setItem('customReports', JSON.stringify(updated));
  };

  const exportToExcel = async () => {
    try {
      const params = new URLSearchParams();
      params.append('columns', enabledColumns.map(c => c.field).join(','));
      params.append('format', 'excel');
      
      const res = await api.get(`/reports/custom/export?${params.toString()}`, {
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `rapor_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      console.error('Export hatası:', e);
    }
  };

  const formatValue = (field: string, value: any) => {
    if (value === null || value === undefined) return '-';
    if (field.includes('Amount') || field.includes('amount')) {
      return `${Number(value).toLocaleString('tr-TR')} ₺`;
    }
    if (field.includes('Date') || field.includes('date') || field.includes('At')) {
      return new Date(value).toLocaleDateString('tr-TR');
    }
    return value;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Sol Panel - Kolon Seçimi */}
        <div className="lg:col-span-1 space-y-4">
          {/* Kayıtlı Raporlar */}
          {savedReports.length > 0 && (
            <div className="bg-white rounded-xl border p-4">
              <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                <Save className="h-4 w-4 text-blue-600" />
                Kayıtlı Raporlar
              </h4>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {savedReports.map((report) => (
                  <div key={report.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                    <button
                      onClick={() => loadReport(report)}
                      className="text-blue-600 hover:underline truncate flex-1 text-left"
                    >
                      {report.name}
                    </button>
                    <button
                      onClick={() => deleteReport(report.id)}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Kolon Seçimi */}
          <div className="bg-white rounded-xl border p-4">
            <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
              <Settings className="h-4 w-4 text-gray-600" />
              Kolonlar ({enabledColumns.length} seçili)
            </h4>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {columns.map((col) => (
                <label
                  key={col.id}
                  className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={col.enabled}
                    onChange={() => toggleColumn(col.id)}
                    className="rounded"
                  />
                  <span className="text-sm">{col.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Filtreler */}
          <div className="bg-white rounded-xl border p-4">
            <h4 className="font-medium text-sm mb-3">Filtreler</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tarih Aralığı</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                    className="flex-1 border rounded px-2 py-1 text-sm"
                  />
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                    className="flex-1 border rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Statü</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  className="w-full border rounded px-2 py-1 text-sm"
                >
                  <option value="">Tümü</option>
                  <option value="DERDEST">Derdest</option>
                  <option value="HACIZ">Haciz</option>
                  <option value="SATIS">Satış</option>
                  <option value="HITAM">Hitam</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tutar Aralığı</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={filters.minAmount}
                    onChange={(e) => setFilters({ ...filters, minAmount: e.target.value })}
                    className="flex-1 border rounded px-2 py-1 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={filters.maxAmount}
                    onChange={(e) => setFilters({ ...filters, maxAmount: e.target.value })}
                    className="flex-1 border rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sağ Panel - Önizleme */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-600" />
                Rapor Önizleme
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={generateReport}
                  disabled={generating || enabledColumns.length === 0}
                  className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Play className="h-4 w-4" />
                  {generating ? 'Oluşturuluyor...' : 'Rapor Oluştur'}
                </button>
                <button
                  onClick={() => setShowSaveModal(true)}
                  disabled={enabledColumns.length === 0}
                  className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  Kaydet
                </button>
                {previewData.length > 0 && (
                  <button
                    onClick={exportToExcel}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                  >
                    <Download className="h-4 w-4" />
                    Excel
                  </button>
                )}
              </div>
            </div>

            {previewData.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>Rapor oluşturmak için kolonları seçin ve "Rapor Oluştur" butonuna tıklayın</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {enabledColumns.map((col) => (
                        <th key={col.id} className="text-left px-4 py-3 text-sm font-medium whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {previewData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        {enabledColumns.map((col) => (
                          <td key={col.id} className="px-4 py-3 text-sm whitespace-nowrap">
                            {formatValue(col.field, row[col.field])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {previewData.length > 0 && (
              <div className="p-3 border-t bg-gray-50 text-sm text-gray-500">
                {previewData.length} kayıt listeleniyor
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-sm mx-4 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Raporu Kaydet</h3>
              <button onClick={() => setShowSaveModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              type="text"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="Rapor adı"
              className="w-full border rounded-lg px-3 py-2 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={saveReport}
                disabled={!reportName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
