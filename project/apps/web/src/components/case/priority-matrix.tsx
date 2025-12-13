'use client';

import { useState, useEffect } from 'react';
import { Grid3X3, AlertTriangle, Clock, FileText, GripVertical } from 'lucide-react';

interface MatrixCase {
  id: string;
  fileNumber: string;
  debtorName: string;
  urgency: 'low' | 'medium' | 'high';
  importance: 'low' | 'medium' | 'high';
  amount: number;
}

interface PriorityMatrixProps {
  cases?: MatrixCase[];
  onUpdate?: (caseId: string, urgency: MatrixCase['urgency'], importance: MatrixCase['importance']) => void;
}

const STORAGE_KEY = 'priorityMatrix';

export function PriorityMatrix({ cases: initialCases, onUpdate }: PriorityMatrixProps) {
  const [cases, setCases] = useState<MatrixCase[]>([]);
  const [draggedCase, setDraggedCase] = useState<string | null>(null);

  useEffect(() => {
    if (initialCases) setCases(initialCases);
    else loadCases();
  }, [initialCases]);

  const loadCases = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setCases(JSON.parse(stored));
      else {
        const demo: MatrixCase[] = [
          { id: '1', fileNumber: '2024/1001', debtorName: 'Ahmet Y.', urgency: 'high', importance: 'high', amount: 500000 },
          { id: '2', fileNumber: '2024/1002', debtorName: 'XYZ Ltd.', urgency: 'high', importance: 'medium', amount: 150000 },
          { id: '3', fileNumber: '2024/1003', debtorName: 'Mehmet K.', urgency: 'medium', importance: 'high', amount: 320000 },
          { id: '4', fileNumber: '2024/1004', debtorName: 'ABC A.Ş.', urgency: 'low', importance: 'medium', amount: 75000 },
          { id: '5', fileNumber: '2024/1005', debtorName: 'Ali V.', urgency: 'medium', importance: 'low', amount: 45000 },
          { id: '6', fileNumber: '2024/1006', debtorName: 'DEF Ltd.', urgency: 'low', importance: 'low', amount: 25000 },
        ];
        setCases(demo);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
      }
    } catch (e) { console.error('Failed to load matrix'); }
  };

  const saveCases = (list: MatrixCase[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setCases(list);
  };

  const handleDrop = (urgency: MatrixCase['urgency'], importance: MatrixCase['importance']) => {
    if (!draggedCase) return;
    const updated = cases.map(c => c.id === draggedCase ? { ...c, urgency, importance } : c);
    saveCases(updated);
    onUpdate?.(draggedCase, urgency, importance);
    setDraggedCase(null);
  };

  const getCasesInCell = (urgency: MatrixCase['urgency'], importance: MatrixCase['importance']) => {
    return cases.filter(c => c.urgency === urgency && c.importance === importance);
  };

  const formatCurrency = (n: number) => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}K` : n.toString();

  const cellColors: Record<string, string> = {
    'high-high': 'bg-red-50 border-red-200',
    'high-medium': 'bg-orange-50 border-orange-200',
    'high-low': 'bg-yellow-50 border-yellow-200',
    'medium-high': 'bg-orange-50 border-orange-200',
    'medium-medium': 'bg-blue-50 border-blue-200',
    'medium-low': 'bg-gray-50 border-gray-200',
    'low-high': 'bg-yellow-50 border-yellow-200',
    'low-medium': 'bg-gray-50 border-gray-200',
    'low-low': 'bg-green-50 border-green-200',
  };

  const cellLabels: Record<string, { title: string; desc: string }> = {
    'high-high': { title: 'ACİL', desc: 'Hemen yapılmalı' },
    'high-medium': { title: 'ÖNCELİKLİ', desc: 'Kısa sürede' },
    'high-low': { title: 'DELEGe ET', desc: 'Başkasına ver' },
    'medium-high': { title: 'PLANLA', desc: 'Takvime al' },
    'medium-medium': { title: 'NORMAL', desc: 'Sıraya koy' },
    'medium-low': { title: 'ERTELENEBİLİR', desc: 'Bekleyebilir' },
    'low-high': { title: 'PLANLA', desc: 'İleride yap' },
    'low-medium': { title: 'DÜŞÜK', desc: 'Fırsat olursa' },
    'low-low': { title: 'ELEME', desc: 'Değerlendir' },
  };

  const levels: Array<'high' | 'medium' | 'low'> = ['high', 'medium', 'low'];
  const levelLabels = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><Grid3X3 className="h-5 w-5" />Öncelik Matrisi</h3>
        <span className="text-sm text-gray-500">{cases.length} dosya</span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Header */}
          <div className="flex items-center mb-2">
            <div className="w-24" />
            <div className="flex-1 text-center text-sm font-medium text-gray-500 flex items-center justify-center gap-1">
              <AlertTriangle className="h-4 w-4" />Önem
            </div>
          </div>
          <div className="flex items-center mb-2">
            <div className="w-24" />
            {levels.map(imp => (
              <div key={imp} className="flex-1 text-center text-xs text-gray-400">{levelLabels[imp]}</div>
            ))}
          </div>

          {/* Matrix */}
          <div className="flex">
            {/* Y-axis label */}
            <div className="w-24 flex flex-col items-center justify-center">
              <span className="text-sm font-medium text-gray-500 flex items-center gap-1 -rotate-90 whitespace-nowrap">
                <Clock className="h-4 w-4" />Aciliyet
              </span>
            </div>

            {/* Grid */}
            <div className="flex-1 grid grid-cols-3 gap-2">
              {levels.map(urg => (
                levels.map(imp => {
                  const key = `${urg}-${imp}`;
                  const cellCases = getCasesInCell(urg, imp);
                  const label = cellLabels[key];
                  return (
                    <div key={key}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(urg, imp)}
                      className={`min-h-[120px] p-2 rounded-lg border-2 ${cellColors[key]} transition-all ${draggedCase ? 'ring-2 ring-blue-300' : ''}`}>
                      <div className="text-xs font-medium text-gray-600 mb-1">{label.title}</div>
                      <div className="text-xs text-gray-400 mb-2">{label.desc}</div>
                      <div className="space-y-1">
                        {cellCases.map(c => (
                          <div key={c.id} draggable onDragStart={() => setDraggedCase(c.id)} onDragEnd={() => setDraggedCase(null)}
                            className="flex items-center gap-1 p-1.5 bg-white rounded border shadow-sm cursor-move hover:shadow-md">
                            <GripVertical className="h-3 w-3 text-gray-300" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{c.fileNumber}</p>
                              <p className="text-xs text-gray-400 truncate">{c.debtorName}</p>
                            </div>
                            <span className="text-xs text-gray-500">{formatCurrency(c.amount)}₺</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              ))}
            </div>
          </div>

          {/* Y-axis labels */}
          <div className="flex mt-2">
            <div className="w-24" />
            <div className="flex-1 grid grid-cols-3 gap-2">
              {levels.map(urg => (
                <div key={urg} className="text-center text-xs text-gray-400">{levelLabels[urg]}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
