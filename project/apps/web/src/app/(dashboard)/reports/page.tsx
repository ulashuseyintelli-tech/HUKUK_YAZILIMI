"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import {
  BarChart3,
  Users,
  AlertTriangle,
  Tag,
  FileText,
  Loader2,
  TrendingUp,
  DollarSign,
} from "lucide-react";

interface DashboardStats {
  totalCases: number;
  activeCases: number;
  closedCases: number;
  totalCollection: number;
  byTakipTuru: { takipTuru: string; count: number }[];
}

interface PersonelReport {
  personel: string;
  personelId: string;
  totalCases: number;
  closedCases: number;
  totalCollection: number;
  closureRate: number;
}

interface RiskSummary {
  risk: string;
  color?: string;
  count: number;
  totalAmount: number;
}

interface CaseListItem {
  id: string;
  fileNumber: string;
  clientName?: string;
  principalAmount?: number;
  caseStatus?: string;
  reportingSummary?: string;
  takipTuru?: string;
  mahiyetTipi?: string;
  risk?: string;
  riskColor?: string;
  durumEtiketi?: string;
  durumColor?: string;
  sorumlu?: string;
  groupCount?: number;
}

interface LookupItem {
  id: string;
  code: string;
  name: string;
  color?: string;
}

interface Filters {
  takipTuruId: string;
  mahiyetTipiId: string;
  riskId: string;
  durumEtiketiId: string;
  sorumluPersonelId: string;
  caseStatus: string;
  search: string;
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [personelReport, setPersonelReport] = useState<PersonelReport[]>([]);
  const [riskReport, setRiskReport] = useState<{ summary: RiskSummary[]; cases: any[] } | null>(null);
  const [durumReport, setDurumReport] = useState<any[]>([]);
  const [caseList, setCaseList] = useState<CaseListItem[]>([]);
  
  // Toplu güncelleme state'leri
  const [selectedCases, setSelectedCases] = useState<Set<string>>(new Set());
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [batchUpdates, setBatchUpdates] = useState({
    riskId: "",
    durumEtiketiId: "",
    sorumluPersonelId: "",
  });
  const [batchLoading, setBatchLoading] = useState(false);
  
  // Filtreleme state'leri
  const [filters, setFilters] = useState<Filters>({
    takipTuruId: "",
    mahiyetTipiId: "",
    riskId: "",
    durumEtiketiId: "",
    sorumluPersonelId: "",
    caseStatus: "",
    search: "",
  });
  const [lookups, setLookups] = useState<{
    takipTuru: LookupItem[];
    mahiyetTipi: LookupItem[];
    risk: LookupItem[];
    durumEtiketi: LookupItem[];
    users: { id: string; name: string; surname: string }[];
  }>({
    takipTuru: [],
    mahiyetTipi: [],
    risk: [],
    durumEtiketi: [],
    users: [],
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadLookups();
  }, []);

  useEffect(() => {
    loadReports();
  }, [activeTab]);

  const loadLookups = async () => {
    try {
      const [takipTuruRes, mahiyetTipiRes, riskRes, durumEtiketiRes, usersRes] = await Promise.all([
        api.get("/lookups/takipTuru"),
        api.get("/lookups/mahiyetTipi"),
        api.get("/lookups/risk"),
        api.get("/lookups/durumEtiketi"),
        api.get("/users"),
      ]);
      setLookups({
        takipTuru: takipTuruRes.data?.data || [],
        mahiyetTipi: mahiyetTipiRes.data?.data || [],
        risk: riskRes.data?.data || [],
        durumEtiketi: durumEtiketiRes.data?.data || [],
        users: usersRes.data?.data || [],
      });
    } catch (error) {
      console.error("Lookup verileri yüklenemedi:", error);
    }
  };

  const loadReports = async () => {
    setLoading(true);
    try {
      if (activeTab === "dashboard") {
        const res = await api.get("/reports/dashboard");
        setDashboardStats(res.data?.data);
      } else if (activeTab === "personel") {
        const res = await api.get("/reports/personel");
        setPersonelReport(res.data?.data || []);
      } else if (activeTab === "risk") {
        const res = await api.get("/reports/risk");
        setRiskReport(res.data?.data);
      } else if (activeTab === "durum") {
        const res = await api.get("/reports/durum-etiketi");
        setDurumReport(res.data?.data || []);
      } else if (activeTab === "dosyalar") {
        await loadCaseList();
      }
    } catch (error) {
      console.error("Rapor yüklenemedi:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadCaseList = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.takipTuruId) params.append("takipTuruId", filters.takipTuruId);
      if (filters.mahiyetTipiId) params.append("mahiyetTipiId", filters.mahiyetTipiId);
      if (filters.riskId) params.append("riskId", filters.riskId);
      if (filters.durumEtiketiId) params.append("durumEtiketiId", filters.durumEtiketiId);
      if (filters.sorumluPersonelId) params.append("sorumluPersonelId", filters.sorumluPersonelId);
      if (filters.caseStatus) params.append("caseStatus", filters.caseStatus);
      if (filters.search) params.append("search", filters.search);
      
      const res = await api.get(`/reports/cases-with-summary?${params.toString()}`);
      setCaseList(res.data?.data || []);
    } catch (error) {
      console.error("Dosya listesi yüklenemedi:", error);
    }
  };

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const applyFilters = async () => {
    setLoading(true);
    await loadCaseList();
    setLoading(false);
  };

  const clearFilters = () => {
    setFilters({
      takipTuruId: "",
      mahiyetTipiId: "",
      riskId: "",
      durumEtiketiId: "",
      sorumluPersonelId: "",
      caseStatus: "",
      search: "",
    });
  };

  const activeFilterCount = Object.values(filters).filter((v) => v !== "").length;

  // Toplu seçim fonksiyonları
  const toggleSelectCase = (id: string) => {
    setSelectedCases((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectAllCases = () => {
    if (selectedCases.size === caseList.length) {
      setSelectedCases(new Set());
    } else {
      setSelectedCases(new Set(caseList.map((c) => c.id)));
    }
  };

  const handleBatchUpdate = async () => {
    if (selectedCases.size === 0) return;
    
    setBatchLoading(true);
    try {
      const updates: any = {};
      if (batchUpdates.riskId) updates.riskId = batchUpdates.riskId;
      if (batchUpdates.durumEtiketiId) updates.durumEtiketiId = batchUpdates.durumEtiketiId;
      if (batchUpdates.sorumluPersonelId) updates.sorumluPersonelId = batchUpdates.sorumluPersonelId;
      
      if (Object.keys(updates).length === 0) {
        alert("Lütfen en az bir alan seçin");
        return;
      }

      await api.post("/cases/batch-update", {
        caseIds: Array.from(selectedCases),
        updates,
      });

      // Başarılı güncelleme sonrası
      setSelectedCases(new Set());
      setShowBatchPanel(false);
      setBatchUpdates({ riskId: "", durumEtiketiId: "", sorumluPersonelId: "" });
      await loadCaseList();
      alert(`${selectedCases.size} dosya başarıyla güncellendi`);
    } catch (error) {
      console.error("Toplu güncelleme hatası:", error);
      alert("Güncelleme sırasında bir hata oluştu");
    } finally {
      setBatchLoading(false);
    }
  };

  const tabs = [
    { id: "dashboard", label: "Genel Bakış", icon: BarChart3 },
    { id: "dosyalar", label: "Dosya Listesi", icon: FileText },
    { id: "personel", label: "Personel Performans", icon: Users },
    { id: "risk", label: "Risk Analizi", icon: AlertTriangle },
    { id: "durum", label: "Durum Etiketleri", icon: Tag },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Raporlar</h1>
        <p className="text-muted-foreground">Dosya ve performans analizleri</p>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 -mb-px transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Dashboard */}
          {activeTab === "dashboard" && dashboardStats && (
            <div className="space-y-6">
              {/* Özet Kartları */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Toplam Dosya</p>
                      <p className="text-2xl font-bold">{dashboardStats.totalCases}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <TrendingUp className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Aktif Dosya</p>
                      <p className="text-2xl font-bold">{dashboardStats.activeCases}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <FileText className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Kapalı Dosya</p>
                      <p className="text-2xl font-bold">{dashboardStats.closedCases}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <DollarSign className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Toplam Tahsilat</p>
                      <p className="text-2xl font-bold">{Number(dashboardStats.totalCollection).toLocaleString("tr-TR")} ₺</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Takip Türü Dağılımı */}
              <div className="bg-white rounded-xl border p-6">
                <h3 className="font-semibold mb-4">Takip Türü Dağılımı</h3>
                <div className="space-y-3">
                  {dashboardStats.byTakipTuru.map((item, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm">{item.takipTuru}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${(item.count / dashboardStats.totalCases) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-12 text-right">{item.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}


          {/* Dosya Listesi - Raporlama Özeti ile */}
          {activeTab === "dosyalar" && (
            <div className="space-y-4">
              {/* Filtreleme Paneli */}
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold">🔍 Filtrele</h3>
                    {activeFilterCount > 0 && (
                      <span className="px-2 py-1 bg-primary text-white text-xs rounded-full">
                        {activeFilterCount} filtre aktif
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {activeFilterCount > 0 && (
                      <button
                        onClick={clearFilters}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Temizle
                      </button>
                    )}
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className="text-sm text-primary hover:underline"
                    >
                      {showFilters ? "Gizle" : "Göster"}
                    </button>
                  </div>
                </div>

                {/* Arama */}
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    placeholder="Dosya no veya müvekkil ara..."
                    value={filters.search}
                    onChange={(e) => handleFilterChange("search", e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                    className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <button
                    onClick={applyFilters}
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm"
                  >
                    Ara
                  </button>
                </div>

                {/* Detaylı Filtreler */}
                {showFilters && (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 pt-4 border-t">
                    <select
                      value={filters.takipTuruId}
                      onChange={(e) => handleFilterChange("takipTuruId", e.target.value)}
                      className="rounded-lg border px-2 py-2 text-sm outline-none focus:border-primary"
                    >
                      <option value="">Takip Türü</option>
                      {lookups.takipTuru.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>

                    <select
                      value={filters.mahiyetTipiId}
                      onChange={(e) => handleFilterChange("mahiyetTipiId", e.target.value)}
                      className="rounded-lg border px-2 py-2 text-sm outline-none focus:border-primary"
                    >
                      <option value="">Mahiyet Tipi</option>
                      {lookups.mahiyetTipi.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>

                    <select
                      value={filters.riskId}
                      onChange={(e) => handleFilterChange("riskId", e.target.value)}
                      className="rounded-lg border px-2 py-2 text-sm outline-none focus:border-primary"
                    >
                      <option value="">Risk Sınıfı</option>
                      {lookups.risk.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>

                    <select
                      value={filters.durumEtiketiId}
                      onChange={(e) => handleFilterChange("durumEtiketiId", e.target.value)}
                      className="rounded-lg border px-2 py-2 text-sm outline-none focus:border-primary"
                    >
                      <option value="">Durum Etiketi</option>
                      {lookups.durumEtiketi.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>

                    <select
                      value={filters.sorumluPersonelId}
                      onChange={(e) => handleFilterChange("sorumluPersonelId", e.target.value)}
                      className="rounded-lg border px-2 py-2 text-sm outline-none focus:border-primary"
                    >
                      <option value="">Sorumlu</option>
                      {lookups.users.map((user) => (
                        <option key={user.id} value={user.id}>{user.name} {user.surname}</option>
                      ))}
                    </select>

                    <select
                      value={filters.caseStatus}
                      onChange={(e) => handleFilterChange("caseStatus", e.target.value)}
                      className="rounded-lg border px-2 py-2 text-sm outline-none focus:border-primary"
                    >
                      <option value="">Statü</option>
                      <option value="DERDEST">Derdest</option>
                      <option value="ISLEMDE">İşlemde</option>
                      <option value="DERKENAR">Derkenar</option>
                      <option value="HITAM">Hitam</option>
                      <option value="INFAZ">İnfaz</option>
                    </select>

                    <button
                      onClick={applyFilters}
                      className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm"
                    >
                      Uygula
                    </button>
                  </div>
                )}
              </div>

              {/* Tablo */}
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="p-4 border-b bg-purple-50 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-purple-800">📊 Dosya Raporlama Özeti</h3>
                    <p className="text-sm text-purple-600">{caseList.length} dosya listeleniyor</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedCases.size > 0 && (
                      <button
                        onClick={() => setShowBatchPanel(true)}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm flex items-center gap-2"
                      >
                        ✏️ Toplu Güncelle ({selectedCases.size})
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        try {
                          const params = new URLSearchParams();
                          if (filters.takipTuruId) params.append("takipTuruId", filters.takipTuruId);
                          if (filters.mahiyetTipiId) params.append("mahiyetTipiId", filters.mahiyetTipiId);
                          if (filters.riskId) params.append("riskId", filters.riskId);
                          if (filters.durumEtiketiId) params.append("durumEtiketiId", filters.durumEtiketiId);
                          if (filters.sorumluPersonelId) params.append("sorumluPersonelId", filters.sorumluPersonelId);
                          if (filters.caseStatus) params.append("caseStatus", filters.caseStatus);
                          
                          const res = await api.get(`/reports/export/cases?${params.toString()}`);
                          const csvData = res.data?.data;
                          
                          // CSV dosyasını indir
                          const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
                          const url = window.URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = `dosya-raporu-${new Date().toISOString().split('T')[0]}.csv`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          window.URL.revokeObjectURL(url);
                        } catch (error) {
                          console.error("Export hatası:", error);
                          alert("Export sırasında bir hata oluştu");
                        }
                      }}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-2"
                    >
                      📥 Excel Export
                    </button>
                  </div>
                </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selectedCases.size === caseList.length && caseList.length > 0}
                          onChange={selectAllCases}
                          className="rounded border-gray-300"
                        />
                      </th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Dosya No</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Müvekkil</th>
                      <th className="text-right px-4 py-3 text-sm font-medium">Ana Para</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Takip Türü</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Mahiyet</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Risk</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Durum</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Sorumlu</th>
                      <th className="text-center px-4 py-3 text-sm font-medium">Grup</th>
                      <th className="text-left px-4 py-3 text-sm font-medium min-w-[250px]">Raporlama Özeti</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {caseList.map((item) => (
                      <tr key={item.id} className={`hover:bg-gray-50 ${selectedCases.has(item.id) ? 'bg-purple-50' : ''}`}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedCases.has(item.id)}
                            onChange={() => toggleSelectCase(item.id)}
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <a href={`/cases/${item.id}`} className="text-primary hover:underline font-medium">
                            {item.fileNumber}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-sm">{item.clientName || "-"}</td>
                        <td className="px-4 py-3 text-right text-sm font-medium">
                          {item.principalAmount ? `${Number(item.principalAmount).toLocaleString("tr-TR")} ₺` : "-"}
                        </td>
                        <td className="px-4 py-3 text-sm">{item.takipTuru || "-"}</td>
                        <td className="px-4 py-3 text-sm">{item.mahiyetTipi || "-"}</td>
                        <td className="px-4 py-3">
                          {item.risk ? (
                            <span 
                              className="px-2 py-1 rounded text-xs font-medium"
                              style={{ 
                                backgroundColor: `${item.riskColor || '#6b7280'}20`,
                                color: item.riskColor || '#6b7280'
                              }}
                            >
                              {item.risk}
                            </span>
                          ) : "-"}
                        </td>
                        <td className="px-4 py-3">
                          {item.durumEtiketi ? (
                            <span 
                              className="px-2 py-1 rounded text-xs font-medium"
                              style={{ 
                                backgroundColor: `${item.durumColor || '#6b7280'}20`,
                                color: item.durumColor || '#6b7280'
                              }}
                            >
                              {item.durumEtiketi}
                            </span>
                          ) : "-"}
                        </td>
                        <td className="px-4 py-3 text-sm">{item.sorumlu || "-"}</td>
                        <td className="px-4 py-3 text-center">
                          {item.groupCount && item.groupCount > 0 ? (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                              {item.groupCount}
                            </span>
                          ) : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-purple-700 bg-purple-50 px-2 py-1 rounded">
                            {item.reportingSummary || "Sınıflandırılmamış"}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {caseList.length === 0 && (
                      <tr>
                        <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                          Henüz dosya yok
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Personel Performans */}
          {activeTab === "personel" && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium">Personel</th>
                    <th className="text-right px-4 py-3 text-sm font-medium">Toplam Dosya</th>
                    <th className="text-right px-4 py-3 text-sm font-medium">Kapatılan</th>
                    <th className="text-right px-4 py-3 text-sm font-medium">Kapama Oranı</th>
                    <th className="text-right px-4 py-3 text-sm font-medium">Tahsilat</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {personelReport.map((item, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{item.personel}</td>
                      <td className="px-4 py-3 text-right">{item.totalCases}</td>
                      <td className="px-4 py-3 text-right">{item.closedCases}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          item.closureRate >= 50 ? 'bg-green-100 text-green-700' :
                          item.closureRate >= 25 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          %{item.closureRate}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {Number(item.totalCollection).toLocaleString("tr-TR")} ₺
                      </td>
                    </tr>
                  ))}
                  {personelReport.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        Henüz veri yok
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Risk Analizi */}
          {activeTab === "risk" && riskReport && (
            <div className="space-y-6">
              {/* Risk Özeti */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {riskReport.summary.map((item, i) => (
                  <div key={i} className="bg-white rounded-xl border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium" style={{ color: item.color }}>{item.risk}</span>
                      <span className="text-2xl font-bold">{item.count}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Toplam: {Number(item.totalAmount).toLocaleString("tr-TR")} ₺
                    </p>
                  </div>
                ))}
              </div>

              {/* Yüksek Riskli Dosyalar */}
              <div className="bg-white rounded-xl border p-6">
                <h3 className="font-semibold mb-4">Risk Skoruna Göre Dosyalar</h3>
                <div className="space-y-2">
                  {riskReport.cases.slice(0, 10).map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <span className="font-medium">{c.fileNumber}</span>
                        <span className="text-sm text-muted-foreground ml-2">{c.asama}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm" style={{ color: c.riskColor }}>{c.risk}</span>
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          (c.riskScore || 0) >= 70 ? 'bg-red-100 text-red-700' :
                          (c.riskScore || 0) >= 40 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {c.riskScore || 0}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Durum Etiketleri */}
          {activeTab === "durum" && (
            <div className="space-y-4">
              {durumReport.map((group, i) => (
                <div key={i} className="bg-white rounded-xl border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: group.color || '#6b7280' }}
                      />
                      <span className="font-medium">{group.durumEtiketi}</span>
                    </div>
                    <span className="text-lg font-bold">{group.count} dosya</span>
                  </div>
                  {group.cases.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {group.cases.slice(0, 5).map((c: any, j: number) => (
                        <div key={j} className="flex items-center justify-between text-sm py-1 border-t">
                          <span>{c.fileNumber}</span>
                          <span className="text-muted-foreground">{c.sorumlu || '-'}</span>
                        </div>
                      ))}
                      {group.cases.length > 5 && (
                        <p className="text-xs text-muted-foreground pt-1">
                          +{group.cases.length - 5} dosya daha
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {durumReport.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Henüz durum etiketi atanmış dosya yok
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Toplu Güncelleme Modal */}
      {showBatchPanel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-lg mb-4">
              ✏️ Toplu Güncelleme ({selectedCases.size} dosya)
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Seçili dosyaların aşağıdaki alanlarını güncelleyebilirsiniz.
              Boş bırakılan alanlar değiştirilmez.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Risk Sınıfı</label>
                <select
                  value={batchUpdates.riskId}
                  onChange={(e) => setBatchUpdates((prev) => ({ ...prev, riskId: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Değiştirme</option>
                  {lookups.risk.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Durum Etiketi</label>
                <select
                  value={batchUpdates.durumEtiketiId}
                  onChange={(e) => setBatchUpdates((prev) => ({ ...prev, durumEtiketiId: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Değiştirme</option>
                  {lookups.durumEtiketi.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Sorumlu Personel</label>
                <select
                  value={batchUpdates.sorumluPersonelId}
                  onChange={(e) => setBatchUpdates((prev) => ({ ...prev, sorumluPersonelId: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Değiştirme</option>
                  {lookups.users.map((user) => (
                    <option key={user.id} value={user.id}>{user.name} {user.surname}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowBatchPanel(false);
                  setBatchUpdates({ riskId: "", durumEtiketiId: "", sorumluPersonelId: "" });
                }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleBatchUpdate}
                disabled={batchLoading}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {batchLoading ? "Güncelleniyor..." : "Güncelle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
