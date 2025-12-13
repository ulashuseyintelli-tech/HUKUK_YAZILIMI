'use client';

import { useState } from 'react';
import { Users, FileText, Check, X, Search, UserPlus, Loader2 } from 'lucide-react';

interface CaseItem {
  id: string;
  fileNumber: string;
  debtorName: string;
  currentLawyer?: string;
  currentStaff?: string;
}

interface AssigneeOption {
  id: string;
  name: string;
  type: 'lawyer' | 'staff';
  activeCases: number;
}

interface BulkCaseAssignmentProps {
  cases: CaseItem[];
  onAssign?: (caseIds: string[], assigneeId: string, assigneeType: 'lawyer' | 'staff') => Promise<void>;
  onClose?: () => void;
}

export function BulkCaseAssignment({ cases, onAssign, onClose }: BulkCaseAssignmentProps) {
  const [selectedCases, setSelectedCases] = useState<string[]>(cases.map(c => c.id));
  const [assigneeType, setAssigneeType] = useState<'lawyer' | 'staff'>('lawyer');
  const [selectedAssignee, setSelectedAssignee] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // Demo assignees
  const assignees: AssigneeOption[] = [
    { id: '1', name: 'Av. Mehmet Kaya', type: 'lawyer', activeCases: 45 },
    { id: '2', name: 'Av. Ayşe Demir', type: 'lawyer', activeCases: 32 },
    { id: '3', name: 'Av. Ali Yıldız', type: 'lawyer', activeCases: 28 },
    { id: '4', name: 'Stj. Zeynep Ak', type: 'staff', activeCases: 15 },
    { id: '5', name: 'Sekreter Fatma', type: 'staff', activeCases: 0 },
  ];

  const filteredAssignees = assignees
    .filter(a => a.type === assigneeType)
    .filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

  const toggleCase = (id: string) => {
    setSelectedCases(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    setSelectedCases(selectedCases.length === cases.length ? [] : cases.map(c => c.id));
  };

  const handleAssign = async () => {
    if (!selectedAssignee || selectedCases.length === 0) return;
    setLoading(true);
    try {
      await onAssign?.(selectedCases, selectedAssignee, assigneeType);
      alert(`${selectedCases.length} dosya başarıyla atandı`);
      onClose?.();
    } catch (e) {
      alert('Atama başarısız');
    } finally {
      setLoading(false);
    }
  };

  const selectedAssigneeName = assignees.find(a => a.id === selectedAssignee)?.name;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><UserPlus className="h-5 w-5" />Toplu Dosya Atama</h3>
        {onClose && <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="h-5 w-5" /></button>}
      </div>

      {/* Assignee Type */}
      <div className="flex gap-2">
        <button onClick={() => setAssigneeType('lawyer')} className={`flex-1 py-2 rounded-lg text-sm ${assigneeType === 'lawyer' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
          Avukat
        </button>
        <button onClick={() => setAssigneeType('staff')} className={`flex-1 py-2 rounded-lg text-sm ${assigneeType === 'staff' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
          Personel
        </button>
      </div>

      {/* Assignee Selection */}
      <div className="bg-white border rounded-xl p-4">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ara..." className="w-full pl-10 pr-4 py-2 border rounded-lg" />
        </div>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {filteredAssignees.map((a) => (
            <button key={a.id} onClick={() => setSelectedAssignee(a.id)}
              className={`w-full flex items-center justify-between p-3 rounded-lg border ${selectedAssignee === a.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-400" />
                <span className="font-medium">{a.name}</span>
              </div>
              <span className="text-sm text-gray-500">{a.activeCases} dosya</span>
            </button>
          ))}
        </div>
      </div>

      {/* Case Selection */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b bg-gray-50">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={selectedCases.length === cases.length} onChange={toggleAll} className="w-4 h-4 rounded" />
            <span className="text-sm font-medium">Tümünü Seç ({selectedCases.length}/{cases.length})</span>
          </label>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {cases.map((c) => (
            <label key={c.id} className="flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={selectedCases.includes(c.id)} onChange={() => toggleCase(c.id)} className="w-4 h-4 rounded" />
              <FileText className="h-4 w-4 text-gray-400" />
              <div className="flex-1">
                <p className="font-medium text-sm">{c.fileNumber}</p>
                <p className="text-xs text-gray-500">{c.debtorName}</p>
              </div>
              {c.currentLawyer && <span className="text-xs text-gray-400">{c.currentLawyer}</span>}
            </label>
          ))}
        </div>
      </div>

      {/* Summary & Action */}
      <div className="bg-blue-50 rounded-lg p-3">
        <p className="text-sm text-blue-800">
          <strong>{selectedCases.length}</strong> dosya 
          {selectedAssigneeName && <> → <strong>{selectedAssigneeName}</strong></>} atanacak
        </p>
      </div>

      <button onClick={handleAssign} disabled={loading || !selectedAssignee || selectedCases.length === 0}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Ata
      </button>
    </div>
  );
}
