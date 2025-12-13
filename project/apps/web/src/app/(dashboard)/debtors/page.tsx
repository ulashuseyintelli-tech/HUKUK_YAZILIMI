"use client";

import { useState, useEffect } from "react";
import { Users, Search, Plus, Phone, Mail, Building2, User } from "lucide-react";
import { api } from "@/lib/api";

interface Debtor {
  id: string;
  name: string;
  type: string;
  identityNo?: string;
  email?: string;
  phone?: string;
  taxOffice?: string;
  _count?: { caseDebtors: number };
}

export default function DebtorsPage() {
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchDebtors();
  }, []);

  const fetchDebtors = async () => {
    try {
      const res = await api.getDebtors({ limit: 100 });
      setDebtors(res.data || res || []);
    } catch (e) {
      console.error("Error fetching debtors:", e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = debtors.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.identityNo?.includes(search)
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6" /> Borçlular
        </h1>
      </div>

      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Borçlu ara (isim veya kimlik no)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Yükleniyor...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {search ? "Sonuç bulunamadı" : "Henüz borçlu kaydı yok"}
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium">Borçlu</th>
                <th className="text-left px-4 py-3 text-sm font-medium">Tür</th>
                <th className="text-left px-4 py-3 text-sm font-medium">Kimlik/VKN</th>
                <th className="text-left px-4 py-3 text-sm font-medium">İletişim</th>
                <th className="text-center px-4 py-3 text-sm font-medium">Dosya</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((debtor) => (
                <tr key={debtor.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {debtor.type === "COMPANY" ? (
                        <Building2 className="w-4 h-4 text-blue-500" />
                      ) : (
                        <User className="w-4 h-4 text-green-500" />
                      )}
                      <span className="font-medium">{debtor.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {debtor.type === "COMPANY" ? "Tüzel Kişi" : "Gerçek Kişi"}
                  </td>
                  <td className="px-4 py-3 text-sm">{debtor.identityNo || "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      {debtor.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {debtor.phone}
                        </span>
                      )}
                      {debtor.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {debtor.email}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="bg-gray-100 px-2 py-1 rounded text-sm">
                      {debtor._count?.caseDebtors || 0}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
