'use client';

import { useState } from 'react';
import { X, Brain, Loader2, Lightbulb, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';

interface AiSuggestion {
  action: string;
  reasoning: string;
  confidence: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  estimatedImpact: string;
}

interface AiPrediction {
  collectionProbability: number;
  estimatedDays: number;
  riskFactors: string[];
  recommendations: string[];
}

interface AiSuggestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  suggestions: AiSuggestion[];
  prediction: AiPrediction | null;
  loading: boolean;
  error: string | null;
  caseFileNumber: string;
}

export function AiSuggestionsModal({
  isOpen,
  onClose,
  suggestions,
  prediction,
  loading,
  error,
  caseFileNumber,
}: AiSuggestionsModalProps) {
  const [activeTab, setActiveTab] = useState<'suggestions' | 'prediction'>('suggestions');

  if (!isOpen) return null;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT': return 'bg-red-100 text-red-700 border-red-200';
      case 'HIGH': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'LOW': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'URGENT': return 'Acil';
      case 'HIGH': return 'Yüksek';
      case 'MEDIUM': return 'Orta';
      case 'LOW': return 'Düşük';
      default: return priority;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden mx-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Brain className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">AI Analiz Sonuçları</h2>
                <p className="text-white/80 text-sm">Dosya: {caseFileNumber}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('suggestions')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'suggestions'
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Lightbulb className="h-4 w-4 inline mr-2" />
            Öneriler
          </button>
          <button
            onClick={() => setActiveTab('prediction')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'prediction'
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <TrendingUp className="h-4 w-4 inline mr-2" />
            Tahmin
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mb-4" />
              <p className="text-gray-500">AI analiz yapılıyor...</p>
              <p className="text-sm text-gray-400 mt-1">Bu işlem birkaç saniye sürebilir</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <div>
                <p className="font-medium text-red-700">Hata Oluştu</p>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && activeTab === 'suggestions' && (
            <div className="space-y-4">
              {suggestions.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Henüz öneri bulunmuyor</p>
              ) : (
                suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    className="border rounded-xl p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-indigo-600">#{index + 1}</span>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getPriorityColor(suggestion.priority)}`}>
                          {getPriorityLabel(suggestion.priority)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 bg-indigo-100 px-3 py-1 rounded-full">
                        <span className="text-sm font-bold text-indigo-700">%{suggestion.confidence}</span>
                        <span className="text-xs text-indigo-600">güven</span>
                      </div>
                    </div>
                    
                    <h4 className="font-semibold text-gray-900 mb-2">{suggestion.action}</h4>
                    <p className="text-sm text-gray-600 mb-3">{suggestion.reasoning}</p>
                    
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-gray-500">Beklenen Etki:</span>
                      <span className="text-gray-700">{suggestion.estimatedImpact}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {!loading && !error && activeTab === 'prediction' && prediction && (
            <div className="space-y-6">
              {/* Tahsilat Olasılığı */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
                <h4 className="font-semibold text-gray-900 mb-4">Tahsilat Olasılığı</h4>
                <div className="flex items-end gap-4">
                  <span className={`text-5xl font-bold ${
                    prediction.collectionProbability >= 70 ? 'text-green-600' :
                    prediction.collectionProbability >= 40 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    %{prediction.collectionProbability}
                  </span>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          prediction.collectionProbability >= 70 ? 'bg-green-500' :
                          prediction.collectionProbability >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${prediction.collectionProbability}%` }}
                      />
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-3">
                  Tahmini süre: <span className="font-semibold">{prediction.estimatedDays} gün</span>
                </p>
              </div>

              {/* Risk Faktörleri */}
              {prediction.riskFactors.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-orange-500" />
                    Risk Faktörleri
                  </h4>
                  <div className="space-y-2">
                    {prediction.riskFactors.map((factor, index) => (
                      <div key={index} className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                        <span className="w-2 h-2 bg-orange-500 rounded-full" />
                        <span className="text-sm text-orange-800">{factor}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Öneriler */}
              {prediction.recommendations.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-blue-500" />
                    Öneriler
                  </h4>
                  <div className="space-y-2">
                    {prediction.recommendations.map((rec, index) => (
                      <div key={index} className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <CheckCircle className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        <span className="text-sm text-blue-800">{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!loading && !error && activeTab === 'prediction' && !prediction && (
            <p className="text-center text-gray-500 py-8">Tahmin verisi bulunmuyor</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              AI önerileri bilgilendirme amaçlıdır, nihai karar kullanıcıya aittir.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
