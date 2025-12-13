'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, Circle, Clock, ArrowRight, Calendar, AlertTriangle } from 'lucide-react';

interface CaseStage {
  id: string;
  name: string;
  status: 'completed' | 'current' | 'pending';
  startDate?: string;
  endDate?: string;
  expectedDays?: number;
  actualDays?: number;
}

interface CaseStagesProps {
  caseId: string;
  stages?: CaseStage[];
}

const DEFAULT_STAGES: CaseStage[] = [
  { id: '1', name: 'Dosya Açılışı', status: 'completed', expectedDays: 1 },
  { id: '2', name: 'Ödeme Emri', status: 'completed', expectedDays: 7 },
  { id: '3', name: 'Tebligat', status: 'completed', expectedDays: 30 },
  { id: '4', name: 'Haciz Talebi', status: 'current', expectedDays: 14 },
  { id: '5', name: 'Haciz İşlemi', status: 'pending', expectedDays: 30 },
  { id: '6', name: 'Satış', status: 'pending', expectedDays: 60 },
  { id: '7', name: 'Tahsilat', status: 'pending', expectedDays: 30 },
];

export function CaseStages({ caseId, stages: initialStages }: CaseStagesProps) {
  const [stages, setStages] = useState<CaseStage[]>(initialStages || DEFAULT_STAGES);
  const [view, setView] = useState<'timeline' | 'list'>('timeline');

  useEffect(() => {
    // Demo: Add dates
    const now = new Date();
    const updated = stages.map((s, i) => {
      if (s.status === 'completed') {
        const start = new Date(now.getTime() - (stages.length - i) * 15 * 24 * 60 * 60 * 1000);
        const end = new Date(start.getTime() + (s.expectedDays || 7) * 24 * 60 * 60 * 1000);
        return { ...s, startDate: start.toISOString(), endDate: end.toISOString(), actualDays: Math.floor((end.getTime() - start.getTime()) / (24*60*60*1000)) };
      }
      if (s.status === 'current') {
        return { ...s, startDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(), actualDays: 5 };
      }
      return s;
    });
    setStages(updated);
  }, []);

  const completedCount = stages.filter(s => s.status === 'completed').length;
  const progress = Math.round((completedCount / stages.length) * 100);

  const formatDate = (date?: string) => date ? new Date(date).toLocaleDateString('tr-TR') : '-';

  const getStatusIcon = (status: CaseStage['status']) => {
    if (status === 'completed') return <CheckCircle className="h-5 w-5 text-green-500" />;
    if (status === 'current') return <Clock className="h-5 w-5 text-blue-500 animate-pulse" />;
    return <Circle className="h-5 w-5 text-gray-300" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Dosya Aşamaları</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">%{progress} tamamlandı</span>
          <div className="flex border rounded-lg overflow-hidden">
            <button onClick={() => setView('timeline')} className={`px-3 py-1 text-sm ${view === 'timeline' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>Timeline</button>
            <button onClick={() => setView('list')} className={`px-3 py-1 text-sm ${view === 'list' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>Liste</button>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
      </div>

      {view === 'timeline' ? (
        <div className="flex items-center gap-2 overflow-x-auto py-4">
          {stages.map((stage, i) => (
            <div key={stage.id} className="flex items-center">
              <div className={`flex flex-col items-center min-w-[100px] ${stage.status === 'current' ? 'scale-110' : ''}`}>
                <div className={`p-2 rounded-full ${stage.status === 'completed' ? 'bg-green-100' : stage.status === 'current' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                  {getStatusIcon(stage.status)}
                </div>
                <p className={`text-xs mt-1 text-center ${stage.status === 'current' ? 'font-medium text-blue-600' : 'text-gray-600'}`}>{stage.name}</p>
                {stage.actualDays !== undefined && (
                  <p className={`text-xs ${stage.actualDays > (stage.expectedDays || 0) ? 'text-red-500' : 'text-gray-400'}`}>
                    {stage.actualDays} gün
                  </p>
                )}
              </div>
              {i < stages.length - 1 && <ArrowRight className="h-4 w-4 text-gray-300 mx-1" />}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {stages.map((stage) => (
            <div key={stage.id} className={`flex items-center gap-3 p-3 rounded-lg border ${stage.status === 'current' ? 'border-blue-300 bg-blue-50' : ''}`}>
              {getStatusIcon(stage.status)}
              <div className="flex-1">
                <p className={`font-medium ${stage.status === 'pending' ? 'text-gray-400' : ''}`}>{stage.name}</p>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  {stage.startDate && <span><Calendar className="h-3 w-3 inline mr-1" />{formatDate(stage.startDate)}</span>}
                  {stage.expectedDays && <span>Beklenen: {stage.expectedDays} gün</span>}
                </div>
              </div>
              {stage.actualDays !== undefined && stage.expectedDays && stage.actualDays > stage.expectedDays && (
                <div className="flex items-center gap-1 text-red-500 text-xs">
                  <AlertTriangle className="h-3 w-3" />
                  +{stage.actualDays - stage.expectedDays} gün
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
