'use client';

import { useState, useEffect } from 'react';
import { Users, FileText, Clock, AlertTriangle, CheckCircle, ArrowRight, BarChart3 } from 'lucide-react';

interface LawyerWorkload {
  id: string;
  name: string;
  activeCases: number;
  pendingTasks: number;
  completedTasks: number;
  avgResponseTime: number;
  workloadScore: number;
}

interface TaskAssignment {
  taskId: string;
  taskName: string;
  currentLawyer?: string;
  suggestedLawyer: string;
  reason: string;
}

export function LawyerTaskDistribution() {
  const [lawyers, setLawyers] = useState<LawyerWorkload[]>([]);
  const [suggestions, setSuggestions] = useState<TaskAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    // Demo data
    setLawyers([
      { id: '1', name: 'Av. Mehmet Kaya', activeCases: 45, pendingTasks: 12, completedTasks: 156, avgResponseTime: 2.5, workloadScore: 78 },
      { id: '2', name: 'Av. Ayşe Demir', activeCases: 32, pendingTasks: 8, completedTasks: 142, avgResponseTime: 1.8, workloadScore: 55 },
      { id: '3', name: 'Av. Ali Yıldız', activeCases: 28, pendingTasks: 5, completedTasks: 98, avgResponseTime: 2.1, workloadScore: 42 },
      { id: '4', name: 'Av. Zeynep Ak', activeCases: 52, pendingTasks: 18, completedTasks: 178, avgResponseTime: 3.2, workloadScore: 92 },
    ]);
    setSuggestions([
      { taskId: '1', taskName: 'Dosya 2024/1045 - Haciz Talebi', currentLawyer: 'Av. Zeynep Ak', suggestedLawyer: 'Av. Ali Yıldız', reason: 'İş yükü dengeleme' },
      { taskId: '2', taskName: 'Dosya 2024/1052 - Tebligat Takibi', suggestedLawyer: 'Av. Ayşe Demir', reason: 'Uzmanlık alanı' },
    ]);
    setLoading(false);
  };

  const getWorkloadColor = (score: number) => {
    if (score >= 80) return { bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-500' };
    if (score >= 60) return { bg: 'bg-yellow-100', text: 'text-yellow-700', bar: 'bg-yellow-500' };
    return { bg: 'bg-green-100', text: 'text-green-700', bar: 'bg-green-500' };
  };

  const applyReassignment = (taskId: string) => {
    setSuggestions(suggestions.filter(s => s.taskId !== taskId));
    alert('Görev yeniden atandı');
  };

  if (loading) return <div className="animate-pulse h-64 bg-gray-100 rounded-xl" />;

  const avgWorkload = Math.round(lawyers.reduce((s, l) => s + l.workloadScore, 0) / lawyers.length);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><Users className="h-5 w-5" />Avukat Görev Dağılımı</h3>
        <span className="text-sm text-gray-500">Ort. İş Yükü: %{avgWorkload}</span>
      </div>

      {/* Workload Overview */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {lawyers.map((lawyer) => {
          const colors = getWorkloadColor(lawyer.workloadScore);
          return (
            <div key={lawyer.id} className="bg-white border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-medium truncate">{lawyer.name}</p>
                <span className={`px-2 py-0.5 rounded text-xs ${colors.bg} ${colors.text}`}>%{lawyer.workloadScore}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div className={`h-full ${colors.bar} rounded-full`} style={{ width: `${lawyer.workloadScore}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div><p className="text-gray-500">Dosya</p><p className="font-bold">{lawyer.activeCases}</p></div>
                <div><p className="text-gray-500">Bekleyen</p><p className="font-bold text-orange-600">{lawyer.pendingTasks}</p></div>
                <div><p className="text-gray-500">Tamamlanan</p><p className="font-bold text-green-600">{lawyer.completedTasks}</p></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reassignment Suggestions */}
      {suggestions.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h4 className="font-medium text-amber-800 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />İş Yükü Dengeleme Önerileri
          </h4>
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div key={s.taskId} className="flex items-center gap-3 bg-white rounded-lg p-3">
                <FileText className="h-5 w-5 text-gray-400" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{s.taskName}</p>
                  <p className="text-xs text-gray-500">
                    {s.currentLawyer && <><span className="text-red-600">{s.currentLawyer}</span> → </>}
                    <span className="text-green-600">{s.suggestedLawyer}</span>
                    <span className="ml-2 text-gray-400">({s.reason})</span>
                  </p>
                </div>
                <button onClick={() => applyReassignment(s.taskId)} className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700">
                  Uygula
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance Comparison */}
      <div className="bg-white border rounded-xl p-4">
        <h4 className="font-medium mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4" />Performans Karşılaştırması</h4>
        <div className="space-y-3">
          {lawyers.sort((a, b) => b.completedTasks - a.completedTasks).map((l, i) => (
            <div key={l.id} className="flex items-center gap-3">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-orange-300 text-orange-800' : 'bg-gray-100 text-gray-600'}`}>{i + 1}</span>
              <span className="flex-1 text-sm">{l.name}</span>
              <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(l.completedTasks / Math.max(...lawyers.map(ll => ll.completedTasks))) * 100}%` }} />
              </div>
              <span className="text-sm font-medium w-12 text-right">{l.completedTasks}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
