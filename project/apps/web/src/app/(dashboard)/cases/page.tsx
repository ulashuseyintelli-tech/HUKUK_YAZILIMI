"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Search, Filter, FileText, Loader2 } from "lucide-react";
import { Badge } from "@hukuk/ui";
import { api } from "@/lib/api";

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
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Takipler</h1>
          <p className="text-muted-foreground">Tüm icra takiplerinizi yönetin</p>
        </div>
        <Link
          href="/cases/new"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Yeni Takip
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Dosya no veya borçlu ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border bg-background py-2 pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="all">Tüm Durumlar</option>
            <option value="ACTIVE">Aktif</option>
            <option value="CLOSED">Kapalı</option>
            <option value="SUSPENDED">Askıda</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium">Dosya No</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Takip Türü</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Müvekkil</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Borçlu</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Tutar</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Durum</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Tarih</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredCases.map((caseItem) => (
                    <tr key={caseItem.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link
                          href={`/cases/${caseItem.id}`}
                          className="flex items-center gap-2 text-primary hover:underline"
                        >
                          <FileText className="h-4 w-4" />
                          {caseItem.fileNumber}
                        </Link>
                        {caseItem.executionFileNumber && (
                          <p className="text-xs text-muted-foreground">
                            {caseItem.executionFileNumber}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {caseTypeLabels[caseItem.type] || caseItem.type}
                      </td>
                      <td className="px-4 py-3 text-sm">{caseItem.client?.name || "-"}</td>
                      <td className="px-4 py-3 text-sm">
                        {caseItem.debtors?.[0]?.debtor.name || "-"}
                        {caseItem.debtors?.length > 1 && (
                          <span className="text-muted-foreground">
                            {" "}+{caseItem.debtors.length - 1}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {caseItem.principalAmount
                          ? `${caseItem.principalAmount.toLocaleString("tr-TR")} ₺`
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusColors[caseItem.status] || "default"}>
                          {statusLabels[caseItem.status] || caseItem.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {new Date(caseItem.createdAt).toLocaleDateString("tr-TR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredCases.length === 0 && (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Takip bulunamadı</p>
                <Link
                  href="/cases/new"
                  className="inline-flex items-center gap-2 mt-4 text-primary hover:underline"
                >
                  <Plus className="h-4 w-4" />
                  İlk takibinizi oluşturun
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
