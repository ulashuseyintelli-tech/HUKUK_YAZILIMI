'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  TrendingUp, 
  Plus, 
  RefreshCw, 
  Database,
  Calendar,
  Percent,
  ExternalLink,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@hukuk/ui';
import { Card } from '@hukuk/ui';
import { Badge } from '@hukuk/ui';
import { Spinner } from '@hukuk/ui';
import {
  interestEngineApi,
  InterestTypeCode,
  RateSourceType,
  RateEntry,
  getInterestTypeLabel,
  formatRate,
} from '@/lib/api/interest-engine';

interface InterestRatesPanelProps {
  className?: string;
}

export function InterestRatesPanel({ className = '' }: InterestRatesPanelProps) {
  const [selectedType, setSelectedType] = useState<InterestTypeCode>(
    InterestTypeCode.COMMERCIAL_AVANS_3095_2_2
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const queryClient = useQueryClient();

  // Date range for query (last 2 years)
  const today = new Date();
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(today.getFullYear() - 2);

  const fromDate = twoYearsAgo.toISOString().split('T')[0];
  const toDate = today.toISOString().split('T')[0];

  // Fetch rates
  const { data: ratesResult, isLoading } = useQuery({
    queryKey: ['interest-rates', selectedType, fromDate, toDate],
    queryFn: () => interestEngineApi.getRates(selectedType, fromDate, toDate),
  });

  // Sync TCMB mutation
  const syncMutation = useMutation({
    mutationFn: () => interestEngineApi.syncTcmb(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['interest-rates'] });
      alert(`${data.added} yeni oran eklendi`);
    },
  });

  // Seed rates mutation
  const seedMutation = useMutation({
    mutationFn: () => interestEngineApi.seedRates(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['interest-rates'] });
      alert(`${data.added} tarihi oran eklendi`);
    },
  });

  const interestTypes = [
    InterestTypeCode.LEGAL_3095,
    InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
    InterestTypeCode.TTK_1530,
    InterestTypeCode.MEVDUAT_TL_BANKALARCA,
    InterestTypeCode.MEVDUAT_USD_BANKALARCA,
    InterestTypeCode.MEVDUAT_EUR_BANKALARCA,
  ];

  return (
    <Card className={`overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-50 border-b">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-600" />
          <h3 className="font-medium text-gray-900">Faiz Oranları</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
          >
            <Database className={`w-4 h-4 mr-1 ${seedMutation.isPending ? 'animate-pulse' : ''}`} />
            Tarihi Oranları Yükle
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            TCMB Senkronize
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Type Selector */}
        <div className="flex flex-wrap gap-2">
          {interestTypes.map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                selectedType === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {getInterestTypeLabel(type)}
            </button>
          ))}
        </div>

        {/* Gap Warning */}
        {ratesResult?.hasGaps && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              ⚠️ Oran serisinde boşluk var. Eksik dönemler için manuel oran girişi yapın.
            </p>
            {ratesResult.gaps?.map((gap, idx) => (
              <p key={idx} className="text-xs text-yellow-600 mt-1">
                {gap.from} - {gap.to}
              </p>
            ))}
          </div>
        )}

        {/* Rates Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="w-6 h-6" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">Geçerlilik</th>
                  <th className="pb-2 font-medium text-right">Oran</th>
                  <th className="pb-2 font-medium">Kaynak</th>
                  <th className="pb-2 font-medium text-right">Durum</th>
                </tr>
              </thead>
              <tbody>
                {ratesResult?.rates.map((rate) => (
                  <RateRow key={rate.id} rate={rate} />
                ))}
                {(!ratesResult?.rates || ratesResult.rates.length === 0) && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-500">
                      Bu faiz türü için oran bulunamadı
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Add Rate Form */}
        {showAddForm && (
          <AddRateForm
            interestType={selectedType}
            onClose={() => setShowAddForm(false)}
            onSuccess={() => {
              setShowAddForm(false);
              queryClient.invalidateQueries({ queryKey: ['interest-rates'] });
            }}
          />
        )}

        {/* Add Button */}
        {!showAddForm && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(true)}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-1" />
            Manuel Oran Ekle
          </Button>
        )}
      </div>
    </Card>
  );
}

// Rate Row Component
function RateRow({ rate }: { rate: RateEntry }) {
  const startDate = new Date(rate.validFrom).toLocaleDateString('tr-TR');
  const endDate = rate.validTo 
    ? new Date(rate.validTo).toLocaleDateString('tr-TR')
    : 'Güncel';
  const isCurrent = !rate.validTo;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-2">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3 text-gray-400" />
          <span>{startDate}</span>
          <span className="text-gray-400">→</span>
          <span className={isCurrent ? 'text-green-600 font-medium' : ''}>
            {endDate}
          </span>
        </div>
      </td>
      <td className="py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <Percent className="w-3 h-3 text-gray-400" />
          <span className="font-medium text-blue-600">{formatRate(rate.annualRate)}</span>
        </div>
      </td>
      <td className="py-2">
        <div className="flex items-center gap-1">
          <Badge 
            variant={rate.source === 'TCMB' ? 'default' : 'secondary'}
            className="text-xs"
          >
            {rate.source}
          </Badge>
          {rate.sourceReference && (
            <span className="text-xs text-gray-500">{rate.sourceReference}</span>
          )}
        </div>
      </td>
      <td className="py-2 text-right">
        {isCurrent ? (
          <Badge variant="success" className="text-xs">Aktif</Badge>
        ) : (
          <Badge variant="secondary" className="text-xs">Geçmiş</Badge>
        )}
      </td>
    </tr>
  );
}

// Add Rate Form Component
function AddRateForm({
  interestType,
  onClose,
  onSuccess,
}: {
  interestType: InterestTypeCode;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [validFrom, setValidFrom] = useState('');
  const [annualRate, setAnnualRate] = useState('');
  const [source, setSource] = useState<RateSourceType>(RateSourceType.RESMI_GAZETE);
  const [sourceRef, setSourceRef] = useState('');

  const addMutation = useMutation({
    mutationFn: () =>
      interestEngineApi.addRate({
        interestType,
        validFrom,
        annualRate: parseFloat(annualRate) / 100, // Convert from percentage
        source,
        sourceRef: sourceRef || undefined,
      }),
    onSuccess,
  });

  return (
    <div className="p-4 bg-gray-50 rounded-lg space-y-3">
      <h4 className="font-medium text-sm">Yeni Oran Ekle</h4>
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Geçerlilik Başlangıcı</label>
          <input
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            className="w-full px-3 py-2 text-sm border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Yıllık Oran (%)</label>
          <input
            type="number"
            step="0.01"
            value={annualRate}
            onChange={(e) => setAnnualRate(e.target.value)}
            placeholder="24.00"
            className="w-full px-3 py-2 text-sm border rounded-lg"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Kaynak</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as RateSourceType)}
            className="w-full px-3 py-2 text-sm border rounded-lg"
          >
            <option value={RateSourceType.TCMB}>TCMB</option>
            <option value={RateSourceType.RESMI_GAZETE}>Resmi Gazete</option>
            <option value={RateSourceType.CONTRACT}>Sözleşme</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Kaynak Referansı</label>
          <input
            type="text"
            value={sourceRef}
            onChange={(e) => setSourceRef(e.target.value)}
            placeholder="Resmi Gazete 32415"
            className="w-full px-3 py-2 text-sm border rounded-lg"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          <X className="w-4 h-4 mr-1" />
          İptal
        </Button>
        <Button
          size="sm"
          onClick={() => addMutation.mutate()}
          disabled={!validFrom || !annualRate || addMutation.isPending}
        >
          <Check className="w-4 h-4 mr-1" />
          Ekle
        </Button>
      </div>
    </div>
  );
}

export default InterestRatesPanel;
