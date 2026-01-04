'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Building2, 
  Mail,
  FolderSearch,
  MapPin,
  Clock,
  Loader2,
  Zap,
  FileText,
  Users,
  AlertTriangle
} from 'lucide-react';
import { api, ClientInfoRequestDTO, UyapQueryDTO } from '@/lib/api';
import { ClientInfoRequestModal } from './modals/ClientInfoRequestModal';
import { UyapQueryModal } from './modals/UyapQueryModal';
import { UyapQueryResponseModal } from './modals/UyapQueryResponseModal';
import { InstitutionLetterModal } from './modals/InstitutionLetterModal';

/**
 * UYAP Sorgu Kaynakları - Doğrudan adres verenler
 * - MERNİS (Nüfus): Gerçek kişi yerleşim adresi - EN GÜVENLİ
 * - SGK İşyeri: İşveren/işyeri adresi - ORTA (tebligat için tek başına güvenli değil)
 * 
 * Müzekkere Gerektiren Kaynaklar - UYAP'tan adres çıkmaz
 * - Vergi Dairesi: Mükellefiyet var ama adres yok
 * - Ticaret Sicil: Şirket bilgisi var ama detaylı adres yok (Tüzel kişi için)
 * - Belediye: UYAP'ta sorgu yok
 * - Tapu: Adres vermez, malik bilgisi verir
 */

interface AddressStats {
  total: number;
  bySource: {
    uyap: number;      // MERNİS + SGK
    institution: number; // Müzekkere ile gelen
    client: number;
    crossFile: number;
    manual: number;
  };
  pendingRequests: {
    uyap: number;
    institution: number;
    client: number;
  };
}

interface AddressResearchWidgetProps {
  caseId: string;
  caseDebtorId: string;
  debtorId: string;
  debtorName?: string;
  debtorType?: 'INDIVIDUAL' | 'COMPANY';
  clientId?: string;
  clientEmail?: string;
  compact?: boolean;
  onAddressAdded?: () => void;
}

export function AddressResearchWidget({
  caseId,
  caseDebtorId,
  debtorId,
  debtorName,
  debtorType = 'INDIVIDUAL',
  clientId,
  clientEmail,
  compact = false,
  onAddressAdded
}: AddressResearchWidgetProps) {
  const [stats, setStats] = useState<AddressStats | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [uyapModalOpen, setUyapModalOpen] = useState(false);
  const [uyapResponseModalOpen, setUyapResponseModalOpen] = useState(false);
  const [institutionModalOpen, setInstitutionModalOpen] = useState(false);
  const [selectedUyapQuery, setSelectedUyapQuery] = useState<UyapQueryDTO | null>(null);
  
  const [sendingEmail, setSendingEmail] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      const [addresses, uyapQueries, letters, clientRequests] = await Promise.all([
        api.getDebtorAddresses(debtorId).catch(() => []),
        api.getUyapQueriesForDebtor(caseDebtorId).catch(() => []),
        api.getInstitutionLettersForDebtor(caseDebtorId).catch(() => []),
        api.getClientInfoRequestsForCase(caseId).catch(() => []),
      ]);

      const bySource = {
        uyap: addresses.filter((a: any) => a.source === 'UYAP_QUERY').length,
        institution: addresses.filter((a: any) => a.source === 'INSTITUTION_LETTER').length,
        client: addresses.filter((a: any) => a.source === 'CLIENT_INFO').length,
        crossFile: addresses.filter((a: any) => a.source === 'CROSS_FILE').length,
        manual: addresses.filter((a: any) => a.source === 'USER_INPUT' || !a.source).length,
      };

      const pendingRequests = {
        uyap: uyapQueries.filter((q: any) => q.status === 'PENDING').length,
        institution: letters.filter((l: any) => l.status === 'SENT').length,
        client: clientRequests.filter((r: ClientInfoRequestDTO) => 
          r.status === 'SENT' && (!r.debtorId || r.debtorId === debtorId)
        ).length,
      };

      setStats({
        total: addresses.length,
        bySource,
        pendingRequests,
      });
    } catch (error) {
      console.error('Adres istatistikleri yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  }, [caseId, caseDebtorId, debtorId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleRefresh = () => {
    loadStats();
    onAddressAdded?.();
  };

  // Müvekkile hızlı mail
  const handleQuickEmail = async () => {
    if (!clientId || !clientEmail) {
      setClientModalOpen(true);
      return;
    }
    setSendingEmail(true);
    try {
      await api.createClientInfoRequest({
        caseId,
        clientId,
        debtorId,
        emailTo: clientEmail,
      });
      handleRefresh();
    } catch (error: any) {
      console.error('Mail gönderilemedi:', error);
      setClientModalOpen(true);
    } finally {
      setSendingEmail(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center ${compact ? 'py-2' : 'py-4'}`}>
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      </div>
    );
  }

  // Kompakt versiyon
  if (compact) {
    const hasAddresses = (stats?.total || 0) > 0;
    const hasPending = (stats?.pendingRequests.uyap || 0) + 
                       (stats?.pendingRequests.institution || 0) + 
                       (stats?.pendingRequests.client || 0) > 0;

    return (
      <>
        <div className="flex items-center gap-2">
          <div 
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
              hasAddresses 
                ? 'bg-green-50 text-green-700 hover:bg-green-100' 
                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
            }`}
            title={`${stats?.total || 0} adres bulundu`}
          >
            <MapPin className="h-3 w-3" />
            <span>{stats?.total || 0}</span>
          </div>
          
          {hasPending && (
            <div 
              className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-amber-50 text-amber-700"
              title="Bekleyen talepler var"
            >
              <Clock className="h-3 w-3" />
            </div>
          )}

          <button
            onClick={handleQuickEmail}
            disabled={sendingEmail}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
            title="Müvekkile adres sor"
          >
            {sendingEmail ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Mail className="h-3 w-3" />
            )}
          </button>
        </div>

        <ClientInfoRequestModal
          open={clientModalOpen}
          onClose={() => setClientModalOpen(false)}
          caseId={caseId}
          clientId={clientId}
          clientEmail={clientEmail}
          debtorId={debtorId}
          debtorName={debtorName}
          onSuccess={handleRefresh}
        />
      </>
    );
  }

  // Tam versiyon
  return (
    <div className="space-y-4">
      {/* Özet Başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-blue-600" />
          <span className="font-medium text-gray-900">Adres Araştırma</span>
        </div>
        <div className={`px-2.5 py-1 rounded-full text-sm font-medium ${
          (stats?.total || 0) > 0 
            ? 'bg-green-100 text-green-700' 
            : 'bg-gray-100 text-gray-600'
        }`}>
          {stats?.total || 0} adres
        </div>
      </div>

      {/* BÖLÜM 1: UYAP Sorguları - Doğrudan Adres Verenler */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-blue-500" />
          <span className="text-xs font-semibold text-gray-700">UYAP Sorguları</span>
          <span className="text-[10px] text-gray-400">(Anında sonuç)</span>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          {/* MERNİS - Gerçek Kişi */}
          <button
            onClick={() => setUyapModalOpen(true)}
            className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 hover:border-emerald-300 transition-all text-left"
          >
            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Users className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-emerald-800">MERNİS (Nüfus)</div>
              <div className="text-[10px] text-emerald-600">🔥 En güvenli kaynak</div>
            </div>
            {(stats?.bySource.uyap || 0) > 0 && (
              <span className="px-1.5 py-0.5 bg-emerald-200 text-emerald-800 text-[10px] font-bold rounded">
                {stats?.bySource.uyap}
              </span>
            )}
          </button>

          {/* SGK İşyeri */}
          <button
            onClick={() => setUyapModalOpen(true)}
            className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 hover:border-amber-300 transition-all text-left"
          >
            <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Building2 className="h-4 w-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-amber-800">SGK İşyeri</div>
              <div className="text-[10px] text-amber-600 flex items-center gap-0.5">
                <AlertTriangle className="h-2.5 w-2.5" />
                Orta güven
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* BÖLÜM 2: Müzekkere Gerektiren Kaynaklar */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <FileText className="h-4 w-4 text-purple-500" />
          <span className="text-xs font-semibold text-gray-700">Müzekkere Yazılacak</span>
          <span className="text-[10px] text-gray-400">(Yazı gerekir)</span>
        </div>
        
        <div className="grid grid-cols-3 gap-2">
          {/* Vergi Dairesi */}
          <button
            onClick={() => setInstitutionModalOpen(true)}
            className="flex flex-col items-center gap-1 p-2 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 hover:border-purple-300 transition-all"
          >
            <span className="text-lg">💰</span>
            <span className="text-[10px] font-medium text-purple-700">Vergi Dairesi</span>
          </button>

          {/* Ticaret Sicil - Tüzel Kişi */}
          {debtorType === 'COMPANY' && (
            <button
              onClick={() => setInstitutionModalOpen(true)}
              className="flex flex-col items-center gap-1 p-2 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 hover:border-purple-300 transition-all"
            >
              <span className="text-lg">📋</span>
              <span className="text-[10px] font-medium text-purple-700">Ticaret Sicil</span>
            </button>
          )}

          {/* Belediye */}
          <button
            onClick={() => setInstitutionModalOpen(true)}
            className="flex flex-col items-center gap-1 p-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-all"
          >
            <span className="text-lg">🏛️</span>
            <span className="text-[10px] font-medium text-gray-600">Belediye</span>
          </button>

          {/* Tapu */}
          <button
            onClick={() => setInstitutionModalOpen(true)}
            className="flex flex-col items-center gap-1 p-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-all"
          >
            <span className="text-lg">🏠</span>
            <span className="text-[10px] font-medium text-gray-600">Tapu</span>
          </button>
        </div>

        {(stats?.pendingRequests.institution || 0) > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
            <Clock className="h-3 w-3" />
            <span>{stats?.pendingRequests.institution} müzekkere cevap bekliyor</span>
          </div>
        )}
      </div>

      {/* BÖLÜM 3: Diğer Kaynaklar */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <FolderSearch className="h-4 w-4 text-gray-500" />
          <span className="text-xs font-semibold text-gray-700">Diğer Kaynaklar</span>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          {/* Müvekkil */}
          <button
            onClick={() => setClientModalOpen(true)}
            disabled={sendingEmail}
            className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 hover:border-green-300 transition-all text-left disabled:opacity-50"
          >
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              {sendingEmail ? (
                <Loader2 className="h-4 w-4 text-green-600 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 text-green-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-green-800">Müvekkile Sor</div>
              <div className="text-[10px] text-green-600">Mail gönder</div>
            </div>
            {(stats?.bySource.client || 0) > 0 && (
              <span className="px-1.5 py-0.5 bg-green-200 text-green-800 text-[10px] font-bold rounded">
                {stats?.bySource.client}
              </span>
            )}
          </button>

          {/* Çapraz Dosya */}
          <div className="flex items-center gap-2 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-left">
            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
              <FolderSearch className="h-4 w-4 text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-700">Çapraz Dosya</div>
              <div className="text-[10px] text-gray-500">Diğer dosyalardan</div>
            </div>
            {(stats?.bySource.crossFile || 0) > 0 && (
              <span className="px-1.5 py-0.5 bg-gray-200 text-gray-700 text-[10px] font-bold rounded">
                {stats?.bySource.crossFile}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <ClientInfoRequestModal
        open={clientModalOpen}
        onClose={() => setClientModalOpen(false)}
        caseId={caseId}
        clientId={clientId}
        clientEmail={clientEmail}
        debtorId={debtorId}
        debtorName={debtorName}
        onSuccess={handleRefresh}
      />

      <UyapQueryModal
        open={uyapModalOpen}
        onClose={() => setUyapModalOpen(false)}
        caseDebtorId={caseDebtorId}
        debtorType={debtorType}
        onSuccess={handleRefresh}
      />

      {selectedUyapQuery && (
        <UyapQueryResponseModal
          open={uyapResponseModalOpen}
          onClose={() => {
            setUyapResponseModalOpen(false);
            setSelectedUyapQuery(null);
          }}
          query={selectedUyapQuery}
          onSuccess={handleRefresh}
        />
      )}

      <InstitutionLetterModal
        open={institutionModalOpen}
        onClose={() => setInstitutionModalOpen(false)}
        caseDebtorId={caseDebtorId}
        onSuccess={handleRefresh}
      />
    </div>
  );
}
