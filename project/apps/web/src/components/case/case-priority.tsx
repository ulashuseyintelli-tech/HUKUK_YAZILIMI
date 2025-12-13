'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Flag, ChevronDown, Loader2 } from 'lucide-react';

interface CasePriorityProps {
  caseId: string;
  currentPriority?: string;
  onUpdate?: (priority: string) => void;
  size?: 'sm' | 'md';
}

const PRIORITIES = [
  { id: 'urgent', name: 'Acil', color: '#ef4444', bgColor: 'bg-red-100', textColor: 'text-red-700', borderColor: 'border-red-300' },
  { id: 'high', name: 'Yüksek', color: '#f97316', bgColor: 'bg-orange-100', textColor: 'text-orange-700', borderColor: 'border-orange-300' },
  { id: 'normal', name: 'Normal', color: '#3b82f6', bgColor: 'bg-blue-100', textColor: 'text-blue-700', borderColor: 'border-blue-300' },
  { id: 'low', name: 'Düşük', color: '#6b7280', bgColor: 'bg-gray-100', textColor: 'text-gray-700', borderColor: 'border-gray-300' },
];

export function CasePriority({ caseId, currentPriority = 'normal', onUpdate, size = 'md' }: CasePriorityProps) {
  const [priority, setPriority] = useState(currentPriority);
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentPriorityInfo = PRIORITIES.find(p => p.id === priority) || PRIORITIES[2];

  const handleSelect = async (newPriority: string) => {
    if (newPriority === priority) {
      setIsOpen(false);
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/cases/${caseId}`, { priority: newPriority });
      setPriority(newPriority);
      onUpdate?.(newPriority);
    } catch (e) {
      // Demo: update locally
      setPriority(newPriority);
      onUpdate?.(newPriority);
    } finally {
      setSaving(false);
      setIsOpen(false);
    }
  };

  const sizeClasses = size === 'sm' 
    ? 'px-2 py-1 text-xs gap-1' 
    : 'px-3 py-1.5 text-sm gap-2';

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={saving}
        className={`flex items-center ${sizeClasses} rounded-lg border ${currentPriorityInfo.bgColor} ${currentPriorityInfo.textColor} ${currentPriorityInfo.borderColor} hover:opacity-80 transition-opacity`}
      >
        {saving ? (
          <Loader2 className={`${size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} animate-spin`} />
        ) : (
          <Flag className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} style={{ color: currentPriorityInfo.color }} />
        )}
        <span className="font-medium">{currentPriorityInfo.name}</span>
        <ChevronDown className={`${size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} opacity-50`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-20 min-w-[140px]">
            {PRIORITIES.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelect(p.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                  p.id === priority ? 'bg-gray-50' : ''
                }`}
              >
                <Flag className="h-4 w-4" style={{ color: p.color }} />
                <span className={p.textColor}>{p.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Priority Badge (read-only)
export function PriorityBadge({ priority, size = 'md' }: { priority: string; size?: 'sm' | 'md' }) {
  const priorityInfo = PRIORITIES.find(p => p.id === priority) || PRIORITIES[2];
  
  const sizeClasses = size === 'sm' 
    ? 'px-1.5 py-0.5 text-xs gap-1' 
    : 'px-2 py-1 text-sm gap-1.5';

  return (
    <span className={`inline-flex items-center ${sizeClasses} rounded ${priorityInfo.bgColor} ${priorityInfo.textColor}`}>
      <Flag className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} style={{ color: priorityInfo.color }} />
      {priorityInfo.name}
    </span>
  );
}

// Priority Filter
interface PriorityFilterProps {
  value: string;
  onChange: (value: string) => void;
}

export function PriorityFilter({ value, onChange }: PriorityFilterProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border rounded-lg px-3 py-2 text-sm"
    >
      <option value="">Tüm Öncelikler</option>
      {PRIORITIES.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}

// Export priorities for use elsewhere
export { PRIORITIES };
