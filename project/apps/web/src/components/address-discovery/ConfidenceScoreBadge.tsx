'use client';

import { useState } from 'react';
import { 
  Shield, 
  ShieldCheck, 
  ShieldAlert,
  ShieldQuestion,
} from 'lucide-react';

interface ConfidenceScoreBadgeProps {
  score: number | null | undefined;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

function getScoreConfig(score: number) {
  if (score >= 80) {
    return {
      label: 'Yüksek',
      color: 'bg-green-100 text-green-700 border-green-200',
      icon: ShieldCheck,
      description: 'Bu adres yüksek güvenilirliğe sahip',
    };
  }
  if (score >= 60) {
    return {
      label: 'Orta',
      color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      icon: Shield,
      description: 'Bu adres orta güvenilirliğe sahip',
    };
  }
  if (score >= 40) {
    return {
      label: 'Düşük',
      color: 'bg-orange-100 text-orange-700 border-orange-200',
      icon: ShieldAlert,
      description: 'Bu adres düşük güvenilirliğe sahip',
    };
  }
  return {
    label: 'Çok Düşük',
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: ShieldQuestion,
    description: 'Bu adres çok düşük güvenilirliğe sahip',
  };
}

export function ConfidenceScoreBadge({ 
  score, 
  showLabel = false,
  size = 'sm' 
}: ConfidenceScoreBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (score === null || score === undefined) {
    return null;
  }

  const config = getScoreConfig(score);
  const Icon = config.icon;
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  const badgeSize = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1';

  return (
    <div className="relative inline-block">
      <span 
        className={`inline-flex items-center gap-1 rounded border cursor-help ${config.color} ${badgeSize}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={config.description}
      >
        <Icon className={iconSize} />
        <span className="font-medium">{score}</span>
        {showLabel && <span>({config.label})</span>}
      </span>
      
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
          <p className="font-medium mb-1">{config.description}</p>
          <p className="text-gray-300 text-[10px]">
            Kaynak güvenilirliği, doğrulama, güncellik ve tebligat başarısına göre hesaplanır.
          </p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}

// Detailed breakdown component
interface ConfidenceScoreDetailProps {
  breakdown: {
    totalScore: number;
    factors: {
      sourceReliability: { score: number; weight: number; source: string };
      verification: { score: number; weight: number; verified: boolean };
      recency: { score: number; weight: number; daysSinceUpdate: number };
      notificationSuccess: { score: number; weight: number; successRate: number };
    };
  };
}

export function ConfidenceScoreDetail({ breakdown }: ConfidenceScoreDetailProps) {
  const { factors } = breakdown;

  return (
    <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Toplam Güven Skoru</span>
        <ConfidenceScoreBadge score={breakdown.totalScore} showLabel size="md" />
      </div>
      
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Kaynak Güvenilirliği ({factors.sourceReliability.weight * 100}%)</span>
          <span className="font-medium">{Math.round(factors.sourceReliability.score)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Doğrulama ({factors.verification.weight * 100}%)</span>
          <span className="font-medium">{Math.round(factors.verification.score)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Güncellik ({factors.recency.weight * 100}%)</span>
          <span className="font-medium">{Math.round(factors.recency.score)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Tebligat Başarısı ({factors.notificationSuccess.weight * 100}%)</span>
          <span className="font-medium">{Math.round(factors.notificationSuccess.score)}</span>
        </div>
      </div>
    </div>
  );
}
