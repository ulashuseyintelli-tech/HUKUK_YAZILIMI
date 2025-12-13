'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, TrendingUp, TrendingDown, Shield, Clock, DollarSign, FileText, CheckCircle } from 'lucide-react';

interface RiskFactor {
  id: string;
  name: string;
  score: number;
  maxScore: number;
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
}

interface DebtorRiskScoreProps {
  debtorId: string;
  debtorName?: string;
}

export function DebtorRiskScore({ debtorId, debtorName }: DebtorRiskScoreProps) {
  const [score, setScore] = useState(0);
  const [factors, setFactors] = useState<RiskFactor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    calculateRisk();
  }, [debtorId]);

  const calculateRisk = () => {
    // Demo risk factors
    const demoFactors: RiskFactor[] = [
      { id: '1', name: 'Ödeme Geçmişi', score: 15, maxScore: 25, description: 'Son 12 ayda 3 gecikmiş ödeme', impact: 'negative' },
      { id: '2', name: 'Aktif Dosya Sayısı', score: 20, maxScore: 20, description: '2 aktif icra dosyası', impact: 'negative' },
      { id: '3', name: 'Toplam Borç/Gelir', score: 10, maxScore: 20, description: 'Borç/gelir oranı %45', impact: 'neutral' },
      { id: '4', name: 'Teminat Durumu', score: 5, maxScore: 15, description: 'Gayrimenkul teminatı mevcut', impact: 'positive' },
      { id: '5', name: 'İletişim Yanıtı', score: 8, maxScore: 10, description: 'İletişime açık, yanıt veriyor', impact: 'positive' },
      { id: '6', name: 'Yasal Süreç', score: 7, maxScore: 10, description: 'İtiraz yok, işbirlikçi', impact: 'positive' },
    ];
    setFactors(demoFactors);
    const total = demoFactors.reduce((sum, f) => sum + f.score, 0);
    const max = demoFactors.reduce((sum, f) => sum + f.maxScore, 0);
    setScore(Math.round((total / max) * 100));
    setLoading(false);
  };

  const getRiskLevel = (s: number) => {
    if (s >= 70) return { label: 'Düşük Risk', color: 'green', icon: <Shield className="h-5 w-5" /> };
    if (s >= 40) return { label: 'Orta Risk', color: 'yellow', icon: <AlertTriangle className="h-5 w-5" /> };
    return { label: 'Yüksek Risk', color: 'red', icon: <AlertTriangle className="h-5 w-5" /> };
  };

  const risk = getRiskLevel(score);
  const colorClasses: Record<string, { bg: string; text: string; bar: string }> = {
    green: { bg: 'bg-green-100', text: 'text-green-700', bar: 'bg-green-500' },
    yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700', bar: 'bg-yellow-500' },
    red: { bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-500' },
  };

  if (loading) return <div className="animate-pulse h-48 bg-gray-100 rounded-xl" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Borçlu Risk Skoru</h3>
        {debtorName && <span className="text-sm text-gray-500">{debtorName}</span>}
      </div>

      {/* Score Card */}
      <div className={`${colorClasses[risk.color].bg} rounded-xl p-6 text-center`}>
        <div className={`inline-flex items-center gap-2 ${colorClasses[risk.color].text} mb-2`}>
          {risk.icon}
          <span className="font-medium">{risk.label}</span>
        </div>
        <div className="text-5xl font-bold mb-2">{score}</div>
        <p className="text-sm text-gray-600">/ 100 puan</p>
        <div className="mt-4 h-3 bg-white/50 rounded-full overflow-hidden">
          <div className={`h-full ${colorClasses[risk.color].bar} rounded-full transition-all`} style={{ width: `${score}%` }} />
        </div>
      </div>

      {/* Risk Factors */}
      <div className="bg-white rounded-xl border p-4">
        <h4 className="font-medium mb-3">Risk Faktörleri</h4>
        <div className="space-y-3">
          {factors.map((factor) => (
            <div key={factor.id} className="flex items-center gap-3">
              <div className={`p-1.5 rounded ${factor.impact === 'positive' ? 'bg-green-100 text-green-600' : factor.impact === 'negative' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                {factor.impact === 'positive' ? <TrendingUp className="h-4 w-4" /> : factor.impact === 'negative' ? <TrendingDown className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{factor.name}</span>
                  <span className="text-sm text-gray-500">{factor.score}/{factor.maxScore}</span>
                </div>
                <p className="text-xs text-gray-400">{factor.description}</p>
                <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${factor.impact === 'positive' ? 'bg-green-400' : factor.impact === 'negative' ? 'bg-red-400' : 'bg-gray-400'}`} style={{ width: `${(factor.score / factor.maxScore) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-blue-50 rounded-xl p-4">
        <h4 className="font-medium text-blue-800 mb-2">Öneriler</h4>
        <ul className="space-y-1 text-sm text-blue-700">
          <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4" />Taksit planı teklif edilebilir</li>
          <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4" />Teminat artırımı talep edilebilir</li>
          <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4" />Düzenli iletişim sürdürülmeli</li>
        </ul>
      </div>
    </div>
  );
}
