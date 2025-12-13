'use client';

import { useState, useEffect } from 'react';
import { Target, TrendingUp, Calendar, Edit, Check, X, Loader2 } from 'lucide-react';

interface CollectionTarget {
  id: string;
  period: 'monthly' | 'yearly';
  year: number;
  month?: number;
  targetAmount: number;
  collectedAmount: number;
}

interface CollectionTargetWidgetProps {
  className?: string;
}

const STORAGE_KEY = 'collectionTargets';

export function CollectionTargetWidget({ className }: CollectionTargetWidgetProps) {
  const [targets, setTargets] = useState<CollectionTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState('');

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  useEffect(() => {
    loadTargets();
  }, []);

  const loadTargets = () => {
    setLoading(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setTargets(JSON.parse(stored));
      } else {
        // Demo data
        const demo: CollectionTarget[] = [
          { id: '1', period: 'monthly', year: currentYear, month: currentMonth, targetAmount: 500000, collectedAmount: 325000 },
          { id: '2', period: 'yearly', year: currentYear, targetAmount: 6000000, collectedAmount: 3850000 },
        ];
        setTargets(demo);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
      }
    } catch (e) {
      console.error('Failed to load targets');
    } finally {
      setLoading(false);
    }
  };

  const saveTargets = (list: CollectionTarget[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setTargets(list);
  };

  const handleSaveTarget = (targetId: string) => {
    const amount = parseFloat(editAmount.replace(/[^0-9]/g, ''));
    if (isNaN(amount)) return;

    saveTargets(targets.map(t => 
      t.id === targetId ? { ...t, targetAmount: amount } : t
    ));
    setEditing(false);
    setEditAmount('');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount);
  };

  const getProgressColor = (percent: number) => {
    if (percent >= 100) return 'bg-green-500';
    if (percent >= 75) return 'bg-blue-500';
    if (percent >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const monthlyTarget = targets.find(t => t.period === 'monthly' && t.year === currentYear && t.month === currentMonth);
  const yearlyTarget = targets.find(t => t.period === 'yearly' && t.year === currentYear);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          <Target className="h-4 w-4" />
          Tahsilat Hedefi
        </h3>
      </div>

      {/* Monthly Target */}
      {monthlyTarget && (
        <TargetCard
          title="Aylık Hedef"
          subtitle={`${currentYear} - ${new Date(currentYear, currentMonth - 1).toLocaleString('tr-TR', { month: 'long' })}`}
          target={monthlyTarget}
          editing={editing}
          editAmount={editAmount}
          setEditAmount={setEditAmount}
          onEdit={() => { setEditing(true); setEditAmount(monthlyTarget.targetAmount.toString()); }}
          onSave={() => handleSaveTarget(monthlyTarget.id)}
          onCancel={() => { setEditing(false); setEditAmount(''); }}
          formatCurrency={formatCurrency}
          getProgressColor={getProgressColor}
        />
      )}

      {/* Yearly Target */}
      {yearlyTarget && (
        <TargetCard
          title="Yıllık Hedef"
          subtitle={`${currentYear}`}
          target={yearlyTarget}
          editing={false}
          editAmount=""
          setEditAmount={() => {}}
          onEdit={() => {}}
          onSave={() => {}}
          onCancel={() => {}}
          formatCurrency={formatCurrency}
          getProgressColor={getProgressColor}
          showTrend
        />
      )}
    </div>
  );
}

interface TargetCardProps {
  title: string;
  subtitle: string;
  target: CollectionTarget;
  editing: boolean;
  editAmount: string;
  setEditAmount: (v: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  formatCurrency: (n: number) => string;
  getProgressColor: (n: number) => string;
  showTrend?: boolean;
}

function TargetCard({
  title, subtitle, target, editing, editAmount, setEditAmount,
  onEdit, onSave, onCancel, formatCurrency, getProgressColor, showTrend
}: TargetCardProps) {
  const percent = target.targetAmount > 0 
    ? Math.round((target.collectedAmount / target.targetAmount) * 100) 
    : 0;
  const remaining = target.targetAmount - target.collectedAmount;

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {subtitle}
          </p>
        </div>
        {!editing && (
          <button onClick={onEdit} className="p-1 hover:bg-gray-100 rounded">
            <Edit className="h-4 w-4 text-gray-400" />
          </button>
        )}
      </div>

      {/* Target Amount */}
      <div className="mb-3">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              className="flex-1 border rounded px-2 py-1 text-sm"
              placeholder="Hedef tutar"
            />
            <button onClick={onSave} className="p-1 text-green-600 hover:bg-green-50 rounded">
              <Check className="h-4 w-4" />
            </button>
            <button onClick={onCancel} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <p className="text-2xl font-bold">{formatCurrency(target.targetAmount)}</p>
        )}
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${getProgressColor(percent)}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Tahsil: <span className="font-medium text-green-600">{formatCurrency(target.collectedAmount)}</span>
          </span>
          <span className={`font-bold ${percent >= 100 ? 'text-green-600' : ''}`}>
            %{percent}
          </span>
        </div>
        <p className="text-xs text-gray-400">
          Kalan: {formatCurrency(Math.max(remaining, 0))}
        </p>
      </div>

      {/* Trend */}
      {showTrend && (
        <div className="mt-3 pt-3 border-t flex items-center gap-2 text-sm">
          <TrendingUp className="h-4 w-4 text-green-500" />
          <span className="text-green-600">+12%</span>
          <span className="text-gray-500">geçen yıla göre</span>
        </div>
      )}
    </div>
  );
}
