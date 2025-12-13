'use client';

import { useState } from 'react';
import { FileText, User, DollarSign, Calendar, Eye, Star, MoreHorizontal } from 'lucide-react';

interface CaseMiniCardProps {
  caseId: string;
  fileNumber: string;
  debtorName: string;
  clientName: string;
  principalAmount: number;
  status: string;
  riskLevel?: string;
  caseDate: string;
  onFavorite?: () => void;
  isFavorite?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  DERDEST: 'bg-blue-100 text-blue-700',
  ISLEMDE: 'bg-yellow-100 text-yellow-700',
  HITAM: 'bg-green-100 text-green-700',
  DERKENAR: 'bg-gray-100 text-gray-700',
  BEKLEMEDE: 'bg-orange-100 text-orange-700',
};

const RISK_COLORS: Record<string, string> = {
  LOW: 'text-green-600',
  MEDIUM: 'text-yellow-600',
  HIGH: 'text-orange-600',
  CRITICAL: 'text-red-600',
};

export function CaseMiniCard({
  caseId,
  fileNumber,
  debtorName,
  clientName,
  principalAmount,
  status,
  riskLevel,
  caseDate,
  onFavorite,
  isFavorite = false,
}: CaseMiniCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('tr-TR');
  };

  return (
    <div
      className="relative p-3 border rounded-lg hover:shadow-md transition-shadow bg-white"
      onMouseEnter={() => setShowDetails(true)}
      onMouseLeave={() => { setShowDetails(false); setShowActions(false); }}
    >
      {/* Main Content */}
      <div className="flex items-start gap-3">
        <div className="p-2 bg-gray-100 rounded-lg">
          <FileText className="h-5 w-5 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <a
              href={`/cases/${caseId}`}
              className="font-medium text-blue-600 hover:underline truncate"
            >
              {fileNumber}
            </a>
            <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[status] || STATUS_COLORS.DERDEST}`}>
              {status}
            </span>
          </div>
          <p className="text-sm text-gray-600 truncate">{debtorName}</p>
          <p className="text-xs text-gray-400 truncate">{clientName}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-sm">{formatCurrency(principalAmount)}</p>
          {riskLevel && (
            <p className={`text-xs ${RISK_COLORS[riskLevel] || ''}`}>
              {riskLevel === 'LOW' ? 'Düşük' : riskLevel === 'MEDIUM' ? 'Orta' : riskLevel === 'HIGH' ? 'Yüksek' : 'Kritik'}
            </p>
          )}
        </div>
      </div>

      {/* Hover Details */}
      {showDetails && (
        <div className="absolute left-0 right-0 top-full mt-1 p-3 bg-white border rounded-lg shadow-lg z-10">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-1 text-gray-500">
              <User className="h-3.5 w-3.5" />
              <span className="truncate">{debtorName}</span>
            </div>
            <div className="flex items-center gap-1 text-gray-500">
              <Calendar className="h-3.5 w-3.5" />
              <span>{formatDate(caseDate)}</span>
            </div>
            <div className="flex items-center gap-1 text-gray-500">
              <DollarSign className="h-3.5 w-3.5" />
              <span>{formatCurrency(principalAmount)}</span>
            </div>
            <div className="flex items-center gap-1 text-gray-500">
              <FileText className="h-3.5 w-3.5" />
              <span>{clientName}</span>
            </div>
          </div>
          
          {/* Quick Actions */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t">
            <a
              href={`/cases/${caseId}`}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
            >
              <Eye className="h-3.5 w-3.5" />
              Görüntüle
            </a>
            <button
              onClick={onFavorite}
              className={`p-1.5 rounded border ${isFavorite ? 'text-yellow-500 border-yellow-300' : 'text-gray-400 hover:text-yellow-500'}`}
            >
              <Star className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
            </button>
            <button
              onClick={() => setShowActions(!showActions)}
              className="p-1.5 rounded border text-gray-400 hover:text-gray-600"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Grid component for multiple mini cards
interface CaseMiniGridProps {
  cases: Array<{
    id: string;
    fileNumber: string;
    debtorName: string;
    clientName: string;
    principalAmount: number;
    status: string;
    riskLevel?: string;
    caseDate: string;
  }>;
  columns?: 2 | 3 | 4;
}

export function CaseMiniGrid({ cases, columns = 3 }: CaseMiniGridProps) {
  const gridCols = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  };

  return (
    <div className={`grid ${gridCols[columns]} gap-3`}>
      {cases.map((c) => (
        <CaseMiniCard
          key={c.id}
          caseId={c.id}
          fileNumber={c.fileNumber}
          debtorName={c.debtorName}
          clientName={c.clientName}
          principalAmount={c.principalAmount}
          status={c.status}
          riskLevel={c.riskLevel}
          caseDate={c.caseDate}
        />
      ))}
    </div>
  );
}
