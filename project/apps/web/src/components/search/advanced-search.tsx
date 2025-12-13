'use client';

import { useState } from 'react';
import { Search, Plus, X, Filter, Calendar, DollarSign, FileText, User, Tag } from 'lucide-react';

interface SearchCondition {
  id: string;
  field: string;
  operator: string;
  value: string;
  connector: 'AND' | 'OR';
}

const FIELDS = [
  { id: 'fileNumber', label: 'Dosya No', type: 'text' },
  { id: 'debtorName', label: 'Borçlu Adı', type: 'text' },
  { id: 'clientName', label: 'Müvekkil Adı', type: 'text' },
  { id: 'principalAmount', label: 'Ana Para', type: 'number' },
  { id: 'status', label: 'Durum', type: 'select', options: ['DERDEST', 'ISLEMDE', 'HITAM', 'BEKLEMEDE'] },
  { id: 'caseType', label: 'Takip Türü', type: 'select', options: ['ILAMSIZ', 'ILAMLI', 'KAMBIYO'] },
  { id: 'riskLevel', label: 'Risk', type: 'select', options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
  { id: 'createdAt', label: 'Oluşturma Tarihi', type: 'date' },
  { id: 'tags', label: 'Etiket', type: 'text' },
];

const OPERATORS: Record<string, { id: string; label: string }[]> = {
  text: [{ id: 'contains', label: 'İçerir' }, { id: 'equals', label: 'Eşittir' }, { id: 'startsWith', label: 'İle Başlar' }, { id: 'notContains', label: 'İçermez' }],
  number: [{ id: 'equals', label: '=' }, { id: 'gt', label: '>' }, { id: 'gte', label: '>=' }, { id: 'lt', label: '<' }, { id: 'lte', label: '<=' }, { id: 'between', label: 'Arasında' }],
  date: [{ id: 'equals', label: 'Tarihinde' }, { id: 'before', label: 'Önce' }, { id: 'after', label: 'Sonra' }, { id: 'between', label: 'Arasında' }],
  select: [{ id: 'equals', label: 'Eşittir' }, { id: 'notEquals', label: 'Eşit Değil' }],
};

export function AdvancedSearch() {
  const [conditions, setConditions] = useState<SearchCondition[]>([
    { id: '1', field: 'debtorName', operator: 'contains', value: '', connector: 'AND' }
  ]);
  const [results, setResults] = useState<number | null>(null);

  const addCondition = () => {
    setConditions([...conditions, { id: Date.now().toString(), field: 'debtorName', operator: 'contains', value: '', connector: 'AND' }]);
  };

  const removeCondition = (id: string) => {
    if (conditions.length > 1) setConditions(conditions.filter(c => c.id !== id));
  };

  const updateCondition = (id: string, updates: Partial<SearchCondition>) => {
    setConditions(conditions.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const getFieldType = (fieldId: string) => FIELDS.find(f => f.id === fieldId)?.type || 'text';
  const getFieldOptions = (fieldId: string) => FIELDS.find(f => f.id === fieldId)?.options || [];

  const handleSearch = () => {
    // Demo: simulate search
    const validConditions = conditions.filter(c => c.value);
    if (validConditions.length === 0) { setResults(null); return; }
    setResults(Math.floor(Math.random() * 100) + 1);
  };

  const buildQueryString = () => {
    return conditions
      .filter(c => c.value)
      .map((c, i) => {
        const field = FIELDS.find(f => f.id === c.field)?.label || c.field;
        const op = OPERATORS[getFieldType(c.field)]?.find(o => o.id === c.operator)?.label || c.operator;
        const prefix = i > 0 ? ` ${c.connector} ` : '';
        return `${prefix}${field} ${op} "${c.value}"`;
      })
      .join('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><Filter className="h-5 w-5" />Gelişmiş Arama</h3>
        <button onClick={addCondition} className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">
          <Plus className="h-4 w-4" />Koşul Ekle
        </button>
      </div>

      {/* Conditions */}
      <div className="space-y-3">
        {conditions.map((cond, i) => {
          const fieldType = getFieldType(cond.field);
          const operators = OPERATORS[fieldType] || OPERATORS.text;
          const options = getFieldOptions(cond.field);

          return (
            <div key={cond.id} className="flex items-center gap-2 flex-wrap">
              {i > 0 && (
                <select value={cond.connector} onChange={(e) => updateCondition(cond.id, { connector: e.target.value as 'AND' | 'OR' })} className="border rounded-lg px-2 py-1.5 text-sm font-medium bg-blue-50 text-blue-700">
                  <option value="AND">VE</option>
                  <option value="OR">VEYA</option>
                </select>
              )}
              <select value={cond.field} onChange={(e) => updateCondition(cond.id, { field: e.target.value, operator: OPERATORS[getFieldType(e.target.value)]?.[0]?.id || 'contains' })} className="border rounded-lg px-3 py-1.5 text-sm">
                {FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              <select value={cond.operator} onChange={(e) => updateCondition(cond.id, { operator: e.target.value })} className="border rounded-lg px-3 py-1.5 text-sm">
                {operators.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              {fieldType === 'select' ? (
                <select value={cond.value} onChange={(e) => updateCondition(cond.id, { value: e.target.value })} className="border rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[150px]">
                  <option value="">Seçin...</option>
                  {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : fieldType === 'date' ? (
                <input type="date" value={cond.value} onChange={(e) => updateCondition(cond.id, { value: e.target.value })} className="border rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[150px]" />
              ) : (
                <input type={fieldType === 'number' ? 'number' : 'text'} value={cond.value} onChange={(e) => updateCondition(cond.id, { value: e.target.value })} placeholder="Değer girin..." className="border rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[150px]" />
              )}
              {conditions.length > 1 && (
                <button onClick={() => removeCondition(cond.id)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Query Preview */}
      {conditions.some(c => c.value) && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Sorgu:</p>
          <p className="text-sm font-mono">{buildQueryString()}</p>
        </div>
      )}

      {/* Search Button */}
      <div className="flex items-center gap-3">
        <button onClick={handleSearch} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Search className="h-4 w-4" />Ara
        </button>
        <button onClick={() => setConditions([{ id: '1', field: 'debtorName', operator: 'contains', value: '', connector: 'AND' }])} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
          Temizle
        </button>
        {results !== null && (
          <span className="text-sm text-gray-600">{results} sonuç bulundu</span>
        )}
      </div>

      {/* Quick Filters */}
      <div className="border-t pt-4">
        <p className="text-sm text-gray-500 mb-2">Hızlı Filtreler:</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Yüksek Riskli', conditions: [{ field: 'riskLevel', operator: 'equals', value: 'HIGH' }] },
            { label: 'Bu Ay Açılan', conditions: [{ field: 'createdAt', operator: 'after', value: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0] }] },
            { label: '100K+ Alacak', conditions: [{ field: 'principalAmount', operator: 'gte', value: '100000' }] },
            { label: 'Aktif Dosyalar', conditions: [{ field: 'status', operator: 'equals', value: 'DERDEST' }] },
          ].map((qf, i) => (
            <button key={i} onClick={() => setConditions(qf.conditions.map((c, j) => ({ ...c, id: j.toString(), connector: 'AND' as const })))} className="px-3 py-1.5 bg-gray-100 rounded-full text-sm hover:bg-gray-200">
              {qf.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
