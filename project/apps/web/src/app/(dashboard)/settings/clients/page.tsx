"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, X, Search, Building2, User, Landmark, Edit2, Trash2, Loader2, Mail, Send, MessageSquare, Download, Upload, FileSpreadsheet, FileText, FileCheck, AlertTriangle, Clock, CheckCircle, Globe, Users, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { api } from "@/lib/api";
import { isPoaDuplicateSuppressed, POA_DUPLICATE_MESSAGE } from "@/lib/poa-ux";
import { PoaScannerWizard } from "@/components/client/PoaScannerWizard";
import { BulkEmailModal } from "@/components/bulk-email-modal";

const CLIENT_TYPES = [
  { value: "PERSON", label: "Şahıs", icon: User, color: "bg-gray-100 text-gray-700" },
  { value: "COMPANY", label: "Kurum", icon: Building2, color: "bg-blue-100 text-blue-700" },
  { value: "PUBLIC", label: "Kamu", icon: Landmark, color: "bg-purple-100 text-purple-700" },
];

type ClientSortField = "type" | "name" | "identityNo" | "phone" | "email" | "caseCount";
type SortDirection = "asc" | "desc" | null;

export default function ClientsSettingsPage() {
  const searchParams = useSearchParams();
  const editClientId = searchParams.get("edit");
  
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [scannedData, setScannedData] = useState<any>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [emailClient, setEmailClient] = useState<any>(null);
  const [smsClient, setSmsClient] = useState<any>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showPoaModal, setShowPoaModal] = useState(false);
  const [poaClient, setPoaClient] = useState<any>(null);
  const [showPortalModal, setShowPortalModal] = useState(false);
  const [portalClient, setPortalClient] = useState<any>(null);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [showBulkEmailModal, setShowBulkEmailModal] = useState(false);
  
  // Sıralama state'leri
  const [sortField, setSortField] = useState<ClientSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  useEffect(() => { loadClients(); }, []);

  const loadClients = async () => {
    try {
      const res = await api.get("/clients");
      setClients(res.data?.data || []);
    } catch (e) { console.error("Müvekkiller yüklenemedi:", e); }
    finally { setLoading(false); }
  };

  // Görevdeki "Müvekkile git" linki: /settings/clients?edit={clientId} ile gelince o müvekkilin
  // düzenleme modalını OTOMATİK aç (üste sıralama davranışı sortedClients'ta korunur).
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (!editClientId || deepLinkHandledRef.current || clients.length === 0) return;
    const target = clients.find((c: any) => c.id === editClientId);
    if (!target) return;
    deepLinkHandledRef.current = true;
    (async () => {
      try {
        const res = await api.get(`/clients/${editClientId}`);
        setEditingClient(res.data?.data || res.data);
      } catch {
        setEditingClient(target);
      }
      setScannedData(null);
      setShowModal(true);
    })();
  }, [editClientId, clients]);

  const handleSave = async (data: any) => {
    setSaving(true);
    try {
      let clientId: string;
      
      if (editingClient) {
        await api.put(`/clients/${editingClient.id}`, data);
        clientId = editingClient.id;
      } else {
        const res = await api.post("/clients", data);
        clientId = res.data?.id || res.data?.data?.id;
      }
      
      // Vekaletname bilgileri varsa (taranmış veya manuel girilmiş), otomatik vekalet oluştur
      const poaData = scannedData || data;
      const hasPoaInfo = poaData.poaNumber || poaData.poaDate || poaData.notaryName;
      
      if (clientId && hasPoaInfo && !editingClient) {
        // Sadece yeni müvekkil oluştururken otomatik POA oluştur
        try {
          const poaRes = await api.post("/poa", {
            clientId,
            journalNo: poaData.poaNumber,
            poaNumber: poaData.poaNumber,
            dateIssued: poaData.poaDate ? new Date(poaData.poaDate) : undefined,
            notaryName: poaData.notaryName,
            notaryCity: poaData.notaryCity,
            isLimited: poaData.isLimited || false,
            validUntil: poaData.validUntil ? new Date(poaData.validUntil) : undefined,
            scopeType: poaData.scopeType || "GENEL",
            scopeDescription: poaData.scopeDescription,
            canCollect: poaData.canCollect ?? data.canCollect ?? true,
            canWaive: poaData.canWaive ?? data.canWaive ?? false,
            canSettle: poaData.canSettle ?? data.canSettle ?? false,
            canRelease: poaData.canRelease ?? data.canRelease ?? false,
          });
          // PR-2a: aynı vekalet zaten kayıtlıysa backend yeni açmaz; kullanıcıya bildir.
          if (isPoaDuplicateSuppressed(poaRes)) {
            alert(POA_DUPLICATE_MESSAGE);
          } else {
            console.log("Vekalet otomatik oluşturuldu");
          }
        } catch (poaErr) {
          console.warn("Vekalet oluşturulamadı:", poaErr);
          // Vekalet oluşturulamazsa bile müvekkil kaydedildi, devam et
        }
      }
      
      await loadClients();
      setShowModal(false);
      setEditingClient(null);
      setScannedData(null);
    } catch (e: any) { alert(e.message || "Hata oluştu"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu müvekkili silmek istediğinize emin misiniz?")) return;
    try {
      await api.delete(`/clients/${id}`);
      await loadClients();
    } catch (e: any) { alert(e.message || "Silinemedi"); }
  };

  const handleExport = async (format: "excel" | "pdf") => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== "ALL") params.append("type", typeFilter);
      if (search) params.append("search", search);

      const url = `/export-import/clients/${format}?${params.toString()}`;
      const res = await api.get(url, { responseType: "blob" });

      const blob = new Blob([res.data], { 
        type: format === "excel" 
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
          : "application/pdf" 
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `muvekiller_${Date.now()}.${format === "excel" ? "xlsx" : "pdf"}`;
      link.click();
    } catch (e: any) { alert("Dışa aktarma hatası: " + (e.message || "Bilinmeyen hata")); }
    finally { setExporting(false); }
  };

  const filtered = clients.filter(c => {
    const matchesSearch = c.name?.toLowerCase().includes(search.toLowerCase()) || 
                          c.identityNo?.includes(search) ||
                          c.email?.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "ALL" || c.type === typeFilter;
    return matchesSearch && matchesType;
  });

  // Sıralama fonksiyonu
  const handleSort = (field: ClientSortField) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortDirection(null);
        setSortField(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Sıralanmış liste - editClientId varsa en üste çıkar
  const sortedClients = [...filtered].sort((a, b) => {
    // URL'den gelen edit parametresi varsa o müvekkili en üste al
    if (editClientId) {
      if (a.id === editClientId) return -1;
      if (b.id === editClientId) return 1;
    }
    
    if (!sortField || !sortDirection) return 0;
    
    let aValue: any, bValue: any;
    
    if (sortField === "caseCount") {
      aValue = a._count?.cases || 0;
      bValue = b._count?.cases || 0;
      return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
    }
    
    aValue = (a[sortField] || "").toString().toLowerCase();
    bValue = (b[sortField] || "").toString().toLowerCase();
    
    if (sortDirection === "asc") {
      return aValue.localeCompare(bValue, "tr");
    } else {
      return bValue.localeCompare(aValue, "tr");
    }
  });

  // Sıralama ikonu
  const SortIcon = ({ field }: { field: ClientSortField }) => {
    if (sortField !== field) {
      return <ChevronsUpDown className="h-3 w-3 text-gray-400" />;
    }
    if (sortDirection === "asc") {
      return <ChevronUp className="h-3 w-3 text-primary" />;
    }
    return <ChevronDown className="h-3 w-3 text-primary" />;
  };

  if (loading) return <div className="p-4 text-center">Yükleniyor...</div>;

  return (
    <div className="h-full flex flex-col overflow-hidden p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Müvekkiller (Alacaklılar)</h1>
          <p className="text-sm text-muted-foreground">Büronuzun müvekkil kayıtlarını yönetin</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Export/Import Butonları */}
          <div className="flex items-center gap-1 border rounded px-2 py-1">
            <button onClick={() => handleExport("excel")} disabled={exporting} className="p-1 hover:bg-gray-100 rounded text-green-600" title="Excel'e Aktar">
              <FileSpreadsheet className="h-4 w-4" />
            </button>
            <button onClick={() => handleExport("pdf")} disabled={exporting} className="p-1 hover:bg-gray-100 rounded text-red-600" title="PDF'e Aktar">
              <FileText className="h-4 w-4" />
            </button>
            <div className="w-px h-4 bg-gray-300" />
            <button onClick={() => setShowImportModal(true)} className="p-1 hover:bg-gray-100 rounded text-blue-600" title="Excel'den İçe Aktar">
              <Download className="h-4 w-4" />
            </button>
          </div>
          <button onClick={() => { setEditingClient(null); setScannedData(null); setShowModal(true); }} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-sm rounded hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Manuel Ekle
          </button>
        </div>
      </div>

      {/* Vekaletname Tarama Sihirbazı */}
      <div className="mb-4">
        <PoaScannerWizard
          onScanComplete={async (result) => {
            setScannedData(result);
            setEditingClient(null);
            setShowModal(true);
          }}
        />
        {scannedData && !showModal && (
          <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700 flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Vekaletname tarandı. Müvekkil kaydedildiğinde vekalet bilgileri de otomatik eklenecek.
          </div>
        )}
      </div>

      {/* Filtreler ve Toplu İşlemler */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Ad, TCKN/VKN veya e-posta ile ara..." className="w-full pl-8 pr-3 py-1.5 border rounded text-sm" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="border rounded px-3 py-1.5 text-sm">
          <option value="ALL">Tüm Türler</option>
          {CLIENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {selectedClients.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded">
            <Users className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-blue-700 font-medium">{selectedClients.length} seçili</span>
            <button
              onClick={() => setShowBulkEmailModal(true)}
              className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
            >
              <Mail className="h-3 w-3" /> Toplu E-posta
            </button>
            <button
              onClick={() => setSelectedClients([])}
              className="p-1 text-blue-600 hover:bg-blue-100 rounded"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Liste - Tablo Görünümü */}
      <div className="flex-1 overflow-auto border rounded-lg">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {search || typeFilter !== "ALL" ? "Sonuç bulunamadı" : "Henüz müvekkil eklenmedi"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr className="border-b">
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={selectedClients.length === sortedClients.length && sortedClients.length > 0}
                    onChange={(e) => setSelectedClients(e.target.checked ? sortedClients.map(c => c.id) : [])}
                    className="rounded"
                  />
                </th>
                <th 
                  className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort("type")}
                >
                  <div className="flex items-center gap-1">Tür <SortIcon field="type" /></div>
                </th>
                <th 
                  className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">Ad / Unvan <SortIcon field="name" /></div>
                </th>
                <th 
                  className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort("identityNo")}
                >
                  <div className="flex items-center gap-1">TCKN / VKN <SortIcon field="identityNo" /></div>
                </th>
                <th 
                  className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort("phone")}
                >
                  <div className="flex items-center gap-1">Telefon <SortIcon field="phone" /></div>
                </th>
                <th 
                  className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort("email")}
                >
                  <div className="flex items-center gap-1">E-posta <SortIcon field="email" /></div>
                </th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Vekalet</th>
                <th 
                  className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort("caseCount")}
                >
                  <div className="flex items-center gap-1">Takip Sayısı <SortIcon field="caseCount" /></div>
                </th>
                <th className="text-right px-3 py-2 font-medium text-gray-600 w-28">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedClients.map(client => {
                const typeInfo = CLIENT_TYPES.find(t => t.value === client.type) || CLIENT_TYPES[0];
                const TypeIcon = typeInfo.icon;
                const isHighlighted = client.id === editClientId;
                return (
                  <tr key={client.id} className={`hover:bg-gray-50 transition-colors ${selectedClients.includes(client.id) ? 'bg-blue-50' : ''} ${isHighlighted ? 'bg-yellow-50 ring-2 ring-yellow-400 ring-inset' : ''}`}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedClients.includes(client.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedClients([...selectedClients, client.id]);
                          } else {
                            setSelectedClients(selectedClients.filter(id => id !== client.id));
                          }
                        }}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${typeInfo.color}`}>
                        <TypeIcon className="h-3 w-3" />
                        {typeInfo.label}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <button 
                        onClick={async () => { 
                          // Müvekkil detayını POA'larla birlikte çek
                          try {
                            const res = await api.get(`/clients/${client.id}`);
                            const fullClient = res.data?.data || res.data;
                            setEditingClient(fullClient); 
                            setScannedData(null); 
                            setShowModal(true); 
                          } catch (e) {
                            console.error("Müvekkil detayı yüklenemedi:", e);
                            // Fallback: liste verisini kullan
                            setEditingClient(client); 
                            setScannedData(null); 
                            setShowModal(true);
                          }
                        }} 
                        className="font-medium text-left hover:text-primary hover:underline transition-colors"
                        title="Düzenlemek için tıklayın"
                      >
                        {client.name}
                      </button>
                      {client.contactFollowUpStatus === "ACTIVE" && (
                        <span
                          className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 align-middle"
                          title="Operasyonel eksik: telefon/e-posta tamamlanmalı (Görevler > Operasyonel Eksikler)"
                        >
                          <AlertTriangle className="h-3 w-3" /> İletişim eksik
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{client.identityNo || "-"}</td>
                    <td className="px-3 py-2 text-gray-600">{client.phone || "-"}</td>
                    <td className="px-3 py-2 text-gray-600">{client.email || "-"}</td>
                    <td className="px-3 py-2">
                      {(client.powerOfAttorneys?.length ?? 0) > 0 || client.poaCount > 0 || client._count?.poas > 0 ? (
                        <button 
                          onClick={() => { setPoaClient(client); setShowPoaModal(true); }}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs cursor-pointer hover:opacity-80 ${
                            client.hasExpiredPoa ? 'bg-red-100 text-red-700' : 
                            client.hasExpiringPoa ? 'bg-amber-100 text-amber-700' : 
                            'bg-green-100 text-green-700'
                          }`}
                          title="Vekaletleri görüntüle"
                        >
                          {client.hasExpiredPoa ? (
                            <><X className="h-3 w-3" /> Süresi Dolmuş</>
                          ) : client.hasExpiringPoa ? (
                            <><Clock className="h-3 w-3" /> Süresi Yakın</>
                          ) : (
                            <><CheckCircle className="h-3 w-3" /> Geçerli</>
                          )}
                        </button>
                      ) : (
                        <button 
                          onClick={() => { setPoaClient(client); setShowPoaModal(true); }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer"
                          title="Vekalet ekle"
                        >
                          <Plus className="h-3 w-3" /> Ekle
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                        {client._count?.cases || 0}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setPoaClient(client); setShowPoaModal(true); }} className="p-1.5 text-amber-500 hover:bg-amber-50 rounded" title="Vekaletler">
                          <FileCheck className="h-4 w-4" />
                        </button>
                        <button onClick={() => { setPortalClient(client); setShowPortalModal(true); }} className={`p-1.5 rounded ${client.hasPortalAccess ? "text-cyan-500 hover:bg-cyan-50" : "text-gray-400 hover:bg-gray-50"}`} title={client.hasPortalAccess ? "Portal Erişimi Var" : "Portal Erişimi Ver"}>
                          <Globe className="h-4 w-4" />
                        </button>
                        <button onClick={() => { setEmailClient(client); setShowEmailModal(true); }} className="p-1.5 text-green-500 hover:bg-green-50 rounded" title="E-posta Gönder">
                          <Mail className="h-4 w-4" />
                        </button>
                        <button onClick={() => { setSmsClient(client); setShowSmsModal(true); }} className="p-1.5 text-purple-500 hover:bg-purple-50 rounded" title="SMS Gönder">
                          <MessageSquare className="h-4 w-4" />
                        </button>
                        <button onClick={async () => { 
                          try {
                            const res = await api.get(`/clients/${client.id}`);
                            const fullClient = res.data?.data || res.data;
                            setEditingClient(fullClient); 
                          } catch (e) {
                            setEditingClient(client); 
                          }
                          setScannedData(null); 
                          setShowModal(true); 
                        }} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded" title="Düzenle">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(client.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Sil">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      
      {/* Toplam Sayı */}
      <div className="mt-2 text-xs text-muted-foreground text-right">
        Toplam {filtered.length} müvekkil {filtered.length !== clients.length && `(${clients.length} kayıttan)`}
      </div>

      {/* Modal */}
      {showModal && (
        <ClientModal
          client={editingClient}
          scannedData={scannedData}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditingClient(null); setScannedData(null); }}
          saving={saving}
        />
      )}

      {/* E-posta Gönderme Modal */}
      {showEmailModal && emailClient && (
        <SendEmailModal
          client={emailClient}
          onClose={() => { setShowEmailModal(false); setEmailClient(null); }}
        />
      )}

      {/* SMS Gönderme Modal */}
      {showSmsModal && smsClient && (
        <SendSmsModal
          client={smsClient}
          onClose={() => { setShowSmsModal(false); setSmsClient(null); }}
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportClientsModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => { setShowImportModal(false); loadClients(); }}
        />
      )}

      {/* Vekaletler Modal */}
      {showPoaModal && poaClient && (
        <ClientPoaModal
          client={poaClient}
          onClose={() => { setShowPoaModal(false); setPoaClient(null); }}
        />
      )}

      {/* Portal Erişimi Modal */}
      {showPortalModal && portalClient && (
        <PortalAccessModal
          client={portalClient}
          onClose={() => { setShowPortalModal(false); setPortalClient(null); }}
          onSuccess={() => { setShowPortalModal(false); setPortalClient(null); loadClients(); }}
        />
      )}

      {/* Toplu E-posta Modal */}
      <BulkEmailModal
        isOpen={showBulkEmailModal}
        onClose={() => { setShowBulkEmailModal(false); setSelectedClients([]); }}
        recipients={clients.filter(c => selectedClients.includes(c.id)).map(c => ({ id: c.id, name: c.name, email: c.email }))}
        type="clients"
      />

    </div>
  );
}

// Müvekkil Modal - Çoklu telefon/email/adres destekli + Vekaletname tarama
function ClientModal({ client, scannedData, onSave, onClose, saving }: { client: any; scannedData?: any; onSave: (data: any) => void; onClose: () => void; saving: boolean }) {
  const [form, setForm] = useState({
    type: scannedData?.clientType || client?.type || "PERSON",
    firstName: scannedData?.firstName || client?.firstName || "",
    lastName: scannedData?.lastName || client?.lastName || "",
    tckn: scannedData?.tckn || client?.tckn || "",
    gender: client?.gender || "",
    companyName: scannedData?.companyName || client?.companyName || client?.name || "",
    vkn: scannedData?.vkn || client?.vkn || "",
    taxOffice: scannedData?.taxOffice || client?.taxOffice || "",
    canCollect: scannedData?.canCollect ?? client?.canCollect ?? true,
    canWaive: scannedData?.canWaive ?? client?.canWaive ?? false,
    canSettle: scannedData?.canSettle ?? client?.canSettle ?? false,
    canRelease: scannedData?.canRelease ?? client?.canRelease ?? false,
    notes: client?.notes || "",
    // Vekaletname bilgileri
    poaNumber: scannedData?.poaNumber || "",
    poaDate: scannedData?.poaDate || "",
    notaryName: scannedData?.notaryName || "",
    notaryCity: scannedData?.notaryCity || "",
    // Tebrik alanları
    birthDate: client?.birthDate ? client.birthDate.split("T")[0] : "",
    foundingDate: client?.foundingDate ? client.foundingDate.split("T")[0] : "",
    poaStartDate: client?.poaStartDate ? client.poaStartDate.split("T")[0] : "",
    sendBirthdayGreeting: client?.sendBirthdayGreeting ?? true,
    sendAnniversaryGreeting: client?.sendAnniversaryGreeting ?? true,
    sendHolidayGreeting: client?.sendHolidayGreeting ?? true,
    greetingChannel: client?.greetingChannel || "EMAIL",
  });
  
  // Çoklu iletişim bilgileri
  const [phones, setPhones] = useState<{value: string; type: string; label: string; isPrimary: boolean}[]>([
    { value: "", type: "MOBILE", label: "", isPrimary: true }
  ]);
  const [emails, setEmails] = useState<{value: string; label: string; isPrimary: boolean}[]>([
    { value: "", label: "", isPrimary: true }
  ]);
  // Eksik iletişim (telefon/e-posta) modalı: kaydı engellemez, ama görev üretimi öncesi sorar.
  const [missingContact, setMissingContact] = useState<string[] | null>(null);
  const firstPhoneRef = useRef<HTMLInputElement>(null);
  const [addresses, setAddresses] = useState<{street: string; city: string; district: string; region: string; label: string; isPrimary: boolean}[]>([
    { street: "", city: "", district: "", region: "", label: "", isPrimary: true }
  ]);

  useEffect(() => {
    if (scannedData) {
      // Taranmış veri varsa onu kullan
      setForm(prev => ({
        ...prev,
        type: scannedData.clientType || prev.type,
        firstName: scannedData.firstName || prev.firstName,
        lastName: scannedData.lastName || prev.lastName,
        tckn: scannedData.tckn || prev.tckn,
        companyName: scannedData.companyName || prev.companyName,
        vkn: scannedData.vkn || prev.vkn,
        taxOffice: scannedData.taxOffice || prev.taxOffice,
        canCollect: scannedData.canCollect ?? prev.canCollect,
        canWaive: scannedData.canWaive ?? prev.canWaive,
        canSettle: scannedData.canSettle ?? prev.canSettle,
        canRelease: scannedData.canRelease ?? prev.canRelease,
        poaNumber: scannedData.poaNumber || prev.poaNumber,
        poaDate: scannedData.poaDate || prev.poaDate,
        notaryName: scannedData.notaryName || prev.notaryName,
        notaryCity: scannedData.notaryCity || prev.notaryCity,
      }));
      // Adres bilgilerini de güncelle
      if (scannedData.address || scannedData.city) {
        setAddresses([{
          street: scannedData.address || "",
          city: scannedData.city || "",
          district: scannedData.district || "",
          region: "",
          label: "",
          isPrimary: true
        }]);
      }
      if (scannedData.phone) {
        setPhones([{ value: scannedData.phone, type: "MOBILE", label: "", isPrimary: true }]);
      }
      if (scannedData.email) {
        setEmails([{ value: scannedData.email, label: "", isPrimary: true }]);
      }
    } else if (client) {
      const nameParts = client.name?.split(" ") || [];
      // İlk aktif vekaletten bilgileri al
      const activePoa = client.powerOfAttorneys?.find((p: any) => p.status === 'ACTIVE') || client.powerOfAttorneys?.[0];
      setForm(prev => ({
        ...prev,
        type: client.type || "PERSON",
        firstName: client.firstName || nameParts.slice(0, -1).join(" ") || "",
        lastName: client.lastName || nameParts.slice(-1)[0] || "",
        tckn: client.tckn || (client.type !== "COMPANY" && client.type !== "PUBLIC" ? client.identityNo || "" : ""),
        gender: client.gender || "",
        companyName: client.companyName || (client.type === "COMPANY" || client.type === "PUBLIC" ? client.name || "" : ""),
        vkn: client.vkn || (client.type === "COMPANY" || client.type === "PUBLIC" ? client.identityNo || "" : ""),
        taxOffice: client.taxOffice || "",
        canCollect: client.canCollect ?? activePoa?.canCollect ?? true,
        canWaive: client.canWaive ?? activePoa?.canWaive ?? false,
        canSettle: client.canSettle ?? activePoa?.canSettle ?? false,
        canRelease: client.canRelease ?? activePoa?.canRelease ?? false,
        notes: client.notes || "",
        // Vekaletname bilgileri - POA tablosundan
        poaNumber: activePoa?.journalNo || activePoa?.poaNumber || "",
        poaDate: activePoa?.dateIssued ? activePoa.dateIssued.split("T")[0] : "",
        notaryName: activePoa?.notaryName || "",
        notaryCity: activePoa?.notaryCity || "",
        // Tebrik alanları
        birthDate: client.birthDate ? client.birthDate.split("T")[0] : "",
        foundingDate: client.foundingDate ? client.foundingDate.split("T")[0] : "",
        poaStartDate: client.poaStartDate ? client.poaStartDate.split("T")[0] : "",
        sendBirthdayGreeting: client.sendBirthdayGreeting ?? true,
        sendAnniversaryGreeting: client.sendAnniversaryGreeting ?? true,
        sendHolidayGreeting: client.sendHolidayGreeting ?? true,
        greetingChannel: client.greetingChannel || "EMAIL",
      }));
      
      // Contacts'tan telefon ve email ayır
      const phoneContacts = client.contacts?.filter((c: any) => c.type !== 'EMAIL') || [];
      const emailContacts = client.contacts?.filter((c: any) => c.type === 'EMAIL') || [];
      
      setPhones(phoneContacts.length > 0 
        ? phoneContacts.map((c: any) => ({ value: c.value, type: c.type, label: c.label || "", isPrimary: c.isPrimary }))
        : [{ value: client.phone || "", type: "MOBILE", label: "", isPrimary: true }]
      );
      setEmails(emailContacts.length > 0
        ? emailContacts.map((c: any) => ({ value: c.value, label: c.label || "", isPrimary: c.isPrimary }))
        : [{ value: client.email || "", label: "", isPrimary: true }]
      );
      setAddresses([{ 
        street: client.address || "", 
        city: client.city || "", 
        district: client.district || "", 
        region: client.region || "", 
        label: "", 
        isPrimary: true 
      }]);
    }
  }, [client]);

  const buildPayload = () => {
    const validPhones = phones.filter(p => p.value.trim());
    const validEmails = emails.filter(e => e.value.trim());
    const validAddresses = addresses.filter(a => a.street.trim() || a.city.trim());
    return {
      ...form,
      phones: validPhones,
      emails: validEmails,
      addresses: validAddresses,
      // Geriye uyumluluk için birincil değerleri de gönder
      phone: validPhones.find(p => p.isPrimary)?.value || validPhones[0]?.value,
      email: validEmails.find(e => e.isPrimary)?.value || validEmails[0]?.value,
      address: validAddresses.find(a => a.isPrimary)?.street || validAddresses[0]?.street,
      city: validAddresses.find(a => a.isPrimary)?.city || validAddresses[0]?.city,
      district: validAddresses.find(a => a.isPrimary)?.district || validAddresses[0]?.district,
      region: validAddresses.find(a => a.isPrimary)?.region || validAddresses[0]?.region,
      // Vekaletname bilgileri
      poaNumber: form.poaNumber,
      poaDate: form.poaDate,
      notaryName: form.notaryName,
      notaryCity: form.notaryCity,
    };
  };

  // Eksik telefon/e-posta listesi (kaydetmeden önce uyarı için; kaydı engellemez)
  const computeMissing = (): string[] => {
    const missing: string[] = [];
    if (phones.filter(p => p.value.trim()).length === 0) missing.push("telefon");
    if (emails.filter(e => e.value.trim()).length === 0) missing.push("e-posta");
    return missing;
  };

  const doSave = () => onSave(buildPayload());

  const handleSubmit = () => {
    if (form.type === "PERSON" || form.type === "INDIVIDUAL") {
      if (!form.firstName || !form.lastName) { alert("Ad ve Soyad zorunludur"); return; }
      if (!form.tckn || form.tckn.length !== 11) { alert("TCKN 11 haneli olmalıdır"); return; }
    } else {
      if (!form.companyName) { alert("Kurum adı zorunludur"); return; }
      if (!form.vkn || form.vkn.length !== 10) { alert("VKN 10 haneli olmalıdır"); return; }
    }
    // Telefon/e-posta eksikse SOR — ama yalnız İLK KEZ. Müvekkil zaten takipteyse (ACTIVE)
    // veya vazgeçilmişse (WAIVED) modal tekrar çıkmaz (başka alan düzenlerken bezdirmesin);
    // backend (PR-1) rozeti/görevi zaten koruyor. Yeni müvekkilde status null → modal çıkar.
    const tracked = client?.contactFollowUpStatus === "ACTIVE" || client?.contactFollowUpStatus === "WAIVED";
    const missing = computeMissing();
    if (missing.length > 0 && !tracked) { setMissingContact(missing); return; }
    doSave();
  };

  const isPerson = form.type === "PERSON" || form.type === "INDIVIDUAL";
  
  // Telefon ekleme/silme
  const addPhone = () => setPhones([...phones, { value: "", type: "MOBILE", label: "", isPrimary: false }]);
  const removePhone = (idx: number) => {
    const updated = phones.filter((_, i) => i !== idx);
    if (updated.length > 0 && !updated.some(p => p.isPrimary)) updated[0].isPrimary = true;
    setPhones(updated.length > 0 ? updated : [{ value: "", type: "MOBILE", label: "", isPrimary: true }]);
  };
  const updatePhone = (idx: number, field: string, value: any) => {
    const updated = [...phones];
    if (field === 'isPrimary' && value) updated.forEach((p, i) => p.isPrimary = i === idx);
    else (updated[idx] as any)[field] = value;
    setPhones(updated);
  };
  
  // Email ekleme/silme
  const addEmail = () => setEmails([...emails, { value: "", label: "", isPrimary: false }]);
  const removeEmail = (idx: number) => {
    const updated = emails.filter((_, i) => i !== idx);
    if (updated.length > 0 && !updated.some(e => e.isPrimary)) updated[0].isPrimary = true;
    setEmails(updated.length > 0 ? updated : [{ value: "", label: "", isPrimary: true }]);
  };
  const updateEmail = (idx: number, field: string, value: any) => {
    const updated = [...emails];
    if (field === 'isPrimary' && value) updated.forEach((e, i) => e.isPrimary = i === idx);
    else (updated[idx] as any)[field] = value;
    setEmails(updated);
  };
  
  // Adres ekleme/silme
  const addAddress = () => setAddresses([...addresses, { street: "", city: "", district: "", region: "", label: "", isPrimary: false }]);
  const removeAddress = (idx: number) => {
    const updated = addresses.filter((_, i) => i !== idx);
    if (updated.length > 0 && !updated.some(a => a.isPrimary)) updated[0].isPrimary = true;
    setAddresses(updated.length > 0 ? updated : [{ street: "", city: "", district: "", region: "", label: "", isPrimary: true }]);
  };
  const updateAddress = (idx: number, field: string, value: any) => {
    const updated = [...addresses];
    if (field === 'isPrimary' && value) updated.forEach((a, i) => a.isPrimary = i === idx);
    else (updated[idx] as any)[field] = value;
    setAddresses(updated);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white">
          <h3 className="font-semibold">{client ? "Müvekkil Düzenle" : "Yeni Müvekkil"}</h3>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        
        <div className="p-4 space-y-4">
          {/* Tür Seçimi */}
          <div>
            <label className="block text-sm font-medium mb-2">Müvekkil Türü</label>
            <div className="flex gap-2">
              {CLIENT_TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => setForm({...form, type: t.value})}
                  className={`flex items-center gap-2 px-3 py-2 rounded border ${form.type === t.value ? 'border-primary bg-primary/5' : 'border-gray-200'}`}>
                  <t.icon className="h-4 w-4" />
                  <span className="text-sm">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Şahıs Alanları */}
          {isPerson && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Ad <span className="text-red-500">*</span></label>
                <input value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Soyad <span className="text-red-500">*</span></label>
                <input value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">TCKN <span className="text-red-500">*</span></label>
                <input value={form.tckn} onChange={e => setForm({...form, tckn: e.target.value.replace(/\D/g, "")})} maxLength={11} className="w-full border rounded px-2 py-1.5 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Cinsiyet</label>
                <select value={form.gender} onChange={e => setForm({...form, gender: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm">
                  <option value="">Seçiniz</option>
                  <option value="E">Erkek</option>
                  <option value="K">Kadın</option>
                </select>
              </div>
            </div>
          )}

          {/* Kurum Alanları */}
          {!isPerson && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium mb-1">Kurum Adı <span className="text-red-500">*</span></label>
                <input value={form.companyName} onChange={e => setForm({...form, companyName: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">VKN <span className="text-red-500">*</span></label>
                <input value={form.vkn} onChange={e => setForm({...form, vkn: e.target.value.replace(/\D/g, "")})} maxLength={10} className="w-full border rounded px-2 py-1.5 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Vergi Dairesi</label>
                <input value={form.taxOffice} onChange={e => setForm({...form, taxOffice: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
            </div>
          )}

          {/* Telefonlar */}
          <div className="border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">Telefonlar</label>
              <button type="button" onClick={addPhone} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                <Plus className="h-3 w-3" /> Ekle
              </button>
            </div>
            <div className="space-y-2">
              {phones.map((phone, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select value={phone.type} onChange={e => updatePhone(idx, 'type', e.target.value)} className="border rounded px-2 py-1 text-xs w-24">
                    <option value="MOBILE">Cep</option>
                    <option value="HOME_PHONE">Ev</option>
                    <option value="WORK_PHONE">İş</option>
                    <option value="FAX">Faks</option>
                  </select>
                  <input ref={idx === 0 ? firstPhoneRef : undefined} value={phone.value} onChange={e => updatePhone(idx, 'value', e.target.value)} placeholder="05XX XXX XX XX" className="flex-1 border rounded px-2 py-1 text-sm" />
                  <input value={phone.label} onChange={e => updatePhone(idx, 'label', e.target.value)} placeholder="Etiket" className="w-20 border rounded px-2 py-1 text-xs" />
                  <label className="flex items-center gap-1 cursor-pointer" title="Birincil">
                    <input type="radio" name="primaryPhone" checked={phone.isPrimary} onChange={() => updatePhone(idx, 'isPrimary', true)} className="w-3 h-3" />
                    <span className="text-xs">1.</span>
                  </label>
                  {phones.length > 1 && <button type="button" onClick={() => removePhone(idx)} className="text-red-500 hover:text-red-700 p-1"><X className="h-3 w-3" /></button>}
                </div>
              ))}
            </div>
          </div>

          {/* E-postalar */}
          <div className="border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">E-postalar</label>
              <button type="button" onClick={addEmail} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                <Plus className="h-3 w-3" /> Ekle
              </button>
            </div>
            <div className="space-y-2">
              {emails.map((email, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input type="email" value={email.value} onChange={e => updateEmail(idx, 'value', e.target.value)} placeholder="ornek@email.com" className="flex-1 border rounded px-2 py-1 text-sm" />
                  <input value={email.label} onChange={e => updateEmail(idx, 'label', e.target.value)} placeholder="Etiket" className="w-20 border rounded px-2 py-1 text-xs" />
                  <label className="flex items-center gap-1 cursor-pointer" title="Birincil">
                    <input type="radio" name="primaryEmail" checked={email.isPrimary} onChange={() => updateEmail(idx, 'isPrimary', true)} className="w-3 h-3" />
                    <span className="text-xs">1.</span>
                  </label>
                  {emails.length > 1 && <button type="button" onClick={() => removeEmail(idx)} className="text-red-500 hover:text-red-700 p-1"><X className="h-3 w-3" /></button>}
                </div>
              ))}
            </div>
          </div>

          {/* Adresler */}
          <div className="border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">Adresler</label>
              <button type="button" onClick={addAddress} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                <Plus className="h-3 w-3" /> Ekle
              </button>
            </div>
            <div className="space-y-3">
              {addresses.map((addr, idx) => (
                <div key={idx} className={`p-2 rounded border ${addr.isPrimary ? 'border-primary bg-primary/5' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <input value={addr.label} onChange={e => updateAddress(idx, 'label', e.target.value)} placeholder="Etiket (Ev, İş...)" className="w-28 border rounded px-2 py-0.5 text-xs" />
                      <label className="flex items-center gap-1 cursor-pointer text-xs">
                        <input type="radio" name="primaryAddress" checked={addr.isPrimary} onChange={() => updateAddress(idx, 'isPrimary', true)} className="w-3 h-3" />
                        Birincil
                      </label>
                    </div>
                    {addresses.length > 1 && <button type="button" onClick={() => removeAddress(idx)} className="text-red-500 hover:text-red-700 p-1"><X className="h-3 w-3" /></button>}
                  </div>
                  <textarea value={addr.street} onChange={e => updateAddress(idx, 'street', e.target.value)} placeholder="Adres" rows={2} className="w-full border rounded px-2 py-1 text-sm mb-2" />
                  <div className="grid grid-cols-3 gap-2">
                    <input value={addr.city} onChange={e => updateAddress(idx, 'city', e.target.value)} placeholder="İl" className="border rounded px-2 py-1 text-xs" />
                    <input value={addr.district} onChange={e => updateAddress(idx, 'district', e.target.value)} placeholder="İlçe" className="border rounded px-2 py-1 text-xs" />
                    <input value={addr.region} onChange={e => updateAddress(idx, 'region', e.target.value)} placeholder="İcra Bölgesi" className="border rounded px-2 py-1 text-xs" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Vekaletname Bilgileri */}
          <div className="border rounded-lg p-3 bg-blue-50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-blue-800">Vekaletname Bilgileri</p>
              {scannedData && (
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs flex items-center gap-1">
                  ✓ Taramadan alındı - Kaydet&apos;e basınca vekalet de oluşturulacak
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block text-xs font-medium mb-1">Yevmiye No</label>
                <input value={form.poaNumber} onChange={e => setForm({...form, poaNumber: e.target.value})} placeholder="12345" className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Tarih</label>
                <input type="date" value={form.poaDate} onChange={e => setForm({...form, poaDate: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Noter Adı</label>
                <input value={form.notaryName} onChange={e => setForm({...form, notaryName: e.target.value})} placeholder="1. Noter" className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Noter İli</label>
                <input value={form.notaryCity} onChange={e => setForm({...form, notaryCity: e.target.value})} placeholder="İstanbul" className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
            </div>
            {scannedData?.isLimited && (
              <div className="mt-2 p-2 bg-amber-100 rounded text-xs text-amber-800">
                ⚠️ Süreli vekalet tespit edildi: {scannedData.validUntil ? new Date(scannedData.validUntil).toLocaleDateString("tr-TR") + "'e kadar geçerli" : "Bitiş tarihi belirtilmemiş"}
              </div>
            )}
          </div>

          {/* Yetkiler */}
          <div className="p-3 bg-amber-50 rounded border border-amber-200">
            <p className="text-xs font-medium text-amber-800 mb-2">Vekaletname Yetkileri</p>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.canCollect} onChange={e => setForm({...form, canCollect: e.target.checked})} className="w-4 h-4 rounded" />
                <span className="text-sm">Ahzu Kabza</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.canWaive} onChange={e => setForm({...form, canWaive: e.target.checked})} className="w-4 h-4 rounded" />
                <span className="text-sm">Feragat</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.canSettle} onChange={e => setForm({...form, canSettle: e.target.checked})} className="w-4 h-4 rounded" />
                <span className="text-sm">Sulh</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.canRelease} onChange={e => setForm({...form, canRelease: e.target.checked})} className="w-4 h-4 rounded" />
                <span className="text-sm">İbra</span>
              </label>
            </div>
          </div>

          {/* Özel Günler & Tebrik Ayarları */}
          <div className="border rounded-lg p-3 bg-green-50">
            <p className="text-xs font-medium text-green-800 mb-2">🎂 Özel Günler & Tebrik Ayarları</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {isPerson ? (
                <div>
                  <label className="block text-xs font-medium mb-1">Doğum Tarihi</label>
                  <input type="date" value={form.birthDate} onChange={e => setForm({...form, birthDate: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium mb-1">Kuruluş Tarihi</label>
                  <input type="date" value={form.foundingDate} onChange={e => setForm({...form, foundingDate: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium mb-1">Vekalet Başlangıcı</label>
                <input type="date" value={form.poaStartDate} onChange={e => setForm({...form, poaStartDate: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Tebrik Kanalı</label>
                <select value={form.greetingChannel} onChange={e => setForm({...form, greetingChannel: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm">
                  <option value="EMAIL">E-posta</option>
                  <option value="SMS">SMS</option>
                  <option value="BOTH">Her İkisi</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              {isPerson && (
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={form.sendBirthdayGreeting} onChange={e => setForm({...form, sendBirthdayGreeting: e.target.checked})} className="w-4 h-4 rounded" />
                  <span className="text-sm">Doğum günü tebriği</span>
                </label>
              )}
              {!isPerson && (
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={form.sendAnniversaryGreeting} onChange={e => setForm({...form, sendAnniversaryGreeting: e.target.checked})} className="w-4 h-4 rounded" />
                  <span className="text-sm">Kuruluş yıldönümü tebriği</span>
                </label>
              )}
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.sendAnniversaryGreeting} onChange={e => setForm({...form, sendAnniversaryGreeting: e.target.checked})} className="w-4 h-4 rounded" />
                <span className="text-sm">Vekalet yıldönümü tebriği</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.sendHolidayGreeting} onChange={e => setForm({...form, sendHolidayGreeting: e.target.checked})} className="w-4 h-4 rounded" />
                <span className="text-sm">Bayram tebriği</span>
              </label>
            </div>
          </div>

          {/* Notlar */}
          <div>
            <label className="block text-xs font-medium mb-1">Notlar</label>
            <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">İptal</button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50">
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>

      {/* Eksik iletişim modalı: kaydı engellemez; "Bilgileri Ekle" forma döner, "Eksik Kaydet" görev üretir */}
      {missingContact && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setMissingContact(null)}>
          <div className="bg-white rounded-lg w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-base">Eksik iletişim bilgisi</h3>
            <p className="text-sm text-muted-foreground">
              Müvekkilin <span className="font-medium text-foreground">{missingContact.join(" ve ")}</span> bilgisi bulunamadı.
              Şimdi eklemek ister misiniz? Eklemezseniz kayıt yapılır ve "iletişim bilgilerini tamamla" görevi oluşturulur.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { setMissingContact(null); setTimeout(() => firstPhoneRef.current?.focus(), 50); }}
                className="w-full px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary/90"
              >
                Bilgileri Ekle
              </button>
              <button
                onClick={() => { setMissingContact(null); doSave(); }}
                disabled={saving}
                className="w-full px-4 py-2 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Eksik Kaydet ve Görev Oluştur
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// E-posta Gönderme Modal
function SendEmailModal({ client, onClose }: { client: any; onClose: () => void }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState("GENEL_BILGILENDIRME");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const res = await api.get("/client-notifications/templates");
      setTemplates(res.data || []);
    } catch (e) {
      console.error("Şablonlar yüklenemedi:", e);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      // Değişkenleri değiştir
      let subjectText = template.subject || "";
      let bodyText = template.body || "";
      
      const clientName = client.displayName || client.name || `${client.firstName || ""} ${client.lastName || ""}`.trim();
      
      subjectText = subjectText.replace(/\{\{clientName\}\}/g, clientName);
      bodyText = bodyText.replace(/\{\{clientName\}\}/g, clientName);
      
      setSubject(subjectText);
      setBody(bodyText);
      setType(template.category === "MASRAF" ? "MASRAF_ISTEK" : "GENEL_BILGILENDIRME");
    }
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      alert("Konu ve içerik zorunludur");
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const res = await api.post("/client-notifications/send-email", {
        clientId: client.id,
        type,
        subject,
        body,
        templateId: selectedTemplate || undefined,
      });
      setResult({ success: true, message: `E-posta gönderildi: ${res.data?.recipient}` });
    } catch (e: any) {
      setResult({ success: false, message: e.response?.data?.message || e.message || "Gönderim hatası" });
    } finally {
      setSending(false);
    }
  };

  const clientName = client.displayName || client.name || `${client.firstName || ""} ${client.lastName || ""}`.trim();
  const clientEmail = client.email || client.contacts?.find((c: any) => c.type === "EMAIL")?.value;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-xl max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Mail className="h-5 w-5 text-green-500" />
              E-posta Gönder
            </h3>
            <p className="text-sm text-muted-foreground">{clientName} - {clientEmail || "E-posta yok"}</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="p-4 space-y-4">
          {!clientEmail && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
              ⚠️ Bu müvekkilin e-posta adresi tanımlı değil. Lütfen önce müvekkil bilgilerini güncelleyin.
            </div>
          )}

          {/* Şablon Seçimi */}
          <div>
            <label className="block text-sm font-medium mb-1">Şablon (Opsiyonel)</label>
            <select
              value={selectedTemplate}
              onChange={e => handleTemplateChange(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">Şablon seçin veya manuel yazın</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Bildirim Türü */}
          <div>
            <label className="block text-sm font-medium mb-1">Bildirim Türü</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="GENEL_BILGILENDIRME">Genel Bilgilendirme</option>
              <option value="MASRAF_ISTEK">Masraf Talebi</option>
              <option value="RAPOR">Rapor</option>
              <option value="HATIRLATMA">Hatırlatma</option>
              <option value="DIGER">Diğer</option>
            </select>
          </div>

          {/* Konu */}
          <div>
            <label className="block text-sm font-medium mb-1">Konu <span className="text-red-500">*</span></label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="E-posta konusu"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          {/* İçerik */}
          <div>
            <label className="block text-sm font-medium mb-1">İçerik <span className="text-red-500">*</span></label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="E-posta içeriği (HTML desteklenir)"
              rows={8}
              className="w-full border rounded px-3 py-2 text-sm font-mono"
            />
          </div>

          {/* Sonuç */}
          {result && (
            <div className={`p-3 rounded text-sm ${result.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {result.message}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">
            Kapat
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !clientEmail}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Gönderiliyor..." : "Gönder"}
          </button>
        </div>
      </div>
    </div>
  );
}


// SMS Gönderme Modal
function SendSmsModal({ client, onClose }: { client: any; onClose: () => void }) {
  const [body, setBody] = useState("");
  const [type, setType] = useState("GENEL_BILGILENDIRME");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSend = async () => {
    if (!body.trim()) {
      alert("Mesaj içeriği zorunludur");
      return;
    }

    if (body.length > 160) {
      if (!confirm(`Mesaj 160 karakterden uzun (${body.length} karakter). Birden fazla SMS olarak gönderilecek. Devam etmek istiyor musunuz?`)) {
        return;
      }
    }

    setSending(true);
    setResult(null);

    try {
      const res = await api.post("/client-notifications/send-sms", {
        clientId: client.id,
        type,
        body,
      });
      setResult({ success: true, message: `SMS gönderildi: ${res.data?.recipient}` });
    } catch (e: any) {
      setResult({ success: false, message: e.response?.data?.message || e.message || "Gönderim hatası" });
    } finally {
      setSending(false);
    }
  };

  const clientName = client.displayName || client.name || `${client.firstName || ""} ${client.lastName || ""}`.trim();
  const clientPhone = client.phone || client.contacts?.find((c: any) => c.type === "MOBILE")?.value;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-purple-500" />
              SMS Gönder
            </h3>
            <p className="text-sm text-muted-foreground">{clientName} - {clientPhone || "Telefon yok"}</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="p-4 space-y-4">
          {!clientPhone && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
              ⚠️ Bu müvekkilin telefon numarası tanımlı değil. Lütfen önce müvekkil bilgilerini güncelleyin.
            </div>
          )}

          {/* Bildirim Türü */}
          <div>
            <label className="block text-sm font-medium mb-1">Bildirim Türü</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="GENEL_BILGILENDIRME">Genel Bilgilendirme</option>
              <option value="MASRAF_ISTEK">Masraf Talebi</option>
              <option value="HATIRLATMA">Hatırlatma</option>
              <option value="DIGER">Diğer</option>
            </select>
          </div>

          {/* Mesaj */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Mesaj <span className="text-red-500">*</span>
              <span className={`float-right text-xs ${body.length > 160 ? "text-orange-500" : "text-gray-400"}`}>
                {body.length}/160
              </span>
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="SMS mesajı yazın..."
              rows={4}
              className="w-full border rounded px-3 py-2 text-sm"
            />
            {body.length > 160 && (
              <p className="text-xs text-orange-500 mt-1">
                ⚠️ 160 karakterden uzun mesajlar birden fazla SMS olarak gönderilir ({Math.ceil(body.length / 160)} SMS)
              </p>
            )}
          </div>

          {/* Sonuç */}
          {result && (
            <div className={`p-3 rounded text-sm ${result.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {result.message}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">
            Kapat
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !clientPhone}
            className="px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Gönderiliyor..." : "Gönder"}
          </button>
        </div>
      </div>
    </div>
  );
}


// Import Modal
function ImportClientsModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: { row: number; message: string }[] } | null>(null);

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get("/export-import/clients/template", { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "muvekkil_sablonu.xlsx";
      link.click();
    } catch (e) { alert("Şablon indirilemedi"); }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post("/export-import/clients/import", formData);

      setResult(res.data);
      if (res.data.success > 0) {
        setTimeout(() => onSuccess(), 2000);
      }
    } catch (e: any) {
      setResult({ success: 0, errors: [{ row: 0, message: e.response?.data?.message || e.message || "İçe aktarma hatası" }] });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-500" />
            Excel'den Müvekkil İçe Aktar
          </h3>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Şablon İndirme */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm text-blue-800 mb-2">📋 Önce şablonu indirin ve doldurun:</p>
            <button onClick={handleDownloadTemplate} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
              <Download className="h-4 w-4" /> Şablon İndir
            </button>
          </div>

          {/* Dosya Seçimi */}
          <div>
            <label className="block text-sm font-medium mb-2">Excel Dosyası Seçin</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
            {file && <p className="text-xs text-gray-500 mt-1">Seçilen: {file.name}</p>}
          </div>

          {/* Sonuç */}
          {result && (
            <div className={`p-3 rounded text-sm ${result.success > 0 ? "bg-green-50" : "bg-red-50"}`}>
              {result.success > 0 && (
                <p className="text-green-700 font-medium">✓ {result.success} müvekkil başarıyla eklendi</p>
              )}
              {result.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-red-700 font-medium">Hatalar ({result.errors.length}):</p>
                  <ul className="text-red-600 text-xs mt-1 max-h-32 overflow-auto">
                    {result.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>Satır {err.row}: {err.message}</li>
                    ))}
                    {result.errors.length > 10 && <li>... ve {result.errors.length - 10} hata daha</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Kapat</button>
          <button
            onClick={handleImport}
            disabled={!file || importing}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {importing ? "İçe Aktarılıyor..." : "İçe Aktar"}
          </button>
        </div>
      </div>
    </div>
  );
}


// Müvekkil Vekaletleri Modal
function ClientPoaModal({ client, onClose }: { client: any; onClose: () => void }) {
  const [poas, setPoas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lawyers, setLawyers] = useState<any[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [form, setForm] = useState({
    notaryName: "",
    notaryCity: "",
    journalNo: "",
    poaNumber: "",
    dateIssued: "",
    isLimited: false,
    validUntil: "",
    scopeType: "GENEL",
    scopeDescription: "",
    canCollect: true,
    canWaive: false,
    canSettle: false,
    canRelease: false,
    lawyerIds: [] as string[],
  });

  useEffect(() => {
    loadPoas();
    loadLawyers();
  }, [client.id]);

  const loadPoas = async () => {
    try {
      const res = await api.get(`/poa/client/${client.id}`);
      setPoas(res.data || []);
    } catch (e) {
      console.error("Vekaletler yüklenemedi:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadLawyers = async () => {
    try {
      const res = await api.get("/lawyers");
      setLawyers(res.data?.data || res.data || []);
    } catch (e) {
      console.error("Avukatlar yüklenemedi:", e);
    }
  };

  const handleSave = async () => {
    if (!form.journalNo && !form.poaNumber) {
      alert("Yevmiye No veya Vekalet No zorunludur");
      return;
    }
    if (form.isLimited && !form.validUntil) {
      alert("Süreli vekalet için geçerlilik bitiş tarihi zorunludur");
      return;
    }

    setSaving(true);
    try {
      const poaRes = await api.post("/poa", {
        clientId: client.id,
        ...form,
        dateIssued: form.dateIssued ? new Date(form.dateIssued) : undefined,
        validUntil: form.validUntil ? new Date(form.validUntil) : undefined,
      });
      // PR-2a: aynı vekalet zaten kayıtlıysa backend yeni açmaz; kullanıcıya bildir.
      if (isPoaDuplicateSuppressed(poaRes)) {
        alert(POA_DUPLICATE_MESSAGE);
      }
      await loadPoas();
      setShowAddForm(false);
      setForm({
        notaryName: "",
        notaryCity: "",
        journalNo: "",
        poaNumber: "",
        dateIssued: "",
        isLimited: false,
        validUntil: "",
        scopeType: "GENEL",
        scopeDescription: "",
        canCollect: true,
        canWaive: false,
        canSettle: false,
        canRelease: false,
        lawyerIds: [],
      });
    } catch (e: any) {
      alert(e.message || "Vekalet eklenemedi");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (poaId: string) => {
    if (!confirm("Bu vekaleti silmek istediğinize emin misiniz?")) return;
    try {
      await api.delete(`/poa/${poaId}`);
      await loadPoas();
    } catch (e: any) {
      alert(e.message || "Silinemedi");
    }
  };

  const handleFileUpload = async (poaId: string, file: File) => {
    setUploading(poaId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.post(`/poa/${poaId}/upload`, formData);
      await loadPoas();
    } catch (e: any) {
      alert(e.message || "Dosya yüklenemedi");
    } finally {
      setUploading(null);
    }
  };

  const handleFileDownload = async (poaId: string, filename: string) => {
    try {
      const res = await api.get(`/poa/${poaId}/download`, { responseType: "blob" });
      const blob = new Blob([res.data]);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename || "vekalet";
      link.click();
    } catch (e: any) {
      alert(e.message || "Dosya indirilemedi");
    }
  };

  const handleFileDelete = async (poaId: string) => {
    if (!confirm("Dosyayı silmek istediğinize emin misiniz?")) return;
    try {
      await api.delete(`/poa/${poaId}/file`);
      await loadPoas();
    } catch (e: any) {
      alert(e.message || "Dosya silinemedi");
    }
  };

  const getStatusBadge = (poa: any) => {
    if (poa.status === "EXPIRED") {
      return <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs flex items-center gap-1"><X className="h-3 w-3" /> Süresi Dolmuş</span>;
    }
    if (poa.status === "REVOKED") {
      return <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">İptal Edilmiş</span>;
    }
    if (poa.isLimited && poa.validUntil) {
      const daysLeft = Math.ceil((new Date(poa.validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 30) {
        return <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {daysLeft} gün kaldı</span>;
      }
      return <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(poa.validUntil).toLocaleDateString("tr-TR")}&apos;e kadar</span>;
    }
    return <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Süresiz</span>;
  };

  const getScopeLabel = (scopeType: string) => {
    switch (scopeType) {
      case "ICRA_TAKIP": return "İcra Takipleri";
      case "BU_DOSYA": return "Bu Dosya İçin";
      case "OZEL": return "Özel Kapsam";
      default: return "Genel";
    }
  };

  const clientName = client.displayName || client.name || `${client.firstName || ""} ${client.lastName || ""}`.trim();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-amber-500" />
              Vekaletler
            </h3>
            <p className="text-sm text-muted-foreground">{clientName}</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="p-4">
          {/* Vekalet Listesi */}
          {loading ? (
            <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
          ) : poas.length === 0 && !showAddForm ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileCheck className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>Henüz vekalet kaydı yok</p>
            </div>
          ) : (
            <div className="space-y-3 mb-4">
              {poas.map(poa => (
                <div key={poa.id} className={`p-3 border rounded-lg ${poa.status === "EXPIRED" ? "bg-red-50 border-red-200" : poa.status === "REVOKED" ? "bg-gray-50" : "bg-white"}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {getStatusBadge(poa)}
                        <span className="text-xs text-gray-500">{getScopeLabel(poa.scopeType)}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-sm">
                        <div>
                          <span className="text-gray-500 text-xs">Yevmiye:</span>
                          <p className="font-medium">{poa.journalNo || poa.poaNumber || "-"}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 text-xs">Tarih:</span>
                          <p>{poa.dateIssued ? new Date(poa.dateIssued).toLocaleDateString("tr-TR") : "-"}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 text-xs">Noter:</span>
                          <p>{poa.notaryName || "-"} {poa.notaryCity && `(${poa.notaryCity})`}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 text-xs">Avukatlar:</span>
                          <p>{poa.lawyers?.map((l: any) => `${l.lawyer?.name} ${l.lawyer?.surname}`).join(", ") || "-"}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        {poa.canCollect && <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">Ahzu Kabza</span>}
                        {poa.canWaive && <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">Feragat</span>}
                        {poa.canSettle && <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">Sulh</span>}
                        {poa.canRelease && <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">İbra</span>}
                      </div>
                      {/* Dosya Yükleme/İndirme */}
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                        {poa.filePath ? (
                          <>
                            <button onClick={() => handleFileDownload(poa.id, `vekalet_${poa.journalNo || poa.poaNumber}.pdf`)} className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                              <Download className="h-3 w-3" /> Dosyayı İndir
                            </button>
                            <button onClick={() => handleFileDelete(poa.id)} className="flex items-center gap-1 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200">
                              <Trash2 className="h-3 w-3" /> Dosyayı Sil
                            </button>
                            <span className="text-xs text-gray-500">({Math.round((poa.fileSize || 0) / 1024)} KB)</span>
                          </>
                        ) : (
                          <label className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 cursor-pointer">
                            {uploading === poa.id ? (
                              <><Loader2 className="h-3 w-3 animate-spin" /> Yükleniyor...</>
                            ) : (
                              <><Upload className="h-3 w-3" /> Dosya Yükle</>
                            )}
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => e.target.files?.[0] && handleFileUpload(poa.id, e.target.files[0])} disabled={uploading === poa.id} />
                          </label>
                        )}
                      </div>
                    </div>
                    <button onClick={() => handleDelete(poa.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Sil">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Yeni Vekalet Formu */}
          {showAddForm ? (
            <div className="border rounded-lg p-4 bg-blue-50">
              <h4 className="font-medium mb-3">Yeni Vekalet Ekle</h4>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Yevmiye No</label>
                  <input value={form.journalNo} onChange={e => setForm({...form, journalNo: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Vekalet No</label>
                  <input value={form.poaNumber} onChange={e => setForm({...form, poaNumber: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Düzenleme Tarihi</label>
                  <input type="date" value={form.dateIssued} onChange={e => setForm({...form, dateIssued: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Kapsam</label>
                  <select value={form.scopeType} onChange={e => setForm({...form, scopeType: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm">
                    <option value="GENEL">Genel</option>
                    <option value="ICRA_TAKIP">İcra Takipleri</option>
                    <option value="BU_DOSYA">Bu Dosya İçin</option>
                    <option value="OZEL">Özel Kapsam</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Noter Adı</label>
                  <input value={form.notaryName} onChange={e => setForm({...form, notaryName: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Noter İli</label>
                  <input value={form.notaryCity} onChange={e => setForm({...form, notaryCity: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium mb-1">Avukatlar</label>
                  <select multiple value={form.lawyerIds} onChange={e => setForm({...form, lawyerIds: Array.from(e.target.selectedOptions, o => o.value)})} className="w-full border rounded px-2 py-1.5 text-sm h-[60px]">
                    {lawyers.map(l => <option key={l.id} value={l.id}>{l.name} {l.surname}</option>)}
                  </select>
                </div>
              </div>
              
              {/* Süreli Vekalet */}
              <div className="flex items-center gap-4 mb-3 p-2 bg-amber-50 rounded">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isLimited} onChange={e => setForm({...form, isLimited: e.target.checked})} className="w-4 h-4 rounded" />
                  <span className="text-sm font-medium">Süreli Vekalet</span>
                </label>
                {form.isLimited && (
                  <div>
                    <label className="text-xs font-medium mr-2">Bitiş Tarihi:</label>
                    <input type="date" value={form.validUntil} onChange={e => setForm({...form, validUntil: e.target.value})} className="border rounded px-2 py-1 text-sm" />
                  </div>
                )}
              </div>

              {/* Yetkiler */}
              <div className="flex flex-wrap gap-4 mb-3">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={form.canCollect} onChange={e => setForm({...form, canCollect: e.target.checked})} className="w-4 h-4 rounded" />
                  <span className="text-sm">Ahzu Kabza</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={form.canWaive} onChange={e => setForm({...form, canWaive: e.target.checked})} className="w-4 h-4 rounded" />
                  <span className="text-sm">Feragat</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={form.canSettle} onChange={e => setForm({...form, canSettle: e.target.checked})} className="w-4 h-4 rounded" />
                  <span className="text-sm">Sulh</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={form.canRelease} onChange={e => setForm({...form, canRelease: e.target.checked})} className="w-4 h-4 rounded" />
                  <span className="text-sm">İbra</span>
                </label>
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">İptal</button>
                <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50">
                  {saving ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddForm(true)} className="w-full py-2 border-2 border-dashed rounded-lg text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-1">
              <Plus className="h-4 w-4" /> Yeni Vekalet Ekle
            </button>
          )}
        </div>

        <div className="flex justify-end p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Kapat</button>
        </div>
      </div>
    </div>
  );
}


// Portal Erişimi Modal
function PortalAccessModal({ client, onClose, onSuccess }: { client: any; onClose: () => void; onSuccess: () => void }) {
  const [email, setEmail] = useState(client.email || "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const handleCreate = async () => {
    if (!email || !password) {
      alert("E-posta ve şifre zorunludur");
      return;
    }
    if (password.length < 6) {
      alert("Şifre en az 6 karakter olmalıdır");
      return;
    }

    setSaving(true);
    try {
      await api.post("/portal/admin/create-user", {
        clientId: client.id,
        email,
        password,
      });
      alert("Portal erişimi başarıyla oluşturuldu");
      onSuccess();
    } catch (e: any) {
      alert(e.message || "Portal erişimi oluşturulamadı");
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    if (!confirm("Portal erişimini kaldırmak istediğinize emin misiniz?")) return;
    
    setDisabling(true);
    try {
      await api.post("/portal/admin/disable-user", { clientId: client.id });
      alert("Portal erişimi kaldırıldı");
      onSuccess();
    } catch (e: any) {
      alert(e.message || "Portal erişimi kaldırılamadı");
    } finally {
      setDisabling(false);
    }
  };

  const clientName = client.displayName || client.name || `${client.firstName || ""} ${client.lastName || ""}`.trim();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Globe className="h-5 w-5 text-cyan-500" />
              Portal Erişimi
            </h3>
            <p className="text-sm text-muted-foreground">{clientName}</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="p-4">
          {client.hasPortalAccess ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Portal erişimi aktif</span>
                </div>
                <p className="text-sm text-green-600 mt-1">
                  Bu müvekkil portala giriş yapabilir.
                </p>
              </div>
              <button
                onClick={handleDisable}
                disabled={disabling}
                className="w-full py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {disabling ? "Kaldırılıyor..." : "Portal Erişimini Kaldır"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Bu müvekkil için portal hesabı oluşturun. Müvekkil bu bilgilerle portala giriş yapabilecek.
              </p>
              <div>
                <label className="block text-sm font-medium mb-1">E-posta</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ornek@email.com"
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Şifre</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="En az 6 karakter"
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="w-full py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 disabled:opacity-50"
              >
                {saving ? "Oluşturuluyor..." : "Portal Erişimi Oluştur"}
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Kapat</button>
        </div>
      </div>
    </div>
  );
}
