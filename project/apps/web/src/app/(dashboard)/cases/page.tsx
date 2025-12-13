"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Search, FileText, Loader2, Files } from "lucide-react";
import { Badge } from "@hukuk/ui";
import { api } from "@/lib/api";
import { BulkDocumentGenerator } from "@/components/case";

interface CaseItem {
  id: string;
  fileNumber: string;
  executionFileNumber?: string;
  type: string;
  status: string;
  client?: { name: string };
  debtors: { debtor: { name: string } }[];
  principalAmount?: number;
  createdAt: string;
}

const caseTypeLabels: Record<string, string> = {
  GENERAL_EXECUTION: "Genel Haciz",
  MORTGAGE: "İpotekli",
  PLEDGE: "Rehinli",
  CHECK: "Çek",
  BOND: "Senet",
  RENTAL: "Kira",
  BANKRUPTCY: "İflas",
  OTHER: "Diğer",
};

const statusLabels: Record<string, string> = {
  ACTIVE: "Aktif",
  CLOSED: "Kapalı",
  SUSPENDED: "Askıda",
  ARCHIVED: "Arşiv",
};

const statusColors: Record<string, "default" | "success" | "warning" | "destructive"> = {
  ACTIVE: "success",
  CLOSED: "default",
  SUSPENDED: "warning",
  ARCHIVED: "default",
};

export default function CasesPage() {
  const searchParams = useSearchParams();
  const urlStatus = searchParams.get("status");
  
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(urlStatus || "all");
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [showBulkDocModal, setShowBulkDocModal] = useState(false);

  const pageTitle = "Eski Takipler";

  const fetchCases = async () => {
    try {
      setLoading(true);
      const params: { status?: string } = {};
      if (statusFilter !== "all") params.status = statusFilter;
      const response = await api.getCases(params);
      setCases(response.data || []);
    } catch (error) {
      console.error("Takipler yüklenemedi:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (urlStatus) {
      setStatusFilter(urlStatus);
    }
  }, [urlStatus]);

  useEffect(() => {
    fetchCases();
  }, [statusFilter]);

  const filteredCases = cases.filter((c) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      c.fileNumber.toLowerCase().includes(searchLower) ||
      c.debtors?.some((d) => d.debtor.name.toLowerCase().includes(searchLower))
    );
  });

  const toggleSelectCase = (caseId: string) => {
    setSelectedCases(prev => 
      prev.includes(caseId) 
        ? prev.filter(id => id !== caseId)
        : [...prev, caseId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedCases.length === filteredCases.length) {
      setSelectedCases([]);
    } else {
      setSelectedCases(filteredCases.map(c => c.id));
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-lg font-bold">{pageTitle}</h1>
          <p className="text-xs text-muted-foreground">Tüm icra takiplerinizi yönetin</p>
        </div>
        <Link
          href="/cases/new"
          className="inline-flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1.5 text-sm rounded-lg hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Yeni Takip
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Dosya no veya borçlu ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
        >
          <option value="all">Tümü</option>
          <option value="ACTIVE">Aktif</option>
          <option value="CLOSED">Kapalı</option>
          <option value="SUSPENDED">Askıda</option>
        </select>
        {selectedCases.length > 0 && (
          <button
            onClick={() => setShowBulkDocModal(true)}
            className="inline-flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-blue-700"
          >
            <Files className="h-4 w-4" />
            Toplu Belge ({selectedCases.length})
          </button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 bg-white rounded-lg border overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium w-8">
                    <input
                      type="checkbox"
                      checked={selectedCases.length === filteredCases.length && filteredCases.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="text-left px-3 py-2 font-medium">Dosya No</th>
                  <th className="text-left px-3 py-2 font-medium">Tür</th>
                  <th className="text-left px-3 py-2 font-medium">Müvekkil</th>
                  <th className="text-left px-3 py-2 font-medium">Borçlu</th>
                  <th className="text-left px-3 py-2 font-medium">Tutar</th>
                  <th className="text-left px-3 py-2 font-medium">Durum</th>
                  <th className="text-left px-3 py-2 font-medium">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredCases.map((caseItem) => (
                  <tr key={caseItem.id} className={`hover:bg-muted/30 ${selectedCases.includes(caseItem.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedCases.includes(caseItem.id)}
                        onChange={() => toggleSelectCase(caseItem.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/cases/${caseItem.id}`} className="flex items-center gap-1 text-primary hover:underline">
                        <FileText className="h-3 w-3" />
                        {caseItem.fileNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{caseTypeLabels[caseItem.type] || caseItem.type}</td>
                    <td className="px-3 py-2">{caseItem.client?.name || "-"}</td>
                    <td className="px-3 py-2">
                      {caseItem.debtors?.[0]?.debtor.name || "-"}
                      {caseItem.debtors?.length > 1 && <span className="text-muted-foreground"> +{caseItem.debtors.length - 1}</span>}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {caseItem.principalAmount ? `${caseItem.principalAmount.toLocaleString("tr-TR")} ₺` : "-"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={statusColors[caseItem.status] || "default"}>
                        {statusLabels[caseItem.status] || caseItem.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(caseItem.createdAt).toLocaleDateString("tr-TR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredCases.length === 0 && (
              <div className="text-center py-8">
                <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Takip bulunamadı</p>
                <Link href="/cases/new" className="inline-flex items-center gap-1 mt-2 text-sm text-primary hover:underline">
                  <Plus className="h-3 w-3" /> İlk takibinizi oluşturun
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bulk Document Generator Modal */}
      <BulkDocumentGenerator
        selectedCaseIds={selectedCases}
        isOpen={showBulkDocModal}
        onClose={() => setShowBulkDocModal(false)}
      />
    </div>
  );
}
