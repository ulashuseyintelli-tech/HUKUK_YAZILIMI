"use client";

import { useState, useEffect } from "react";
import { Loader2, Receipt, History } from "lucide-react";
import { portalApiUrl } from "@/lib/config/portal-api-url";

/**
 * CLIENT-P2-U03-TRACK-B-I06 — Müvekkil Finansal Bildirimleri.
 *
 * Canonical sözleşme: charter §35.7 / §35.14.
 *
 * §35.14 OWNER KARARI — İKİ AYRI YÜZEY: varsayılan sekme yalnız **güncel** bildirimleri
 * gösterir; düzeltme/reversal geçmişi AYRI "Bildirim Geçmişi" sekmesindedir. Tek birleşik
 * liste ÜRETİLMEZ ve iki yüzey birbirine karışmaz.
 *
 * Bu sayfa hiçbir finansal DEĞER TÜRETMEZ: toplam, oran, bakiye veya fark HESAPLAMAZ.
 * Server-authorized projeksiyonda ne geldiyse yalnız onu gösterir.
 *   CLIENT-VISIBLE DATA = ONLY SERVER-AUTHORIZED PROJECTION
 */
type DisclosureLine = { type: string; amount: string };

type Disclosure = {
  disclosureId: string;
  version: number;
  currency: string;
  totalCollected: string;
  clientNetAmount: string;
  lines: DisclosureLine[];
  approvedAt: string | null;
  notifiedAt: string | null;
  publishedAt: string | null;
  isCurrentEffective: boolean;
  supersedesDisclosureId: string | null;
  supersededByDisclosureId: string | null;
  isReversed: boolean;
  correctionReason: string | null;
  remittanceStatus: "PUBLISHED" | "CORRECTED" | "REVERSED";
};

/** §35.16: sunum yalnız canonical string'i biçimlendirir; yeniden HESAP YAPMAZ. */
const lineLabels: Record<string, string> = {
  CLIENT_PAYABLE: "Müvekkile Ödenecek",
  CONTRACTUAL_FEE_WITHHELD: "Akdi Ücret Kesintisi",
  STATUTORY_FEE_WITHHELD: "Vekalet Ücreti Kesintisi",
  EXPENSE_REIMBURSEMENT: "Masraf Mahsubu",
  THIRD_PARTY_PAYABLE: "Üçüncü Kişiye Ödenecek",
};

const statusLabels: Record<Disclosure["remittanceStatus"], string> = {
  PUBLISHED: "Yayınlandı",
  CORRECTED: "Düzeltildi",
  REVERSED: "Geri Alındı",
};

const statusColors: Record<Disclosure["remittanceStatus"], string> = {
  PUBLISHED: "bg-green-100 text-green-700",
  CORRECTED: "bg-amber-100 text-amber-700",
  REVERSED: "bg-red-100 text-red-700",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("tr-TR");
}

function DisclosureCard({ item }: { item: Disclosure }) {
  return (
    <div
      data-testid="disclosure-card"
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">
            Tahsilat Bildirimi — v{item.version}
          </p>
          <p className="text-xs text-gray-500">
            Yayın: {formatDate(item.publishedAt)} · Onay: {formatDate(item.approvedAt)}
          </p>
        </div>
        <span className={`rounded px-2 py-1 text-xs ${statusColors[item.remittanceStatus]}`}>
          {statusLabels[item.remittanceStatus]}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-gray-500">Tahsil Edilen</dt>
          <dd className="font-medium text-gray-900">
            {item.totalCollected} {item.currency}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Size Ödenecek Net</dt>
          <dd className="font-medium text-gray-900">
            {item.clientNetAmount} {item.currency}
          </dd>
        </div>
      </dl>

      <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100 pt-2 text-sm">
        {item.lines.map((line, index) => (
          <li key={`${item.disclosureId}-${index}`} className="flex justify-between py-1">
            <span className="text-gray-600">{lineLabels[line.type] ?? line.type}</span>
            <span className="text-gray-900">
              {line.amount} {item.currency}
            </span>
          </li>
        ))}
      </ul>

      {item.correctionReason ? (
        <p className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-800">
          Düzeltme gerekçesi: {item.correctionReason}
        </p>
      ) : null}
    </div>
  );
}

export default function PortalFinancialDisclosuresPage() {
  const [tab, setTab] = useState<"CURRENT" | "HISTORY">("CURRENT");
  const [current, setCurrent] = useState<Disclosure[]>([]);
  const [history, setHistory] = useState<Disclosure[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem("portal_token");
        const headers = { Authorization: `Bearer ${token}` };
        // İki yüzey AYRI uçlardan gelir — istemcide birleştirilmez (§35.14).
        const [curRes, hisRes] = await Promise.all([
          fetch(portalApiUrl("/api/portal/financial-disclosures"), { headers }),
          fetch(portalApiUrl("/api/portal/financial-disclosures/history"), { headers }),
        ]);
        const cur = await curRes.json();
        const his = await hisRes.json();
        setCurrent(Array.isArray(cur?.items) ? cur.items : []);
        setHistory(Array.isArray(his?.items) ? his.items : []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const items = tab === "CURRENT" ? current : history;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Finansal Bildirimler</h1>

      <div className="flex gap-2 border-b border-gray-200">
        <button
          type="button"
          data-testid="tab-current"
          onClick={() => setTab("CURRENT")}
          className={`flex items-center gap-2 px-3 py-2 text-sm ${
            tab === "CURRENT" ? "border-b-2 border-blue-600 text-blue-700" : "text-gray-500"
          }`}
        >
          <Receipt className="h-4 w-4" /> Güncel
        </button>
        <button
          type="button"
          data-testid="tab-history"
          onClick={() => setTab("HISTORY")}
          className={`flex items-center gap-2 px-3 py-2 text-sm ${
            tab === "HISTORY" ? "border-b-2 border-blue-600 text-blue-700" : "text-gray-500"
          }`}
        >
          <History className="h-4 w-4" /> Bildirim Geçmişi
        </button>
      </div>

      {items.length === 0 ? (
        <p data-testid="empty-state" className="py-8 text-center text-sm text-gray-500">
          {tab === "CURRENT"
            ? "Henüz yayınlanmış bir finansal bildirim yok."
            : "Düzeltme veya geri alma kaydı yok."}
        </p>
      ) : (
        <div data-testid={tab === "CURRENT" ? "surface-current" : "surface-history"} className="space-y-3">
          {items.map((item) => (
            <DisclosureCard key={item.disclosureId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
