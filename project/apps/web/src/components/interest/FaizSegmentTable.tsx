'use client';

import { useState } from 'react';
import { 
  Calendar, 
  Clock, 
  Percent, 
  TrendingUp,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
} from 'lucide-react';
import { Badge } from '@hukuk/ui';
import {
  InterestSegment,
  formatRate,
  formatCurrency,
} from '@/lib/api/interest-engine';

interface FaizSegmentTableProps {
  segments: InterestSegment[];
  showAll?: boolean;
  maxVisible?: number;
  className?: string;
}

/**
 * Faiz Segment Tablosu
 * Her dönem için ayrı satır gösterir - Meşe tarzı döküm
 */
export function FaizSegmentTable({
  segments,
  showAll = false,
  maxVisible = 5,
  className = '',
}: FaizSegmentTableProps) {
  const [expanded, setExpanded] = useState(showAll);

  const visibleSegments = expanded ? segments : segments.slice(0, maxVisible);
  const hasMore = segments.length > maxVisible;

  // Toplam hesapla
  const totalInterest = segments.reduce((sum, s) => sum + s.segmentInterest, 0);
  const totalDays = segments.reduce((sum, s) => sum + s.days, 0);

  // Oran değişimi var mı?
  const uniqueRates = [...new Set(segments.map(s => s.rate))];
  const hasRateChanges = uniqueRates.length > 1;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Özet Bilgi */}
      {hasRateChanges && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg text-sm">
          <Info className="w-4 h-4 text-blue-600" />
          <span className="text-blue-700">
            Dönemsel oran değişiklikleri uygulandı ({uniqueRates.length} farklı oran)
          </span>
        </div>
      )}

      {/* Segment Tablosu */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="pb-2 pr-4 font-medium text-gray-600">Dönem</th>
              <th className="pb-2 pr-4 font-medium text-gray-600 text-right">Gün</th>
              <th className="pb-2 pr-4 font-medium text-gray-600 text-right">Oran</th>
              <th className="pb-2 pr-4 font-medium text-gray-600 text-right">Anapara</th>
              <th className="pb-2 font-medium text-gray-600 text-right">Faiz</th>
            </tr>
          </thead>
          <tbody>
            {visibleSegments.map((segment, idx) => (
              <SegmentRow key={idx} segment={segment} index={idx} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 font-semibold">
              <td className="pt-3 text-gray-700">Toplam</td>
              <td className="pt-3 text-right text-gray-700">{totalDays} gün</td>
              <td className="pt-3 text-right text-gray-500">
                {hasRateChanges ? 'Değişken' : formatRate(segments[0]?.rate || 0)}
              </td>
              <td className="pt-3 text-right text-gray-700">
                {formatCurrency(segments[0]?.principal || 0)}
              </td>
              <td className="pt-3 text-right text-green-600">
                {formatCurrency(totalInterest)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Daha Fazla Göster */}
      {hasMore && !showAll && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Daha az göster
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Tümünü göster ({segments.length} dönem)
            </>
          )}
        </button>
      )}
    </div>
  );
}

// Segment Satırı
function SegmentRow({ segment, index }: { segment: InterestSegment; index: number }) {
  const startDate = new Date(segment.periodStart).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const endDate = new Date(segment.periodEnd).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const isTcmb = segment.rateSource.toLowerCase().includes('tcmb');
  
  // Phase badge renkleri
  const phaseConfig = {
    PRE_ENFORCEMENT: { label: 'Öncesi', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
    POST_ENFORCEMENT: { label: 'Sonrası', bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  };
  const phase = segment.phase ? phaseConfig[segment.phase] : null;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      {/* Dönem */}
      <td className="py-2.5 pr-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-medium text-gray-600">
            {index + 1}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1 text-gray-700">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <span>{startDate}</span>
              <span className="text-gray-400">→</span>
              <span>{endDate}</span>
            </div>
            {phase && (
              <div className="flex items-center gap-1 mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${phase.dot}`}></div>
                <span className={`text-[10px] font-medium ${phase.text}`}>
                  Takip {phase.label}
                </span>
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Gün Sayısı */}
      <td className="py-2.5 pr-4 text-right">
        <div className="flex items-center justify-end gap-1 text-gray-600">
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          <span>{segment.days}</span>
        </div>
      </td>

      {/* Oran */}
      <td className="py-2.5 pr-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <span className="font-medium text-blue-600">{formatRate(segment.rate)}</span>
          {isTcmb && (
            <a
              href="https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/Para+Politikasi/Reeskont+ve+Avans+Faiz+Oranlari"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-blue-600"
              title="TCMB Faiz Oranları"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </td>

      {/* Anapara */}
      <td className="py-2.5 pr-4 text-right text-gray-600">
        {formatCurrency(segment.principal)}
      </td>

      {/* Faiz */}
      <td className="py-2.5 text-right font-medium text-green-600">
        {formatCurrency(segment.segmentInterest)}
      </td>
    </tr>
  );
}

export default FaizSegmentTable;
