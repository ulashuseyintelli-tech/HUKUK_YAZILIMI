"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Search, Edit2, Check, X, Upload, Download, Building2, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { api } from "@/lib/api";

interface ExecutionOffice {
  id: string;
  name: string;
  city: string;
  district?: string;
  uyapCode?: string;
  taxNumber?: string;
  bankName?: string;
  branchName?: string;
  iban?: string;
  isActive: boolean;
}

type SortField = "city" | "name" | "uyapCode" | "taxNumber" | "bankName" | "iban";
type SortDirection = "asc" | "desc" | null;

export default function ExecutionOfficesPage() {
  const [offices, setOffices] = useState<ExecutionOffice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<ExecutionOffice>>({});
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Sıralama state'leri
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  useEffect(() => {
    loadOffices();
  }, [selectedCity]);

  const loadOffices = async () => {
    try {
      setLoading(true);
      const params = selectedCity ? `?city=${encodeURIComponent(selectedCity)}` : "";
      const response = await api.get(`/execution-offices${params}`);
      setOffices(response?.data?.data || []);
    } catch (err) {
      console.error("İcra daireleri yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  const cities = [...new Set(offices.map((o) => o.city))].sort();

  const filteredOffices = offices.filter((office) => {
    const matchesSearch =
      office.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      office.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      office.uyapCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      office.iban?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  // Sıralama fonksiyonu
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Aynı sütuna tıklandı - yönü değiştir veya sıfırla
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortDirection(null);
        setSortField(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      // Farklı sütuna tıklandı
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Sıralanmış liste
  const sortedOffices = [...filteredOffices].sort((a, b) => {
    if (!sortField || !sortDirection) return 0;
    
    const aValue = (a[sortField] || "").toString().toLowerCase();
    const bValue = (b[sortField] || "").toString().toLowerCase();
    
    if (sortDirection === "asc") {
      return aValue.localeCompare(bValue, "tr");
    } else {
      return bValue.localeCompare(aValue, "tr");
    }
  });

  // Sıralama ikonu
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ChevronsUpDown className="h-3 w-3 text-gray-400" />;
    }
    if (sortDirection === "asc") {
      return <ChevronUp className="h-3 w-3 text-primary" />;
    }
    return <ChevronDown className="h-3 w-3 text-primary" />;
  };

  const startEdit = (office: ExecutionOffice) => {
    setEditingId(office.id);
    setEditData({
      taxNumber: office.taxNumber,
      bankName: office.bankName,
      branchName: office.branchName,
      iban: office.iban,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };


  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await api.put(`/execution-offices/${editingId}`, editData);
      setMessage({ type: "success", text: "İcra dairesi güncellendi" });
      setEditingId(null);
      setEditData({});
      loadOffices();
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({ type: "error", text: "Güncelleme başarısız" });
    }
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setLoading(true);
      await api.post("/execution-offices/import", formData);
      setMessage({ type: "success", text: "Excel başarıyla içe aktarıldı" });
      loadOffices();
    } catch (err) {
      setMessage({ type: "error", text: "Excel içe aktarma başarısız" });
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const exportToExcel = () => {
    // CSV olarak export
    const headers = ["İl", "İcra Dairesi", "UYAP Kodu", "Vergi No", "Banka", "Şube", "IBAN", "Aktif"];
    const rows = filteredOffices.map((o) => [
      o.city,
      o.name,
      o.uyapCode || "",
      o.taxNumber || "",
      o.bankName || "",
      o.branchName || "",
      o.iban || "",
      o.isActive ? "Evet" : "Hayır",
    ]);

    const csvContent = [headers, ...rows].map((row) => row.join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "icra_daireleri.csv";
    link.click();
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <Link href="/settings" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Ayarlara Dön
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" /> İcra Daireleri Yönetimi
          </h1>
          <p className="text-muted-foreground">Toplam {offices.length} icra dairesi</p>
        </div>
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleExcelImport}
            accept=".xlsx,.xls,.csv"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted"
          >
            <Upload className="h-4 w-4" /> Excel İçe Aktar
          </button>
          <button
            onClick={exportToExcel}
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted"
          >
            <Download className="h-4 w-4" /> Dışa Aktar
          </button>
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg ${message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {message.text}
        </div>
      )}

      {/* Filtreler */}
      <div className="bg-white rounded-xl border p-4 mb-6">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="İcra dairesi, il veya IBAN ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm outline-none focus:border-primary"
            />
          </div>
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="px-4 py-2 border rounded-lg text-sm outline-none focus:border-primary"
          >
            <option value="">Tüm İller</option>
            {cities.map((city) => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
        </div>
      </div>


      {/* Tablo */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Yükleniyor...</div>
        ) : sortedOffices.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">İcra dairesi bulunamadı</div>
        ) : (
          <div className="overflow-x-auto max-h-[calc(100vh-380px)] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b sticky top-0 z-10">
                <tr>
                  <th 
                    className="text-left px-4 py-3 font-medium cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort("city")}
                  >
                    <div className="flex items-center gap-1">
                      İl
                      <SortIcon field="city" />
                    </div>
                  </th>
                  <th 
                    className="text-left px-4 py-3 font-medium cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center gap-1">
                      İcra Dairesi
                      <SortIcon field="name" />
                    </div>
                  </th>
                  <th 
                    className="text-left px-4 py-3 font-medium cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort("uyapCode")}
                  >
                    <div className="flex items-center gap-1">
                      UYAP Kodu
                      <SortIcon field="uyapCode" />
                    </div>
                  </th>
                  <th 
                    className="text-left px-4 py-3 font-medium cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort("taxNumber")}
                  >
                    <div className="flex items-center gap-1">
                      Vergi No
                      <SortIcon field="taxNumber" />
                    </div>
                  </th>
                  <th 
                    className="text-left px-4 py-3 font-medium cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort("bankName")}
                  >
                    <div className="flex items-center gap-1">
                      Banka
                      <SortIcon field="bankName" />
                    </div>
                  </th>
                  <th 
                    className="text-left px-4 py-3 font-medium cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort("iban")}
                  >
                    <div className="flex items-center gap-1">
                      IBAN
                      <SortIcon field="iban" />
                    </div>
                  </th>
                  <th className="text-left px-4 py-3 font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedOffices.map((office) => (
                  <tr key={office.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">{office.city}</td>
                    <td className="px-4 py-3 font-medium">{office.name}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                        {office.uyapCode || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {editingId === office.id ? (
                        <input
                          type="text"
                          value={editData.taxNumber || ""}
                          onChange={(e) => setEditData({ ...editData, taxNumber: e.target.value })}
                          className="w-24 px-2 py-1 border rounded text-xs"
                        />
                      ) : (
                        office.taxNumber || "-"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === office.id ? (
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={editData.bankName || ""}
                            onChange={(e) => setEditData({ ...editData, bankName: e.target.value })}
                            placeholder="Banka"
                            className="w-20 px-2 py-1 border rounded text-xs"
                          />
                          <input
                            type="text"
                            value={editData.branchName || ""}
                            onChange={(e) => setEditData({ ...editData, branchName: e.target.value })}
                            placeholder="Şube"
                            className="w-20 px-2 py-1 border rounded text-xs"
                          />
                        </div>
                      ) : (
                        <span className="text-xs">
                          {office.bankName ? `${office.bankName}${office.branchName ? ` - ${office.branchName}` : ""}` : "-"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === office.id ? (
                        <input
                          type="text"
                          value={editData.iban || ""}
                          onChange={(e) => setEditData({ ...editData, iban: e.target.value })}
                          className="w-48 px-2 py-1 border rounded text-xs font-mono"
                        />
                      ) : (
                        <span className="font-mono text-xs">{office.iban || "-"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === office.id ? (
                        <div className="flex gap-1">
                          <button onClick={saveEdit} className="p-1 text-green-600 hover:bg-green-50 rounded">
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={cancelEdit} className="p-1 text-red-600 hover:bg-red-50 rounded">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(office)} className="p-1 text-gray-600 hover:bg-gray-100 rounded">
                          <Edit2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* İstatistikler */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Toplam İcra Dairesi</p>
          <p className="text-2xl font-bold">{offices.length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">IBAN Tanımlı</p>
          <p className="text-2xl font-bold text-green-600">{offices.filter((o) => o.iban).length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">IBAN Eksik</p>
          <p className="text-2xl font-bold text-amber-600">{offices.filter((o) => !o.iban).length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">İl Sayısı</p>
          <p className="text-2xl font-bold">{cities.length}</p>
        </div>
      </div>
    </div>
  );
}
