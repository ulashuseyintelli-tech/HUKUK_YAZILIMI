"use client";

import { useState, useEffect } from "react";
import {
  Users,
  Search,
  Phone,
  Mail,
  Building2,
  User,
  Landmark,
  Trash2,
  Edit,
  X,
  Loader2,
  MapPin,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  Debtor,
  DebtorType,
  DebtorTypeLabels,
  DebtorRiskLabels,
  DebtorRiskLevel,
} from "@/types/debtor";
import { NewDebtorModal } from "@/components/debtor/NewDebtorModal";

const PAGE_SIZE = 50; // Sayfa başına gösterilecek kayıt sayısı

type DebtorSortField = "name" | "type" | "identityNo" | "phone" | "caseCount";
type SortDirection = "asc" | "desc" | null;

export default function DebtorsPage() {
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<DebtorType | "ALL">("ALL");
  const [currentPage, setCurrentPage] = useState(1);

  // Sıralama state'leri
  const [sortField, setSortField] = useState<DebtorSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Modal states
  const [showNewModal, setShowNewModal] = useState(false);
  const [newDebtorType, setNewDebtorType] = useState<DebtorType>(DebtorType.INDIVIDUAL);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedDebtor, setSelectedDebtor] = useState<Debtor | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [loadingPublicInstitutions, setLoadingPublicInstitutions] = useState(false);
  const [loadingTestDebtors, setLoadingTestDebtors] = useState(false);

  useEffect(() => {
    fetchDebtors();
  }, []);

  const fetchDebtors = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ data: Debtor[] }>("/debtors?limit=2000");
      setDebtors(res.data?.data || []);
    } catch (e) {
      console.error("Error fetching debtors:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadPublicInstitutionDebtors = async () => {
    try {
      setLoadingPublicInstitutions(true);
      await api.post("/seed/public-institution-debtors");
      // Listeyi yenile
      await fetchDebtors();
    } catch (e: any) {
      console.error("Error loading public institutions:", e);
      alert(e.response?.data?.message || "Kamu kurumları yüklenemedi");
    } finally {
      setLoadingPublicInstitutions(false);
    }
  };

  const loadTestDebtors = async () => {
    try {
      setLoadingTestDebtors(true);
      await api.post("/seed/debtors");
      // Listeyi yenile
      await fetchDebtors();
    } catch (e: any) {
      console.error("Error loading test debtors:", e);
      alert(e.response?.data?.message || "Test borçluları yüklenemedi");
    } finally {
      setLoadingTestDebtors(false);
    }
  };

  const handleDelete = async (debtor: Debtor) => {
    if (!confirm(`"${debtor.name}" borçlusunu silmek istediğinize emin misiniz?`)) return;

    setDeleting(debtor.id);
    try {
      await api.delete(`/debtors/${debtor.id}`);
      setDebtors((prev) => prev.filter((d) => d.id !== debtor.id));
    } catch (e: any) {
      alert(e.message || "Borçlu silinemedi");
    } finally {
      setDeleting(null);
    }
  };


  const handleDebtorClick = async (debtor: Debtor) => {
    try {
      // Detaylı bilgiyi çek
      const res = await api.get<{ data: Debtor }>(`/debtors/${debtor.id}`);
      setSelectedDebtor(res.data?.data || debtor);
      setShowDetailModal(true);
    } catch (e) {
      setSelectedDebtor(debtor);
      setShowDetailModal(true);
    }
  };

  const handleNewDebtorSaved = (debtor: Debtor) => {
    setDebtors((prev) => [debtor, ...prev]);
    setShowNewModal(false);
  };

  const handleDebtorUpdated = (updatedDebtor: Debtor) => {
    setDebtors((prev) => prev.map((d) => (d.id === updatedDebtor.id ? updatedDebtor : d)));
    setSelectedDebtor(updatedDebtor);
  };

  const openNewModal = (type: DebtorType) => {
    setNewDebtorType(type);
    setShowNewModal(true);
  };

  const filtered = debtors.filter((d) => {
    const matchesSearch =
      !search ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.identityNo?.includes(search) ||
      d.phone?.includes(search);
    const matchesType = typeFilter === "ALL" || d.type === typeFilter;
    return matchesSearch && matchesType;
  });

  // Sıralama fonksiyonu
  const handleSort = (field: DebtorSortField) => {
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

  // Sıralanmış liste
  const sortedFiltered = [...filtered].sort((a, b) => {
    if (!sortField || !sortDirection) return 0;
    
    let aValue: any, bValue: any;
    
    if (sortField === "caseCount") {
      aValue = a._count?.caseDebtors || 0;
      bValue = b._count?.caseDebtors || 0;
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
  const SortIcon = ({ field }: { field: DebtorSortField }) => {
    if (sortField !== field) {
      return <ChevronsUpDown className="h-3 w-3 text-gray-400" />;
    }
    if (sortDirection === "asc") {
      return <ChevronUp className="h-3 w-3 text-primary" />;
    }
    return <ChevronDown className="h-3 w-3 text-primary" />;
  };

  // Sayfalama hesaplamaları
  const totalPages = Math.ceil(sortedFiltered.length / PAGE_SIZE);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginatedDebtors = sortedFiltered.slice(startIndex, endIndex);

  // Filtre veya arama değiştiğinde ilk sayfaya dön
  useEffect(() => {
    setCurrentPage(1);
  }, [search, typeFilter]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case DebtorType.COMPANY:
        return <Building2 className="w-4 h-4 text-blue-500" />;
      case DebtorType.PUBLIC_INSTITUTION:
        return <Landmark className="w-4 h-4 text-purple-500" />;
      default:
        return <User className="w-4 h-4 text-emerald-500" />;
    }
  };

  const getTypeLabel = (type: string) => {
    return DebtorTypeLabels[type as DebtorType] || type;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6" /> Borçlular
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => openNewModal(DebtorType.INDIVIDUAL)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
          >
            <User className="h-4 w-4" /> Şahıs Ekle
          </button>
          <button
            onClick={() => openNewModal(DebtorType.COMPANY)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            <Building2 className="h-4 w-4" /> Kurum Ekle
          </button>
          <button
            onClick={() => openNewModal(DebtorType.PUBLIC_INSTITUTION)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600"
          >
            <Landmark className="h-4 w-4" /> Kamu Ekle
          </button>
        </div>
      </div>

      {/* Test Borçluları Yükle Butonu - Şahıs veya Kurum sekmesinde göster */}
      {(typeFilter === DebtorType.INDIVIDUAL || typeFilter === DebtorType.COMPANY) && !loading && (
        <div className={`mb-4 p-4 border rounded-lg ${
          typeFilter === DebtorType.INDIVIDUAL 
            ? "bg-emerald-50 border-emerald-200" 
            : "bg-blue-50 border-blue-200"
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`font-medium ${
                typeFilter === DebtorType.INDIVIDUAL ? "text-emerald-800" : "text-blue-800"
              }`}>
                Test Borçluları
              </p>
              <p className={`text-sm ${
                typeFilter === DebtorType.INDIVIDUAL ? "text-emerald-600" : "text-blue-600"
              }`}>
                {typeFilter === DebtorType.INDIVIDUAL 
                  ? "20 adet örnek şahıs borçlu yükleyin" 
                  : "20 adet örnek kurum borçlu yükleyin"}
              </p>
            </div>
            <button
              onClick={loadTestDebtors}
              disabled={loadingTestDebtors}
              className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 flex items-center gap-2 ${
                typeFilter === DebtorType.INDIVIDUAL 
                  ? "bg-emerald-600 hover:bg-emerald-700" 
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loadingTestDebtors ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Yükleniyor...
                </>
              ) : (
                <>
                  {typeFilter === DebtorType.INDIVIDUAL ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Building2 className="h-4 w-4" />
                  )}
                  Test Borçluları Yükle
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Kamu Kurumları Yükle Butonu - Kamu sekmesinde göster */}
      {typeFilter === DebtorType.PUBLIC_INSTITUTION && !loading && (
        <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-purple-800">Kamu Kurumları Veritabanı</p>
              <p className="text-sm text-purple-600">
                Bakanlıklar, belediyeler, üniversiteler, mahkemeler ve diğer kamu kurumlarını yükleyin
              </p>
            </div>
            <button
              onClick={loadPublicInstitutionDebtors}
              disabled={loadingPublicInstitutions}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loadingPublicInstitutions ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Yükleniyor...
                </>
              ) : (
                <>
                  <Landmark className="h-4 w-4" />
                  Kamu Kurumlarını Yükle
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Search and Filter */}
      <div className="flex gap-4 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Borçlu ara (isim, kimlik no, telefon)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex gap-1">
          {[
            { value: "ALL", label: "Tümü" },
            { value: DebtorType.INDIVIDUAL, label: "Şahıs" },
            { value: DebtorType.COMPANY, label: "Kurum" },
            { value: DebtorType.PUBLIC_INSTITUTION, label: "Kamu" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTypeFilter(opt.value as any)}
              className={`px-3 py-2 text-sm rounded-lg ${
                typeFilter === opt.value
                  ? "bg-primary text-white"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>


      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Yükleniyor...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {search ? "Sonuç bulunamadı" : "Henüz borçlu kaydı yok"}
          <p className="text-sm mt-2">Yukarıdaki butonlardan yeni borçlu ekleyebilirsiniz.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden flex flex-col h-[500px]">
          {/* Tablo Header - Sabit */}
          <div className="bg-gray-50 border-b flex-shrink-0">
            <table className="w-full">
              <thead>
                <tr>
                  <th 
                    className="text-left px-4 py-3 text-sm font-medium w-[30%] cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center gap-1">Borçlu <SortIcon field="name" /></div>
                  </th>
                  <th 
                    className="text-left px-4 py-3 text-sm font-medium w-[10%] cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort("type")}
                  >
                    <div className="flex items-center gap-1">Tür <SortIcon field="type" /></div>
                  </th>
                  <th 
                    className="text-left px-4 py-3 text-sm font-medium w-[15%] cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort("identityNo")}
                  >
                    <div className="flex items-center gap-1">Kimlik/VKN <SortIcon field="identityNo" /></div>
                  </th>
                  <th 
                    className="text-left px-4 py-3 text-sm font-medium w-[25%] cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort("phone")}
                  >
                    <div className="flex items-center gap-1">İletişim <SortIcon field="phone" /></div>
                  </th>
                  <th 
                    className="text-center px-4 py-3 text-sm font-medium w-[10%] cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort("caseCount")}
                  >
                    <div className="flex items-center justify-center gap-1">Dosya <SortIcon field="caseCount" /></div>
                  </th>
                  <th className="text-center px-4 py-3 text-sm font-medium w-[10%]">İşlem</th>
                </tr>
              </thead>
            </table>
          </div>
          
          {/* Tablo Body - Scrollable */}
          <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
            <table className="w-full">
              <tbody className="divide-y">
                {paginatedDebtors.map((debtor) => (
                  <tr key={debtor.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 w-[30%]">
                      <button
                        onClick={() => handleDebtorClick(debtor)}
                        className="flex items-center gap-2 hover:text-primary transition-colors text-left"
                      >
                        {getTypeIcon(debtor.type)}
                        <span className="font-medium hover:underline truncate max-w-[250px]" title={debtor.name}>{debtor.name}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 w-[10%]">
                      {getTypeLabel(debtor.type)}
                    </td>
                    <td className="px-4 py-3 text-sm w-[15%]">{debtor.identityNo || "-"}</td>
                    <td className="px-4 py-3 w-[25%]">
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        {debtor.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {debtor.phone}
                          </span>
                        )}
                        {debtor.email && (
                          <span className="flex items-center gap-1 truncate max-w-[150px]" title={debtor.email}>
                            <Mail className="w-3 h-3" /> {debtor.email}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center w-[10%]">
                      <span className="bg-gray-100 px-2 py-1 rounded text-sm">
                        {debtor._count?.caseDebtors || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 w-[10%]">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleDebtorClick(debtor)}
                          className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded"
                          title="Düzenle"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(debtor)}
                          disabled={deleting === debtor.id}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded disabled:opacity-50"
                          title="Sil"
                        >
                          {deleting === debtor.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Sayfalama Footer */}
          <div className="bg-gray-50 border-t px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="text-sm text-gray-500">
              Toplam {sortedFiltered.length} kayıt • Sayfa {currentPage}/{totalPages || 1}
              <span className="ml-2 text-gray-400">
                ({startIndex + 1}-{Math.min(endIndex, sortedFiltered.length)} arası gösteriliyor)
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                İlk
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← Önceki
              </button>
              
              {/* Sayfa numaraları */}
              <div className="flex items-center gap-1 mx-2">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-8 h-8 text-sm rounded ${
                        currentPage === pageNum
                          ? "bg-primary text-white"
                          : "border hover:bg-gray-100"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="px-3 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sonraki →
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages || totalPages === 0}
                className="px-2 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Son
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Debtor Modal */}
      {showNewModal && (
        <NewDebtorModal
          initialType={newDebtorType}
          onSave={handleNewDebtorSaved}
          onClose={() => setShowNewModal(false)}
        />
      )}

      {/* Detail/Edit Modal */}
      {showDetailModal && selectedDebtor && (
        <DebtorDetailModal
          debtor={selectedDebtor}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedDebtor(null);
          }}
          onUpdate={handleDebtorUpdated}
          onDelete={() => {
            if (selectedDebtor) {
              setDebtors((prev) => prev.filter((d) => d.id !== selectedDebtor.id));
              setShowDetailModal(false);
              setSelectedDebtor(null);
            }
          }}
        />
      )}
    </div>
  );
}


// ==================== DEBTOR DETAIL MODAL ====================

interface DebtorDetailModalProps {
  debtor: Debtor;
  onClose: () => void;
  onUpdate: (debtor: Debtor) => void;
  onDelete: () => void;
}

function DebtorDetailModal({ debtor, onClose, onUpdate, onDelete }: DebtorDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [firstName, setFirstName] = useState(debtor.firstName || "");
  const [lastName, setLastName] = useState(debtor.lastName || "");
  const [companyName, setCompanyName] = useState(debtor.companyName || "");
  const [institutionName, setInstitutionName] = useState(debtor.institutionName || "");
  const [tckn, setTckn] = useState(debtor.tckn || "");
  const [vkn, setVkn] = useState(debtor.vkn || "");
  const [detsisNo, setDetsisNo] = useState(debtor.detsisNo || "");
  const [taxOffice, setTaxOffice] = useState(debtor.taxOffice || "");
  const [phone, setPhone] = useState(debtor.phone || "");
  const [email, setEmail] = useState(debtor.email || "");
  const [kepAddress, setKepAddress] = useState(debtor.kepAddress || "");
  const [riskLevel, setRiskLevel] = useState(debtor.riskLevel || "");
  const [riskNotes, setRiskNotes] = useState(debtor.riskNotes || "");
  const [notes, setNotes] = useState(debtor.notes || "");

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      const payload: any = {
        phone: phone || undefined,
        email: email || undefined,
        kepAddress: kepAddress || undefined,
        riskLevel: riskLevel || undefined,
        riskNotes: riskNotes || undefined,
        notes: notes || undefined,
      };

      if (debtor.type === DebtorType.INDIVIDUAL) {
        payload.firstName = firstName;
        payload.lastName = lastName;
        payload.tckn = tckn || undefined;
      } else if (debtor.type === DebtorType.COMPANY) {
        payload.companyName = companyName;
        payload.vkn = vkn || undefined;
        payload.taxOffice = taxOffice || undefined;
      } else if (debtor.type === DebtorType.PUBLIC_INSTITUTION) {
        payload.institutionName = institutionName;
        payload.detsisNo = detsisNo || undefined;
      }

      const res = await api.put<Debtor>(`/debtors/${debtor.id}`, payload);
      onUpdate(res.data);
      setIsEditing(false);
    } catch (e: any) {
      setError(e.message || "Güncelleme başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Bu borçluyu silmek istediğinize emin misiniz?")) return;
    setDeleting(true);
    try {
      await api.delete(`/debtors/${debtor.id}`);
      onDelete();
    } catch (e: any) {
      setError(e.message || "Silme başarısız");
      setDeleting(false);
    }
  };

  const getTypeIcon = () => {
    switch (debtor.type) {
      case DebtorType.COMPANY:
        return <Building2 className="w-5 h-5 text-blue-500" />;
      case DebtorType.PUBLIC_INSTITUTION:
        return <Landmark className="w-5 h-5 text-purple-500" />;
      default:
        return <User className="w-5 h-5 text-emerald-500" />;
    }
  };


  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            {getTypeIcon()}
            <h2 className="text-lg font-semibold">{debtor.name}</h2>
            <span className="text-xs bg-gray-100 px-2 py-1 rounded">
              {DebtorTypeLabels[debtor.type as DebtorType]}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Düzenle
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(90vh-130px)]">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}

          {isEditing ? (
            // Edit Mode
            <div className="space-y-4">
              {/* Individual Fields */}
              {debtor.type === DebtorType.INDIVIDUAL && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Ad</label>
                    <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Soyad</label>
                    <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">TCKN</label>
                    <input type="text" value={tckn} onChange={(e) => setTckn(e.target.value.replace(/\D/g, "").slice(0, 11))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
              )}

              {/* Company Fields */}
              {debtor.type === DebtorType.COMPANY && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1">Şirket Adı</label>
                    <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">VKN</label>
                    <input type="text" value={vkn} onChange={(e) => setVkn(e.target.value.replace(/\D/g, "").slice(0, 10))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Vergi Dairesi</label>
                    <input type="text" value={taxOffice} onChange={(e) => setTaxOffice(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
              )}

              {/* Public Institution Fields */}
              {debtor.type === DebtorType.PUBLIC_INSTITUTION && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1">Kurum Adı</label>
                    <input type="text" value={institutionName} onChange={(e) => setInstitutionName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">DETSİS No</label>
                    <input type="text" value={detsisNo} onChange={(e) => setDetsisNo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
              )}

              {/* Contact Fields */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Telefon</label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">E-posta</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">KEP Adresi</label>
                  <input type="email" value={kepAddress} onChange={(e) => setKepAddress(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              {/* Risk */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Risk Seviyesi</label>
                  <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">Seçiniz</option>
                    {Object.entries(DebtorRiskLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Risk Notu</label>
                  <input type="text" value={riskNotes} onChange={(e) => setRiskNotes(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium mb-1">Notlar</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
            </div>
          ) : (
            // View Mode
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500">Kimlik No</label>
                  <p className="font-medium">{debtor.identityNo || "-"}</p>
                </div>
                {debtor.taxOffice && (
                  <div>
                    <label className="text-xs text-gray-500">Vergi Dairesi</label>
                    <p className="font-medium">{debtor.taxOffice}</p>
                  </div>
                )}
              </div>

              {/* Contact */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-gray-500">Telefon</label>
                  <p className="font-medium flex items-center gap-1">
                    {debtor.phone ? <><Phone className="w-3 h-3" /> {debtor.phone}</> : "-"}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">E-posta</label>
                  <p className="font-medium flex items-center gap-1">
                    {debtor.email ? <><Mail className="w-3 h-3" /> {debtor.email}</> : "-"}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">KEP</label>
                  <p className="font-medium">{debtor.kepAddress || "-"}</p>
                </div>
              </div>

              {/* Risk */}
              {debtor.riskLevel && (
                <div>
                  <label className="text-xs text-gray-500">Risk Seviyesi</label>
                  <p className="font-medium">
                    <span className={`px-2 py-1 rounded text-xs ${
                      debtor.riskLevel === DebtorRiskLevel.COK_YUKSEK ? "bg-red-100 text-red-700" :
                      debtor.riskLevel === DebtorRiskLevel.YUKSEK ? "bg-orange-100 text-orange-700" :
                      debtor.riskLevel === DebtorRiskLevel.ORTA ? "bg-yellow-100 text-yellow-700" :
                      "bg-green-100 text-green-700"
                    }`}>
                      {DebtorRiskLabels[debtor.riskLevel as DebtorRiskLevel]}
                    </span>
                    {debtor.riskNotes && <span className="ml-2 text-gray-500">{debtor.riskNotes}</span>}
                  </p>
                </div>
              )}

              {/* Addresses */}
              {debtor.debtorAddresses && debtor.debtorAddresses.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 mb-2 block">Adresler</label>
                  <div className="space-y-2">
                    {debtor.debtorAddresses.map((addr, i) => (
                      <div key={i} className="p-2 bg-gray-50 rounded-lg text-sm flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                        <div>
                          <span className="text-xs bg-gray-200 px-1.5 py-0.5 rounded mr-2">
                            {addr.addressType} {addr.isPrimary && "(Ana)"}
                          </span>
                          {addr.street}, {addr.district && `${addr.district}/`}{addr.city}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {debtor.notes && (
                <div>
                  <label className="text-xs text-gray-500">Notlar</label>
                  <p className="text-sm text-gray-600">{debtor.notes}</p>
                </div>
              )}

              {/* Case Count */}
              <div>
                <label className="text-xs text-gray-500">Bağlı Dosya Sayısı</label>
                <p className="font-medium">{debtor._count?.caseDebtors || 0} dosya</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4 border-t bg-gray-50">
          {isEditing ? (
            <>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
              >
                {deleting ? "Siliniyor..." : "Borçluyu Sil"}
              </button>
              <div className="flex gap-2">
                <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">
                  İptal
                </button>
                <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
              >
                {deleting ? "Siliniyor..." : "Borçluyu Sil"}
              </button>
              <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">
                Kapat
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
