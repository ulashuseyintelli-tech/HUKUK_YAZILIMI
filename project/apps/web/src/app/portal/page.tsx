"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { FileText, DollarSign, Clock, TrendingUp, Loader2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function PortalHomePage() {
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const userData = localStorage.getItem("portal_user");
    if (userData) setUser(JSON.parse(userData));
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

  const totalPrincipal = cases.reduce((sum, c) => sum + Number(c.principalAmount || 0), 0);
  const totalCollected = cases.reduce((sum, c) => 
    sum + c.collections?.reduce((s: number, col: any) => s + Number(col.amount || 0), 0) || 0, 0
  );
  const activeCases = cases.filter(c => c.caseStatus === "DERDEST" || c.caseStatus === "ISLEMDE").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hoş Geldiniz, {user?.clientName}</h1>
        <p className="text-gray-500">Dosyalarınızın özet durumu</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Toplam Dosya</p>
              <p className="text-2xl font-bold">{cases.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Clock className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Aktif Dosya</p>
              <p className="text-2xl font-bold">{activeCases}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <DollarSign className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Toplam Alacak</p>
              <p className="text-2xl font-bold">{totalPrincipal.toLocaleString("tr-TR")} ₺</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Tahsil Edilen</p>
              <p className="text-2xl font-bold">{totalCollected.toLocaleString("tr-TR")} ₺</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Cases */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Son Dosyalar</h2>
          <Link href="/portal/cases" className="text-sm text-blue-600 hover:underline">
            Tümünü Gör →
          </Link>
        </div>
        <div className="divide-y">
          {cases.slice(0, 5).map((c) => (
            <Link key={c.id} href={`/portal/cases/${c.id}`} className="block p-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{c.fileNumber}</p>
                  <p className="text-sm text-gray-500">
                    {c.debtors?.map((d: any) => d.debtor?.name).join(", ") || "Borçlu bilgisi yok"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{Number(c.principalAmount || 0).toLocaleString("tr-TR")} ₺</p>
                  <p className="text-xs text-gray-500">{new Date(c.caseDate).toLocaleDateString("tr-TR")}</p>
                </div>
              </div>
            </Link>
          ))}
          {cases.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              Henüz dosya bulunmuyor
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
