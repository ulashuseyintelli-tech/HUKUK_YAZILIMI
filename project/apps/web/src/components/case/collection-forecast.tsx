'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, Target, Lightbulb, BarChart3, Calendar, DollarSign, AlertCircle, CheckCircle } from 'lucide-react';

interface ForecastData {
  probability: number;
  estimatedAmount: number;
  estimatedDays: number;
  confidence: 'high' | 'medium' | 'low';
  factors: { name: string; impact: number; description: string }[];
  recommendations: string[];
}

interface CollectionForecastProps {
  caseId: string;
  principalAmount: number;
}

export function CollectionForecast({ caseId, principalAmount }: CollectionForecastProps) {
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    generateForecast();
  }, [caseId, principalAmount]);

  const generateForecast = () => {
    // AI-simulated forecast
    const demo: ForecastData = {
      probability: 72,
      estimatedAmount: Math.round(principalAmount * 0.85),
      estimatedDays: 45,
      confidence: 'medium',
      factors: [
        { name: 'Borçlu Ödeme Geçmişi', impact: 15, description: 'Geçmişte düzenli ödeme yapmış' },
        { name: 'Teminat Durumu', impact: 20, description: 'Gayrimenkul teminatı mevcut' },
        { name: 'Dosya Türü', impact: 10, description: 'İlamsız takip - ortalama süre' },
        { name: 'Borç Tutarı', impact: -5, description: 'Yüksek tutar - zorluk faktörü' },
        { name: 'Yasal Süreç', impact: 12, description: 'İtiraz yok' },
      ],
      recommendations: [
        'Taksit planı teklif edilmesi tahsilat olasılığını %15 artırabilir',
        'Haciz işlemi başlatılması 30 gün içinde sonuç verebilir',
        'Borçlu ile doğrudan iletişim kurulması önerilir',
        'Benzer dosyalarda ortalama tahsilat süresi 60 gün',
      ],
    };
    setForecast(demo);
    setLoading(false);
  };

  const formatCurrency = (amount: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount);

  const getConfidenceColor = (c: string) => {
    if (c === 'high') return { bg: 'bg-green-100', text: 'text-green-700', label: 'Yüksek Güven' };
    if (c === 'medium') return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Orta Güven' };
    return { bg: 'bg-red-100', text: 'text-red-700', label: 'Düşük Güven' };
  };

  const getProbabilityColor = (p: number) => {
    if (p >= 70) return 'bg-green-500';
    if (p >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (loading || !forecast) return <div className="animate-pulse h-64 bg-gray-100 rounded-xl" />;

  const conf = getConfidenceColor(forecast.confidence);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><TrendingUp className="h-5 w-5 text-blue-600" />Tahsilat Tahmini</h3>
        <span className={`px-2 py-1 rounded text-xs ${conf.bg} ${conf.text}`}>{conf.label}</span>
      </div>

      {/* Main Forecast */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white text-center">
          <Target className="h-6 w-6 mx-auto mb-2 opacity-80" />
          <p className="text-3xl font-bold">%{forecast.probability}</p>
          <p className="text-sm opacity-80">Başarı Olasılığı</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white text-center">
          <DollarSign className="h-6 w-6 mx-auto mb-2 opacity-80" />
          <p className="text-xl font-bold">{formatCurrency(forecast.estimatedAmount)}</p>
          <p className="text-sm opacity-80">Tahmini Tahsilat</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white text-center">
          <Calendar className="h-6 w-6 mx-auto mb-2 opacity-80" />
          <p className="text-3xl font-bold">{forecast.estimatedDays}</p>
          <p className="text-sm opacity-80">Tahmini Gün</p>
        </div>
      </div>

      {/* Probability Bar */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Tahsilat Olasılığı</span>
          <span className="font-bold">%{forecast.probability}</span>
        </div>
        <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full ${getProbabilityColor(forecast.probability)} rounded-full transition-all`} style={{ width: `${forecast.probability}%` }} />
        </div>
      </div>

      {/* Impact Factors */}
      <div className="bg-white rounded-xl border p-4">
        <h4 className="font-medium mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4" />Etki Faktörleri</h4>
        <div className="space-y-2">
          {forecast.factors.map((f, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-8 text-right text-sm font-medium ${f.impact >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {f.impact >= 0 ? '+' : ''}{f.impact}%
              </div>
              <div className="flex-1">
                <p className="text-sm">{f.name}</p>
                <p className="text-xs text-gray-400">{f.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-amber-50 rounded-xl p-4">
        <h4 className="font-medium text-amber-800 mb-3 flex items-center gap-2"><Lightbulb className="h-4 w-4" />AI Önerileri</h4>
        <ul className="space-y-2">
          {forecast.recommendations.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-amber-700">
              <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
