'use client';

import { useState, useEffect } from 'react';
import { ResearchStatusCard } from './ResearchStatusCard';
import { UyapQueryList } from './UyapQueryList';
import { InstitutionLetterList } from './InstitutionLetterList';
import { CrossFileAddressPanel } from './CrossFileAddressPanel';
import { ResearchTimeline } from './ResearchTimeline';
import { ClientInfoRequestCard } from './ClientInfoRequestCard';
import { UyapQueryModal, UyapQueryResponseModal, InstitutionLetterModal, ClientInfoRequestModal } from './modals';
import { Button, Spinner } from '@hukuk/ui';
import { 
  Database, 
  Building2, 
  History,
  Mail,
  Plus
} from 'lucide-react';
import { api, UyapQueryDTO, ClientInfoRequestDTO } from '@/lib/api';

interface AddressDiscoveryPanelProps {
  caseDebtorId: string;
  debtorId: string;
  debtorName?: string;
  caseId: string;
  clientId?: string;
  clientEmail?: string;
  debtorType?: 'INDIVIDUAL' | 'COMPANY';
  readOnly?: boolean;
  onAddressAdded?: () => void;
}

type TabType = 'uyap' | 'letters' | 'client' | 'timeline';

const tabs: { id: TabType; label: string; icon: typeof Database }[] = [
  { id: 'uyap', label: 'UYAP', icon: Database },
  { id: 'letters', label: 'Kurum Yazıları', icon: Building2 },
  { id: 'client', label: 'Müvekkil', icon: Mail },
  { id: 'timeline', label: 'Geçmiş', icon: History },
];

export function AddressDiscoveryPanel({ 
  caseDebtorId, 
  debtorId,
  debtorName,
  caseId,
  clientId,
  clientEmail,
  debtorType = 'INDIVIDUAL',
  readOnly = false,
  onAddressAdded 
}: AddressDiscoveryPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('uyap');
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Modal states
  const [uyapQueryModalOpen, setUyapQueryModalOpen] = useState(false);
  const [uyapResponseModalOpen, setUyapResponseModalOpen] = useState(false);
  const [institutionLetterModalOpen, setInstitutionLetterModalOpen] = useState(false);
  const [clientInfoModalOpen, setClientInfoModalOpen] = useState(false);
  const [selectedQuery, setSelectedQuery] = useState<UyapQueryDTO | null>(null);
  
  // Client info requests
  const [clientInfoRequests, setClientInfoRequests] = useState<ClientInfoRequestDTO[]>([]);
  const [clientInfoLoading, setClientInfoLoading] = useState(false);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    onAddressAdded?.();
  };

  const handleQueryClick = (query: UyapQueryDTO) => {
    if (query.status === 'PENDING') {
      setSelectedQuery(query);
      setUyapResponseModalOpen(true);
    }
  };

  const loadClientInfoRequests = async () => {
    try {
      setClientInfoLoading(true);
      const requests = await api.getClientInfoRequestsForCase(caseId);
      // Filter by debtorId if available
      const filtered = debtorId 
        ? requests.filter(r => !r.debtorId || r.debtorId === debtorId)
        : requests;
      setClientInfoRequests(filtered);
    } catch (error) {
      console.error('Müvekkil talepleri yüklenemedi:', error);
    } finally {
      setClientInfoLoading(false);
    }
  };

  // Load client info requests when tab is selected
  useEffect(() => {
    if (activeTab === 'client') {
      loadClientInfoRequests();
    }
  }, [activeTab, caseId, debtorId]);

  return (
    <div className="space-y-4">
      {/* Research Status - Always visible */}
      <ResearchStatusCard 
        key={`status-${refreshKey}`}
        caseDebtorId={caseDebtorId} 
        readOnly={readOnly}
        onStatusChange={handleRefresh}
      />

      {/* Cross-file addresses - Show if available */}
      <CrossFileAddressPanel
        key={`crossfile-${refreshKey}`}
        debtorId={debtorId}
        currentCaseId={caseId}
        readOnly={readOnly}
        onAddressCopied={handleRefresh}
      />

      {/* Custom Tabs */}
      <div>
        <div className="flex border-b border-gray-200">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="mt-4">
          {activeTab === 'uyap' && (
            <UyapQueryList
              key={`uyap-${refreshKey}`}
              caseDebtorId={caseDebtorId}
              readOnly={readOnly}
              onCreateQuery={() => {
                if (!readOnly) setUyapQueryModalOpen(true);
              }}
              onQueryClick={handleQueryClick}
            />
          )}

          {activeTab === 'letters' && (
            <InstitutionLetterList
              key={`letters-${refreshKey}`}
              caseDebtorId={caseDebtorId}
              readOnly={readOnly}
              onCreateLetter={() => {
                if (!readOnly) setInstitutionLetterModalOpen(true);
              }}
              onLetterClick={(letter) => {
                // TODO: Open letter detail/response modal
                console.log('Letter clicked:', letter);
              }}
            />
          )}

          {activeTab === 'client' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-700">Müvekkil Bilgi Talepleri</h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!readOnly) setClientInfoModalOpen(true);
                  }}
                  disabled={readOnly}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Yeni Talep
                </Button>
              </div>
              {clientInfoLoading ? (
                <div className="flex justify-center py-6">
                  <Spinner size="sm" />
                </div>
              ) : clientInfoRequests.length === 0 ? (
                <div className="text-center py-6 text-gray-500 text-sm">
                  Henüz müvekkile bilgi talebi gönderilmemiş
                </div>
              ) : (
                <div className="space-y-2">
                  {clientInfoRequests.map((request) => (
                    <ClientInfoRequestCard
                      key={request.id}
                      request={request}
                      onUpdate={() => {
                        loadClientInfoRequests();
                        handleRefresh();
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'timeline' && (
            <ResearchTimeline
              key={`timeline-${refreshKey}`}
              caseDebtorId={caseDebtorId}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {!readOnly && (
        <UyapQueryModal
          open={uyapQueryModalOpen}
          onClose={() => setUyapQueryModalOpen(false)}
          caseDebtorId={caseDebtorId}
          debtorType={debtorType}
          onSuccess={handleRefresh}
        />
      )}

      {selectedQuery && (
        <UyapQueryResponseModal
          open={uyapResponseModalOpen}
          onClose={() => {
            setUyapResponseModalOpen(false);
            setSelectedQuery(null);
          }}
          query={selectedQuery}
          onSuccess={handleRefresh}
        />
      )}

      {!readOnly && (
        <InstitutionLetterModal
          open={institutionLetterModalOpen}
          onClose={() => setInstitutionLetterModalOpen(false)}
          caseDebtorId={caseDebtorId}
          onSuccess={handleRefresh}
        />
      )}

      {!readOnly && (
        <ClientInfoRequestModal
          open={clientInfoModalOpen}
          onClose={() => setClientInfoModalOpen(false)}
          caseId={caseId}
          clientId={clientId}
          clientEmail={clientEmail}
          debtorId={debtorId}
          debtorName={debtorName}
          onSuccess={() => {
            loadClientInfoRequests();
            handleRefresh();
          }}
        />
      )}
    </div>
  );
}
