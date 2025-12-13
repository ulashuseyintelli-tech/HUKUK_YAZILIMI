"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { FileText, Search, Loader2, ChevronRight } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const statusLabels: Record<string, string> = {
  DERDEST: "Derdest",
  ISLEMDE: "İşlemde",
  DERKENAR: "Derkenar",
  KAPALI: "Kapalı",
  ARSIV: "Arşiv",
};

const statusColors: Record<string, string> = {
  DERDEST: "bg-blue-100 text-blue-700",
  ISLEMDE: "bg-green-100 text-green-700",
  DERKENAR: "bg-amber-100 text-amber-700",
  KAPALI: "bg-gray-100 text-gray-700",
  ARSIV: "bg-gray-100 text-gray-500",
};

export default function PortalCasesPage() {
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async () => {
    try {
      const token = localStorage.getItem("portal_token");
      const res = await fetch(`${API_URL}/api/portal/cases`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCases(data || []);
    } catch (e) {
      console.error("Dosyalar yüklenemedi:", e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = cases.filter(c => 
    c.fileNumber?.toLowerCase().includes(search.toLowerCase()) ||
    c.debtors?.some((d: any) => d.debtor?.name?.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Dosyalarım</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Dosya no veya borçlu ara..."
            className="pl-9 pr-4 py-2 border rounded-lg text-sm w-64"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Dosya No</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Borçlu</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Durum</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Alacak</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Tahsilat</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Tarih</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((c) => {
              const totalCollected = c.collections?.reduce((s: number, col: any) => s + Number(col.amount || 0), 0) || 0;
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{c.fileNumber}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.debtors?.map((d: any) => d.debtor?.name).join(", ") || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${statusColors[c.caseStatus] || "bg-gray-100"}`}>
                      {statusLabels[c.caseStatus] || c.caseStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {Number(c.principalAmount || 0).toLocaleString("tr-TR")} ₺
                  </td>
                  <td className="px-4 py-3 text-right text-green-600">
                    {totalCollected.toLocaleString("tr-TR")} ₺
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(c.caseDate).toLocaleDateString("tr-TR")}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/portal/cases/${c.id}`} className="text-blue-600 hover:text-blue-800">
                      <ChevronRight className="h-5 w-5" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            {search ? "Sonuç bulunamadı" : "Henüz dosya bulunmuyor"}
          </div>
        )}
      </div>
    </div>
  );
}
