'use client';

import { useQuery } from '@tanstack/react-query';
import { Lightbulb, AlertCircle } from 'lucide-react';
import {
  clientIntelStatementApi,
  type ClientIntelStatement,
  type ClientIntelCategory,
} from '@/lib/api/client-intel-statement';

/**
 * Client Intake / Müvekkil Analiz 4.7d-1 — "Müvekkil İstihbaratı" (READ-ONLY).
 *
 * Müvekkil analiz formlarından personel onayıyla promote edilen ClientIntelStatement
 * kayıtlarını dosya detayında salt-okuma gösterir. Kategori bazlı gruplar.
 *
 * ⛔ SINIRLAR:
 *  - READ-ONLY: hiçbir mutation/aksiyon yok (retract/false-positive/supersede 4.7d-2).
 *  - MUHASEBE DEĞİL: accounting/statement/cari terimi KULLANILMAZ; finansal görünüm verilmez.
 *  - Bu beyanlar müvekkil DECLARED (en zayıf güven); doğrulanmış gerçek/onay defteri DEĞİL.
 *  - Promote/aksiyon önerilmez (ASSET/CONTACT bu read modeline zaten girmez; gelse de aksiyon yok).
 */

const CATEGORY_LABELS: Record<ClientIntelCategory, string> = {
  INCOME_SOURCE: 'Gelir Kaynağı',
  COMMERCIAL_RELATION: 'Ticari İlişki',
  FAMILY_CIRCLE: 'Aile / Yakın Çevre',
  DIGITAL_FOOTPRINT: 'Dijital İz',
  PAYMENT_HISTORY: 'Tahsilat Geçmişi',
  STRATEGY: 'Dosya Stratejisi',
};

const CATEGORY_ORDER: ClientIntelCategory[] = [
  'INCOME_SOURCE',
  'COMMERCIAL_RELATION',
  'FAMILY_CIRCLE',
  'DIGITAL_FOOTPRINT',
  'PAYMENT_HISTORY',
  'STRATEGY',
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR');
}

function groupByCategory(items: ClientIntelStatement[]): { category: ClientIntelCategory; rows: ClientIntelStatement[] }[] {
  const map = new Map<ClientIntelCategory, ClientIntelStatement[]>();
  for (const it of items) {
    const arr = map.get(it.category) ?? [];
    arr.push(it);
    map.set(it.category, arr);
  }
  // Bilinen kategoriler önce (sabit sıra), bilinmeyenler sonra (defansif).
  const known = CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, rows: map.get(c)! }));
  const unknown = [...map.keys()]
    .filter((c) => !CATEGORY_ORDER.includes(c))
    .map((c) => ({ category: c, rows: map.get(c)! }));
  return [...known, ...unknown];
}

export function IntelStatementSection({ caseId }: { caseId: string }) {
  const q = useQuery({
    queryKey: ['client-intel-statements', caseId],
    queryFn: () => clientIntelStatementApi.listByCase(caseId),
    enabled: !!caseId,
  });

  const items = q.data ?? [];
  const groups = groupByCategory(items);

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-3">
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb className="h-4 w-4 text-indigo-600 shrink-0" />
        <h4 className="text-[13px] font-semibold text-gray-800">Müvekkil İstihbaratı</h4>
        {q.isSuccess && items.length > 0 && (
          <span className="ml-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
            {items.length}
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-500 mb-2">
        Müvekkil analiz formlarından onaylanıp aktarılan bilgiler burada görüntülenir. Bu beyanlar
        müvekkil tarafından bildirilmiştir; doğrulanmış kesin bilgi değildir.
      </p>

      {q.isLoading ? (
        <p className="text-[11px] text-gray-400 py-3 text-center">Yükleniyor…</p>
      ) : q.isError ? (
        <div className="flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-2 text-[11px] text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> İstihbarat bilgileri yüklenemedi.
        </div>
      ) : items.length === 0 ? (
        <p className="text-[11px] text-gray-400 py-3 text-center">
          Bu dosya için henüz doğrulanmış müvekkil istihbaratı yok.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.category}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                {CATEGORY_LABELS[g.category as ClientIntelCategory] ?? g.category}
              </div>
              <div className="space-y-1.5">
                {g.rows.map((r) => (
                  <div key={r.id} className="rounded-md border border-slate-100 bg-slate-50/60 px-2.5 py-1.5">
                    {r.label && <div className="text-[11px] font-medium text-gray-600">{r.label}</div>}
                    <p className="text-[12px] text-gray-800 whitespace-pre-wrap break-words">{r.value}</p>
                    {r.note && <p className="mt-0.5 text-[10px] text-gray-500">Not: {r.note}</p>}
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-400">
                      <span className="rounded bg-slate-200/70 px-1 py-px text-[9px] font-medium text-slate-600">Beyan</span>
                      {fmtDate(r.createdAt) && <span>{fmtDate(r.createdAt)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default IntelStatementSection;
