"use client";

// CLIENT-POL-F-R01: müvekkile dönük CROSS-CASE FİNANSAL AGGREGATE gösterimi kaldırıldı.
// Charter §22.10 "CLIENT-FACING FINANCIAL AGGREGATES: NOT AUTHORIZED UNDER POL-F OPTION B —
// portala aggregate olarak sunulamaz: claimed amount total · collected amount total ...
// `principalAmount` canonical aggregate source DEĞİLDİR" ve §22.11 "BP-06 bu alanları aggregate
// total'a DÖNÜŞTÜREMEZ ... FINANCIAL AGGREGATE VISIBILITY: NOT AUTHORIZED" hükümleri gereği:
//  - "Toplam Alacak" (cross-case Σ principalAmount) kaldırıldı,
//  - "Tahsil Edilen" (Σ collections; TRACK-B-U00B'de API'den kaldırılan alana bağlı ölü kod)
//    türetmesiyle birlikte tamamen kaldırıldı.
// Yerine BAŞKA finansal aggregate/placeholder KONULMADI (§22.5 financial totals yasağı).
// KORUNAN: tekil case bazında `principalAmount` gösterimi ("Son Dosyalar" satırları) — §23.9
// "claimed amount partial case-level context olarak PRESENTED OLABİLİR" (single-object).
// KORUNAN: "Toplam Dosya"/"Aktif Dosya" — §23.6 "pagination/kayıt-sayısı business aggregate
// DEĞİLDİR" + §22.4 non-financial operational count.
// Emsal: TRACK-B-U00 (PR #1582) aynı deseni case-detail'de uygulamıştı (kart kaldır, grid'i
// kalan kart sayısına indir, boş placeholder EKLEME).

import { useState, useEffect } from "react";
import Link from "next/link";
import { FileText, Clock, Loader2 } from "lucide-react";
// CLIENT-REMEDIATION-CLOSEOUT-R01: module-level `NEXT_PUBLIC_API_URL || "http://localhost:8080"
// fallback'i kaldırıldı — production'da env eksikse sessizce kullanıcının localhost'una
// düşüyordu. Base URL artık canonical config katmanından gelir (dev fallback yalnız orada,
// production'da fail-fast). CLIENT-CONFIG-P01 ile aynı sözleşme.
import { portalApiUrl } from "@/lib/config/portal-api-url";


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
      const res = await fetch(portalApiUrl("/api/portal/cases"), {
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

      {/* Stats — CLIENT-POL-F-R01: "Toplam Alacak" (cross-case Σ principalAmount) ve
          "Tahsil Edilen" (Σ collections, ölü referans) kartları §22.10/§22.11 gereği
          kaldırıldı. Kalan 2 non-financial kart için grid 4→2 koloona indirildi;
          boş placeholder veya ikame finansal değer EKLENMEDİ. */}
      <div className="grid grid-cols-2 gap-4">
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
