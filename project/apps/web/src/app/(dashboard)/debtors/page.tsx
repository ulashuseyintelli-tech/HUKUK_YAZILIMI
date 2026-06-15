"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
} from "lucide-react";
import { api } from "@/lib/api";
import {
  Debtor,
  DebtorAddress,
  EstateHeir,
  DebtorType,
  DebtorTypeLabels,
  DebtorRiskLabels,
  DebtorRiskLevel,
} from "@/types/debtor";
import { NewDebtorModal } from "@/components/debtor/NewDebtorModal";
import { buildDebtorQuery } from "@/lib/debtor-query";

const PAGE_SIZE = 25; // PR-D3: sunucu tarafı sayfa boyutu

export default function DebtorsPage() {
  const searchParams = useSearchParams();
  const editDebtorId = searchParams.get("edit");

  // PR-D1: seed/test verisi butonları yalnız geliştirme ortamında görünür (prod kirliliğini önler).
  const isDev = process.env.NODE_ENV !== "production";

  // PR-D3: server-side liste. Arama/tür/sayfalama backend findAll'a delege edilir (limit=2000
  // client-side kesim + client-side arama/sayfalama KALDIRILDI). Sorting bu PR'da yok.
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<DebtorType | "ALL">("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [refetchToken, setRefetchToken] = useState(0);
  const refetchDebtors = () => setRefetchToken((t) => t + 1);
  // Stale-response guard: yalnız en son istek state'i günceller (debounce + page reset yarışı).
  const reqIdRef = useRef(0);

  // Modal states
  const [showNewModal, setShowNewModal] = useState(false);
  const [newDebtorType, setNewDebtorType] = useState<DebtorType>(DebtorType.INDIVIDUAL);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedDebtor, setSelectedDebtor] = useState<Debtor | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [loadingPublicInstitutions, setLoadingPublicInstitutions] = useState(false);
  const [loadingTestDebtors, setLoadingTestDebtors] = useState(false);

  // Arama debounce (300ms) — backend'i her tuşta yormamak için.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Arama/tür değişince ilk sayfaya dön (sonra fetch effect tetiklenir).
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, typeFilter]);

  // Server-side fetch: debouncedSearch / typeFilter / currentPage / refetchToken değiştikçe.
  useEffect(() => {
    fetchDebtors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, typeFilter, currentPage, refetchToken]);

  const fetchDebtors = async () => {
    const myReq = ++reqIdRef.current;
    try {
      setLoading(true);
      const qs = buildDebtorQuery({ page: currentPage, limit: PAGE_SIZE, search: debouncedSearch, type: typeFilter });
      // findAll → { data: Debtor[], meta: { total, page, limit, totalPages } }
      const res = await api.get<{ data: Debtor[]; meta: { total: number; totalPages: number } }>(
        `/debtors?${qs}`
      );
      if (myReq !== reqIdRef.current) return; // bayat yanıt → yoksay
      setDebtors(res.data?.data || []);
      setTotal(res.data?.meta?.total || 0);
      setTotalPages(res.data?.meta?.totalPages || 1);
    } catch (e) {
      if (myReq === reqIdRef.current) console.error("Error fetching debtors:", e);
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
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
      refetchDebtors(); // server-side: mevcut sayfayı yeniden çek (toplam/sayfa doğru kalsın)
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

  const handleNewDebtorSaved = (_debtor: Debtor) => {
    setShowNewModal(false);
    setCurrentPage(1); // yeni kayıt createdAt desc ile ilk sayfada görünür
    refetchDebtors();
  };

  const handleDebtorUpdated = (updatedDebtor: Debtor) => {
    setDebtors((prev) => prev.map((d) => (d.id === updatedDebtor.id ? updatedDebtor : d)));
    setSelectedDebtor(updatedDebtor);
  };

  const openNewModal = (type: DebtorType) => {
    setNewDebtorType(type);
    setShowNewModal(true);
  };

  // Footer gösterim aralığı (server-side toplam üzerinden). debtors = mevcut sayfa.
  const startIndex = (currentPage - 1) * PAGE_SIZE;

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

      {/* Test Borçluları Yükle Butonu - Şahıs veya Kurum sekmesinde göster (YALNIZ DEV) */}
      {isDev && (typeFilter === DebtorType.INDIVIDUAL || typeFilter === DebtorType.COMPANY) && !loading && (
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

      {/* Kamu Kurumları Yükle Butonu - Kamu sekmesinde göster (YALNIZ DEV) */}
      {isDev && typeFilter === DebtorType.PUBLIC_INSTITUTION && !loading && (
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
            { value: DebtorType.ESTATE, label: "Tereke" },
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
      ) : debtors.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {debouncedSearch ? "Sonuç bulunamadı" : "Henüz borçlu kaydı yok"}
          <p className="text-sm mt-2">Yukarıdaki butonlardan yeni borçlu ekleyebilirsiniz.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden flex flex-col h-[500px]">
          {/* Tablo Header - Sabit */}
          <div className="bg-gray-50 border-b flex-shrink-0">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium w-[30%]">Borçlu</th>
                  <th className="text-left px-4 py-3 text-sm font-medium w-[10%]">Tür</th>
                  <th className="text-left px-4 py-3 text-sm font-medium w-[15%]">Kimlik/VKN</th>
                  <th className="text-left px-4 py-3 text-sm font-medium w-[25%]">İletişim</th>
                  <th className="text-center px-4 py-3 text-sm font-medium w-[10%]">Dosya</th>
                  <th className="text-center px-4 py-3 text-sm font-medium w-[10%]">İşlem</th>
                </tr>
              </thead>
            </table>
          </div>
          
          {/* Tablo Body - Scrollable */}
          <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
            <table className="w-full">
              <tbody className="divide-y">
                {debtors.map((debtor) => {
                  const isHighlighted = debtor.id === editDebtorId;
                  return (
                  <tr key={debtor.id} className={`hover:bg-gray-50 ${isHighlighted ? 'bg-yellow-50 ring-2 ring-yellow-400 ring-inset' : ''}`}>
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
                )})}
              </tbody>
            </table>
          </div>

          {/* Sayfalama Footer */}
          <div className="bg-gray-50 border-t px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="text-sm text-gray-500">
              Toplam {total} kayıt • Sayfa {currentPage}/{totalPages || 1}
              <span className="ml-2 text-gray-400">
                ({total === 0 ? 0 : startIndex + 1}-{startIndex + debtors.length} arası gösteriliyor)
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


// ==================== ADDRESS MANAGER (PR-D2a) ====================

const ADDRESS_TYPE_OPTIONS = [
  { value: "TEBLIGAT", label: "Tebligat" },
  { value: "EV", label: "Ev" },
  { value: "IS", label: "İş" },
  { value: "MERNIS", label: "MERNİS" },
  { value: "KEP", label: "KEP" },
];
const addressTypeLabel = (v?: string) =>
  ADDRESS_TYPE_OPTIONS.find((o) => o.value === v)?.label || v || "Adres";

/** Adres kaynağı insan-okunur: Müvekkil / MERNİS / Sistem / Manuel. */
const addressSourceLabel = (addr: DebtorAddress): string => {
  if (addr.addressCategory === "DECLARED_CLIENT") return "Müvekkil";
  const s = addr.source;
  if (s === "MERNIS") return "MERNİS";
  if (!s || s === "USER_INPUT") return "Manuel";
  return "Sistem";
};

type AddressForm = {
  addressType: string;
  street: string;
  city: string;
  district: string;
  postalCode: string;
  isPrimary: boolean;
  isMernis: boolean;
};
const emptyAddressForm = (): AddressForm => ({
  addressType: "TEBLIGAT",
  street: "",
  city: "",
  district: "",
  postalCode: "",
  isPrimary: false,
  isMernis: false,
});

function AddressManager({
  debtorId,
  addresses,
  onChanged,
}: {
  debtorId: string;
  addresses: DebtorAddress[];
  onChanged: (updated: Debtor) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddressForm>(emptyAddressForm());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const refetch = async () => {
    // findOne düz debtor döndürür (sarmalsız); api.get bunu { data } içine sarar → res.data = debtor.
    // Bazı endpoint'ler { data } sarmalı döndüğünden iki şekli de tolere et.
    const res = await api.get<any>(`/debtors/${debtorId}`);
    const updated = res.data?.data ?? res.data;
    if (updated?.id) onChanged(updated);
  };

  const startAdd = () => {
    setForm(emptyAddressForm());
    setEditingId(null);
    setAdding(true);
    setErr("");
  };
  const startEdit = (addr: DebtorAddress) => {
    setForm({
      addressType: addr.addressType || "TEBLIGAT",
      street: addr.street || "",
      city: addr.city || "",
      district: addr.district || "",
      postalCode: addr.postalCode || "",
      isPrimary: addr.isPrimary,
      isMernis: addr.isMernis,
    });
    setEditingId(addr.id || null);
    setAdding(false);
    setErr("");
  };
  const cancelForm = () => {
    setAdding(false);
    setEditingId(null);
    setErr("");
  };

  const save = async () => {
    if (!form.street.trim() || !form.city.trim()) {
      setErr("Adres (sokak) ve il zorunludur");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const payload = {
        addressType: form.addressType,
        street: form.street.trim(),
        city: form.city.trim(),
        district: form.district.trim() || undefined,
        postalCode: form.postalCode.trim() || undefined,
        isPrimary: form.isPrimary,
        isMernis: form.isMernis,
      };
      if (editingId) {
        await api.put(`/debtors/${debtorId}/addresses/${editingId}`, payload);
      } else {
        await api.post(`/debtors/${debtorId}/addresses`, payload);
      }
      await refetch();
      cancelForm();
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message || "Adres kaydedilemedi");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (addr: DebtorAddress) => {
    if (!addr.id) return;
    if (!confirm("Bu adresi silmek istediğinize emin misiniz?")) return;
    setBusy(true);
    setErr("");
    try {
      await api.delete(`/debtors/${debtorId}/addresses/${addr.id}`);
      await refetch();
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message || "Adres silinemedi");
    } finally {
      setBusy(false);
    }
  };

  const makePrimary = async (addr: DebtorAddress) => {
    if (!addr.id || addr.isPrimary) return;
    setBusy(true);
    setErr("");
    try {
      await api.post(`/debtors/${debtorId}/addresses/${addr.id}/set-primary`);
      await refetch();
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message || "Birincil adres ayarlanamadı");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t pt-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-gray-500 font-medium flex items-center gap-1">
          <MapPin className="w-4 h-4" /> Adresler ({addresses.length})
        </label>
        {!adding && !editingId && (
          <button
            onClick={startAdd}
            className="text-xs text-primary hover:underline font-medium"
          >
            + Adres Ekle
          </button>
        )}
      </div>

      {err && (
        <div className="mb-2 p-2 bg-red-50 text-red-600 rounded text-xs flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> {err}
        </div>
      )}

      <div className="space-y-2">
        {addresses.map((addr) => (
          <div key={addr.id} className="p-2 bg-gray-50 rounded-lg text-sm">
            {editingId === addr.id ? (
              <AddressFormFields form={form} setForm={setForm} busy={busy} onSave={save} onCancel={cancelForm} />
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="text-xs bg-gray-200 px-1.5 py-0.5 rounded">{addressTypeLabel(addr.addressType)}</span>
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{addressSourceLabel(addr)}</span>
                      {addr.verified ? (
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">✓ Doğrulandı</span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Doğrulanmadı</span>
                      )}
                      {addr.isPrimary && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Birincil</span>}
                    </div>
                    <div className="text-gray-700 break-words">
                      {addr.street}
                      {addr.district && `, ${addr.district}`}
                      {addr.city && ` / ${addr.city}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!addr.isPrimary && (
                    <button onClick={() => makePrimary(addr)} disabled={busy} title="Birincil yap" className="p-1 text-gray-400 hover:text-primary disabled:opacity-50">
                      <ChevronUp className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => startEdit(addr)} disabled={busy} title="Düzenle" className="p-1 text-gray-400 hover:text-blue-500 disabled:opacity-50">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => remove(addr)} disabled={busy} title="Sil" className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {adding && (
          <div className="p-2 bg-blue-50 rounded-lg">
            <AddressFormFields form={form} setForm={setForm} busy={busy} onSave={save} onCancel={cancelForm} />
          </div>
        )}

        {addresses.length === 0 && !adding && (
          <p className="text-xs text-gray-400 italic">Kayıtlı adres yok. "+ Adres Ekle" ile ekleyin.</p>
        )}
      </div>
    </div>
  );
}

function AddressFormFields({
  form,
  setForm,
  busy,
  onSave,
  onCancel,
}: {
  form: AddressForm;
  setForm: (f: AddressForm) => void;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<AddressForm>) => setForm({ ...form, ...patch });
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">Adres Türü</label>
          <select value={form.addressType} onChange={(e) => set({ addressType: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm">
            {ADDRESS_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">İl *</label>
          <input value={form.city} onChange={(e) => set({ city: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">İlçe</label>
          <input value={form.district} onChange={(e) => set({ district: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-0.5">Posta Kodu</label>
          <input value={form.postalCode} onChange={(e) => set({ postalCode: e.target.value })} className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-[11px] text-gray-500 mb-0.5">Adres (Mahalle, cadde, sokak, no) *</label>
        <textarea value={form.street} onChange={(e) => set({ street: e.target.value })} rows={2} className="w-full border rounded px-2 py-1.5 text-sm resize-none" />
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={form.isPrimary} onChange={(e) => set({ isPrimary: e.target.checked })} className="rounded" /> Birincil adres
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={form.isMernis} onChange={(e) => set({ isMernis: e.target.checked })} className="rounded" /> MERNİS adresi
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} disabled={busy} className="px-3 py-1.5 text-xs border rounded hover:bg-gray-50 disabled:opacity-50">İptal</button>
        <button onClick={onSave} disabled={busy} className="px-3 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1">
          {busy && <Loader2 className="h-3 w-3 animate-spin" />} Kaydet
        </button>
      </div>
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
  // PR-D2b: Tereke (ESTATE) alanları
  const [deceasedName, setDeceasedName] = useState(debtor.deceasedName || "");
  const [deceasedTckn, setDeceasedTckn] = useState(debtor.deceasedTckn || "");
  const [deathDate, setDeathDate] = useState((debtor.deathDate || "").slice(0, 10));
  const [inheritanceDocPath, setInheritanceDocPath] = useState(debtor.inheritanceDocPath || "");
  const [heirs, setHeirs] = useState<EstateHeir[]>(debtor.estateHeirs || []);

  const addHeir = () => setHeirs([...heirs, { name: "", tckn: "", address: "", city: "", district: "", shareRatio: "", phone: "", email: "" }]);
  const removeHeir = (i: number) => setHeirs(heirs.filter((_, idx) => idx !== i));
  const updateHeir = (i: number, patch: Partial<EstateHeir>) => setHeirs(heirs.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));

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
      } else if (debtor.type === DebtorType.ESTATE) {
        payload.deceasedName = deceasedName;
        payload.deceasedTckn = deceasedTckn || undefined;
        payload.deathDate = deathDate || undefined;
        payload.inheritanceDocPath = inheritanceDocPath || undefined;
        // estateHeirs gönderilince backend listeyi REPLACE eder (transaction). Boş-isimliler atlanır.
        payload.estateHeirs = heirs
          .filter((h) => h.name.trim())
          .map((h) => ({
            name: h.name.trim(),
            tckn: h.tckn || undefined,
            address: h.address || undefined,
            city: h.city || undefined,
            district: h.district || undefined,
            shareRatio: h.shareRatio || undefined,
            phone: h.phone || undefined,
            email: h.email || undefined,
          }));
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

              {/* Estate (Tereke) Fields — PR-D2b */}
              {debtor.type === DebtorType.ESTATE && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Muris Adı Soyadı</label>
                      <input type="text" value={deceasedName} onChange={(e) => setDeceasedName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Muris TCKN</label>
                      <input type="text" value={deceasedTckn} onChange={(e) => setDeceasedTckn(e.target.value.replace(/\D/g, "").slice(0, 11))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Ölüm Tarihi</label>
                      <input type="date" value={deathDate} onChange={(e) => setDeathDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Veraset İlamı (yol/no)</label>
                      <input type="text" value={inheritanceDocPath} onChange={(e) => setInheritanceDocPath(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>

                  {/* Mirasçılar */}
                  <div className="border-t pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium">Mirasçılar ({heirs.length})</label>
                      <button onClick={addHeir} className="text-xs text-primary hover:underline font-medium">+ Mirasçı Ekle</button>
                    </div>
                    <div className="space-y-2">
                      {heirs.map((h, i) => (
                        <div key={i} className="p-2 bg-gray-50 rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-gray-500">Mirasçı {i + 1}</span>
                            <button onClick={() => removeHeir(i)} className="p-1 text-gray-400 hover:text-red-500" title="Mirasçıyı sil"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input value={h.name} onChange={(e) => updateHeir(i, { name: e.target.value })} placeholder="Ad Soyad *" className="border rounded px-2 py-1.5 text-sm" />
                            <input value={h.tckn || ""} onChange={(e) => updateHeir(i, { tckn: e.target.value.replace(/\D/g, "").slice(0, 11) })} placeholder="TCKN" className="border rounded px-2 py-1.5 text-sm" />
                            <input value={h.shareRatio || ""} onChange={(e) => updateHeir(i, { shareRatio: e.target.value })} placeholder="Pay (ör. 1/4)" className="border rounded px-2 py-1.5 text-sm" />
                            <input value={h.phone || ""} onChange={(e) => updateHeir(i, { phone: e.target.value })} placeholder="Telefon" className="border rounded px-2 py-1.5 text-sm" />
                            <input value={h.email || ""} onChange={(e) => updateHeir(i, { email: e.target.value })} placeholder="E-posta" className="border rounded px-2 py-1.5 text-sm col-span-2" />
                            <input value={h.address || ""} onChange={(e) => updateHeir(i, { address: e.target.value })} placeholder="Adres" className="border rounded px-2 py-1.5 text-sm col-span-2" />
                          </div>
                        </div>
                      ))}
                      {heirs.length === 0 && <p className="text-xs text-gray-400 italic">Mirasçı yok. "+ Mirasçı Ekle" ile ekleyin.</p>}
                    </div>
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

              {/* Estate (Tereke) view — PR-D2b */}
              {debtor.type === DebtorType.ESTATE && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-500">Muris</label>
                      <p className="font-medium">{debtor.deceasedName || "-"}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Ölüm Tarihi</label>
                      <p className="font-medium">{debtor.deathDate ? new Date(debtor.deathDate).toLocaleDateString("tr-TR") : "-"}</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Mirasçılar ({debtor.estateHeirs?.length || 0})</label>
                    {debtor.estateHeirs && debtor.estateHeirs.length > 0 ? (
                      <div className="space-y-1">
                        {debtor.estateHeirs.map((h, i) => (
                          <div key={i} className="text-sm bg-gray-50 rounded px-2 py-1 flex items-center justify-between">
                            <span>{h.name}{h.shareRatio && <span className="text-gray-400 ml-1">({h.shareRatio})</span>}</span>
                            {h.tckn && <span className="text-xs text-gray-400">{h.tckn}</span>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Mirasçı kaydı yok</p>
                    )}
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

          {/* Adres Yönetimi (PR-D2a) — her iki modda görünür, ayrı endpoint'lerle yönetilir */}
          <div className="mt-4">
            <AddressManager
              debtorId={debtor.id}
              addresses={debtor.debtorAddresses || []}
              onChanged={onUpdate}
            />
          </div>
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
