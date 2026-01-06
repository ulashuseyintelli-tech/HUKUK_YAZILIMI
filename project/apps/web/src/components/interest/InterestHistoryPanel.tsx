'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  History, 
  ChevronDown, 
  ChevronUp,
  Calendar,
  FileText,
  Eye,
} from 'lucide-react';
import { Button } from '@hukuk/ui';
import { Card } from '@hukuk/ui';
import { Badge } from '@hukuk/ui';
import { Spinner } from '@hukuk/ui';
import {
  interestEngineApi,
  InterestCalculationResult,
  formatCurrency,
} from '@/lib/api/interest-engine';

interface InterestHistoryPanelProps {
  caseId: string;
  className?: string;
  onSelectCalculation?: (result: InterestCalculationResult) => void;
}

export function InterestHistoryPanel({
  caseId,
  className = '',
  onSelectCalculation,
}: InterestHistoryPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  // Fetch calculation history
  const { data: history, isLoading } = useQuery({
    queryKey: ['interest-history', caseId],
    queryFn: () => interestEngineApi.getHistory(caseId),
    enabled: !!caseId,
  });

  if (isLoading) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex items-center justify-center py-4">
          <Spinner className="w-5 h-5" />
        </div>
      </Card>
    );
  }

  if (!history || history.length === 0) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex items-center gap-2 text-gray-500">
          <History className="w-5 h-5" />
          <span className="text-sm">Henüz faiz hesaplaması yapılmamış</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`overflow-hidden ${className}`}>
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-purple-600" />
          <h3 className="font-medium text-gray-900">Hesaplama Geçmişi</h3>
          <Badge variant="secondary" className="ml-2">
            {history.length} kayıt
          </Badge>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </div>

      {isExpanded && (
        <div className="p-4">
          <div className="space-y-2">
            {history.map((calc, idx) => (
              <HistoryItem
                key={calc.auditLogId || idx}
                calculation={calc}
                isSelected={selectedLogId === calc.auditLogId}
                onSelect={() => {
                  setSelectedLogId(calc.auditLogId);
                  onSelectCalculation?.(calc);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// History Item Component
function HistoryItem({
  calculation,
  isSelected,
  onSelect,
}: {
  calculation: InterestCalculationResult;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const calculatedAt = new Date(calculation.calculatedAt).toLocaleString('tr-TR');
  const asOfDate = new Date(calculation.asOfDate).toLocaleDateString('tr-TR');
  const hasWarnings = calculation.policyWarnings.length > 0;

  return (
    <div
      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
        isSelected 
          ? 'border-blue-500 bg-blue-50' 
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Calendar className="w-3 h-3" />
            <span>{calculatedAt}</span>
          </div>
          <div className="text-xs text-gray-400">
            Hesap tarihi: {asOfDate}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasWarnings && (
            <Badge variant="warning" className="text-xs">
              {calculation.policyWarnings.length} uyarı
            </Badge>
          )}
          <div className="text-right">
            <div className="text-xs text-gray-500">Toplam Faiz</div>
            <div className="font-medium text-blue-600">
              {formatCurrency(calculation.totalInterest)}
            </div>
          </div>
        </div>
      </div>

      {/* Segment Summary */}
      <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
        <span>{calculation.segments.length} segment</span>
        <span>Toplam borç: {formatCurrency(calculation.totalDue)}</span>
      </div>
    </div>
  );
}

export default InterestHistoryPanel;
