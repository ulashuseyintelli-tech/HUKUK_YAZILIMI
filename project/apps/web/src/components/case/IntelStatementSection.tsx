'use client';

import { useQuery } from '@tanstack/react-query';
import { Lightbulb, AlertCircle } from 'lucide-react';
import {
  clientIntelStatementApi,
  type ClientIntelStatement,
  type ClientIntelCategory,
  type ClientIntelStatus,
} from '@/lib/api/client-intel-statement';

/**
 * Client Intake / Müvekkil Analiz 4.7d — "Müvekkil İstihbaratı" (READ-ONLY).
 *
 * 4.7d-1: promote edilen ClientIntelStatement'ları case detayında salt-okuma gösterir.
 * 4.7d-2a: ACTIVE kayıtların yanında inactive kayıtları (RETRACTED/FALSE_POSITIVE/SUPERSEDED)
 *          ayrı "Geçmiş / Pasif Kayıtlar" alanında, soluk + status badge ile gösterir.
 *
 * ⛔ SINIRLAR (KORUNUR):
 *  - READ-ONLY: hiçbir mutation/aksiyon/menü YOK (retract/false-positive/supersede UI = 4.7d-2b/c,
 *    ADR-009 gereği OfficeApprovalRequest üzerinden — bu sprintte YOK).
 *  - MUHASEBE DEĞİL: accounting/statement/cari terimi kullanılmaz; finansal görünüm verilmez.
 *  - APPROVAL/PATRON ONAY copy'si kullanılmaz.
 *  - Bu beyanlar müvekkil DECLARED; doğrulanmış kesin bilgi/onay defteri DEĞİL.
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

const STATUS_LABEL: Record<ClientIntelStatus, string> = {
  ACTIVE: 'Geçerli',
  RETRACTED: 'Geri alındı',
  FALSE_POSITIVE: 'Yanlış kayıt',
  SUPERSEDED: 'Güncellendi',
};

const STATUS_BADGE: Record<ClientIntelStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  RETRACTED: 'bg-gray-200 text-gray-600',
  FALSE_POSITIVE: 'bg-red-100 text-red-700',
  SUPERSEDED: 'bg-blue-100 text-blue-700',
};

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR');
}

/** inactive kayıtlar için kronolojik sıralama anahtarı (en yeni işlem önce). */
function inactiveTs(r: ClientIntelStatement): string {
  return r.revokedAt || r.supersededAt || r.createdAt || '';
}

function groupByCategory(items: ClientIntelStatement[]): { category: ClientIntelCategory; rows: ClientIntelStatement[] }[] {
  const map = new Map<ClientIntelCategory, ClientIntelStatement[]>();
  for (const it of items) {
    const arr = map.get(it.category) ?? [];
    arr.push(it);
    map.set(it.category, arr);
  }
  const known = CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, rows: map.get(c)! }));
  const unknown = [...map.keys()]
    .filter((c) => !CATEGORY_ORDER.includes(c))
    .map((c) => ({ category: c, rows: map.get(c)! }));
  return [...known, ...unknown];
}

function StatusBadge({ status }: { status: ClientIntelStatus }) {
  return (
    <span className={`rounded px-1 py-px text-[9px] font-medium ${STATUS_BADGE[status] ?? 'bg-slate-200 text-slate-600'}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function IntelStatementSection({ caseId }: { caseId: string }) {
  // 4.7d-2a: TÜM statüler (read-only). listByCaseAllStatuses backend default-ACTIVE'i aşar; mutation YOK.
  const q = useQuery({
    queryKey: ['client-intel-statements', caseId],
    queryFn: () => clientIntelStatementApi.listByCaseAllStatuses(caseId),
    enabled: !!caseId,
  });

  const items = q.data ?? [];
  const active = items.filter((r) => r.status === 'ACTIVE');
  const inactive = items
    .filter((r) => r.status !== 'ACTIVE')
    .sort((a, b) => inactiveTs(b).localeCompare(inactiveTs(a)));
  const activeGroups = groupByCategory(active);

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-3">
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb className="h-4 w-4 text-indigo-600 shrink-0" />
        <h4 className="text-[13px] font-semibold text-gray-800">Müvekkil İstihbaratı</h4>
        {q.isSuccess && active.length > 0 && (
          <span className="ml-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
            {active.length}
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
      ) : active.length === 0 && inactive.length === 0 ? (
        <p className="text-[11px] text-gray-400 py-3 text-center">
          Bu dosya için henüz doğrulanmış müvekkil istihbaratı yok.
        </p>
      ) : (
        <div className="space-y-3">
          {/* ACTIVE — kategori bazlı (mevcut görünüm + "Geçerli" badge) */}
          {active.length > 0 ? (
            activeGroups.map((g) => (
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
                        <StatusBadge status={r.status} />
                        {fmtDate(r.createdAt) && <span>{fmtDate(r.createdAt)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="text-[11px] text-gray-400">Geçerli (aktif) müvekkil istihbaratı yok.</p>
          )}

          {/* INACTIVE — "Geçmiş / Pasif Kayıtlar" (soluk, read-only, badge'li; aksiyon YOK) */}
          {inactive.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                Geçmiş / Pasif Kayıtlar ({inactive.length})
              </div>
              <div className="space-y-1.5">
                {inactive.map((r) => (
                  <div key={r.id} className="rounded-md border border-slate-100 bg-slate-50/30 px-2.5 py-1.5 opacity-70">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-medium text-gray-500">
                        {CATEGORY_LABELS[r.category] ?? r.category}
                      </span>
                      <StatusBadge status={r.status} />
                    </div>
                    {r.label && <div className="text-[11px] font-medium text-gray-500">{r.label}</div>}
                    <p className="text-[12px] text-gray-600 whitespace-pre-wrap break-words">{r.value}</p>
                    {r.lifecycleNote && <p className="mt-0.5 text-[10px] text-gray-500">Gerekçe: {r.lifecycleNote}</p>}
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-400">
                      {fmtDate(r.revokedAt) && <span>İşlem tarihi: {fmtDate(r.revokedAt)}</span>}
                      {fmtDate(r.supersededAt) && <span>Güncellendi: {fmtDate(r.supersededAt)}</span>}
                      {r.supersededById && <span>Yeni kayıtla güncellendi</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default IntelStatementSection;
