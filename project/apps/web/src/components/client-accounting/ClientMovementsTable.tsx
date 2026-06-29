'use client';

/**
 * TM3 Faz A-MOV-FE — Müvekkil Genel Cari "Birleşik Hareketler" tablosu (READ-ONLY).
 *
 * Backend GET /clients/:clientId/accounting/movements'i besler. UI HESAP MOTORU DEĞİL:
 * tutarlar/yön backend'den gelir, running balance YOK. Mahsup/genel-ekstre/export butonu YOK.
 *
 * KİLİT: CASE_CONTEXT (dosya geneli) satırları "müvekkile gelen para" gibi GÖSTERİLMEZ —
 * nötr renkte + "Dosya geneli (müvekkile etki yok)" etiketiyle ayrılır. Yalnız CLIENT_SPECIFIC
 * satırları müvekkil carisine yön (↑/↓) taşır.
 *
 * B-2.2 (frontend-only): AccountingPanel kontratı — filtre bar SABİT (subHeader), tablo kendi içinde
 * scroll (sticky thead), pagination+not SABİT (footer). Mantık/label/running-balance DEĞİŞMEDİ.
 */

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Badge, Spinner } from '@hukuk/ui';
import { ArrowLeftRight, AlertCircle, Filter } from 'lucide-react';
import {
  clientAccountingApi,
  formatMoneyString,
  type MovementScopeGroup,
  type MovementClientEffect,
  type MovementSourceType,
} from '@/lib/api/client-accounting';
import { AccountingPanel } from './AccountingPanel';
import { AccountingTable } from './AccountingTable';

const MOV_PAGE_SIZE = 25;

const GROUP_LABEL: Record<MovementScopeGroup, string> = {
  CLIENT_SPECIFIC: 'Müvekkile Özgü',
  CASE_CONTEXT: 'Dosya Geneli',
};

/** sourceType → hukuk bürosu diline çevrilmiş İŞLEM tipi (yalnız label katmanı; backend aynı). */
const SOURCE_TYPE_LABEL: Record<MovementSourceType, string> = {
  EXPENSE_REQUEST: 'Müvekkilden Masraf Talep Edildi',
  EXPENSE_PAYMENT: 'Masraf Tahsil Edildi',
  CLIENT_PAYOUT: 'Müvekkile Ödeme Yapıldı',
  COLLECTION_DISPOSITION: 'Müvekkile Borç Oluştu',
  COLLECTION: 'Borçludan Tahsilat Geldi',
  CASE_BALANCE: 'Dosya Avans Hareketi',
};

/** Teknik durum kodları → Türkçe. Bilinmeyen değer ham gösterilir (sızıntı değil, güvenli fallback). */
const STATUS_LABEL: Record<string, string> = {
  POSTED: 'İşlendi',
  RECORDED: 'Kayıtlı',
  CONFIRMED: 'Onaylı',
  CANCELLED: 'İptal',
  REFUNDED: 'İade',
  PENDING: 'Beklemede',
  SENT: 'Gönderildi',
  REMINDED: 'Hatırlatıldı',
  PARTIAL: 'Kısmi',
  RECEIVED: 'Alındı',
  PAID: 'Ödendi',
  LAWYER_PAID: 'Avukat Ödedi',
  OVERDUE: 'Gecikmiş',
  DEBIT: 'Borç',
  CREDIT: 'Alacak',
  ADJUST: 'Düzeltme',
  REFUND: 'İade',
};

/** Kaynak kayıt referansı (ileride satır→kart link'i için): kısa id + tam id title'da. */
function sourceRef(sourceId: string): { short: string; full: string } {
  return { short: `#${sourceId.slice(-6)}`, full: sourceId };
}

/** clientEffect → YÖN etiketi + işaret + renk. CASE_CONTEXT = nötr (işaretsiz, gri, müvekkile atfedilmez). */
const EFFECT_META: Record<MovementClientEffect, { label: string; sign: '+' | '−' | ''; cls: string }> = {
  INCREASE_CLIENT_PAYABLE: { label: 'Müvekkile borç ↑', sign: '+', cls: 'text-emerald-700' },
  DECREASE_CLIENT_PAYABLE: { label: 'Müvekkile borç ↓', sign: '−', cls: 'text-green-700' },
  INCREASE_CLIENT_EXPENSE_DEBT: { label: 'Masraf borcu ↑', sign: '+', cls: 'text-amber-700' },
  DECREASE_CLIENT_EXPENSE_DEBT: { label: 'Masraf borcu ↓', sign: '−', cls: 'text-green-700' },
  NO_DIRECT_CLIENT_EFFECT: { label: 'Dosya geneli (müvekkile etki yok)', sign: '', cls: 'text-gray-400' },
};

interface ClientMovementsTableProps {
  clientId: string;
  currency?: string;
  /** Dosya filtresi için Genel Cari kırılımındaki dosyalar (ekstra sorgu yok). */
  cases: { caseId: string; caseNumber: string }[];
  /** Dashboard grid item sizing (min-h-0/min-w-0) için panel köküne geçer. */
  className?: string;
}

export function ClientMovementsTable({ clientId, currency = 'TRY', cases, className }: ClientMovementsTableProps) {
  const [group, setGroup] = useState<'' | MovementScopeGroup>('');
  const [caseFilter, setCaseFilter] = useState<string>('');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [page, setPage] = useState(1);

  const scope: 'client' | 'case' = caseFilter ? 'case' : 'client';
  const filtersActive = !!group || !!caseFilter || !!from || !!to;

  const movQ = useQuery({
    queryKey: ['client-cari-movements', clientId, currency, group, caseFilter, from, to, page],
    queryFn: () =>
      clientAccountingApi.getMovements(clientId, {
        scope,
        caseId: caseFilter || undefined,
        group: group || undefined,
        currency,
        page,
        pageSize: MOV_PAGE_SIZE,
        // Gün-granülerliği + SİMETRİK sınır: from=gün başı, to=gün sonu (ikisi de aynı yerel çerçeve).
        // (Çıplak 'YYYY-MM-DD' backend new Date() ile UTC gece-yarısı olarak parse edilir → asimetri olurdu.)
        from: from ? `${from}T00:00:00.000` : undefined,
        to: to ? `${to}T23:59:59.999` : undefined,
      }),
    enabled: !!clientId,
    placeholderData: keepPreviousData,
  });

  const resetPage = () => setPage(1);
  const clearFilters = () => {
    setGroup('');
    setCaseFilter('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const data = movQ.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / MOV_PAGE_SIZE)) : 1;

  return (
    <AccountingPanel
      ariaLabel="Birleşik hareketler tablosu"
      focusable
      className={className}
      title={
        <>
          <ArrowLeftRight className="h-5 w-5 shrink-0 text-gray-600" />
          <h2 className="text-[15px] font-bold text-gray-900">Birleşik Hareketler</h2>
          {data && (
            <Badge variant="secondary" className="ml-1">
              {data.total} hareket
            </Badge>
          )}
          {movQ.isFetching && <Spinner className="ml-1 h-4 w-4" />}
        </>
      }
      subHeader={
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="mb-1 flex items-center gap-1 text-[11px] text-gray-500">
              <Filter className="h-3 w-3" /> Kapsam
            </label>
            <select
              value={group}
              onChange={(e) => {
                setGroup(e.target.value as '' | MovementScopeGroup);
                resetPage();
              }}
              className="min-w-[160px] rounded border px-2 py-1.5 text-sm"
            >
              <option value="">Tüm Hareketler</option>
              <option value="CLIENT_SPECIFIC">Müvekkile Özgü</option>
              <option value="CASE_CONTEXT">Dosya Geneli</option>
            </select>
          </div>

          <div className="flex flex-col">
            <label className="mb-1 text-[11px] text-gray-500">Dosya</label>
            <select
              value={caseFilter}
              onChange={(e) => {
                setCaseFilter(e.target.value);
                resetPage();
              }}
              className="min-w-[200px] rounded border px-2 py-1.5 text-sm"
            >
              <option value="">Tüm Dosyalar</option>
              {cases.map((c) => (
                <option key={c.caseId} value={c.caseId}>
                  {c.caseNumber}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="mb-1 text-[11px] text-gray-500">Başlangıç</label>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                resetPage();
              }}
              className="rounded border px-2 py-1.5 text-sm"
            />
          </div>

          <div className="flex flex-col">
            <label className="mb-1 text-[11px] text-gray-500">Bitiş</label>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                resetPage();
              }}
              className="rounded border px-2 py-1.5 text-sm"
            />
          </div>

          {filtersActive && (
            <button
              onClick={clearFilters}
              className="rounded border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Filtreleri temizle
            </button>
          )}
        </div>
      }
      footer={
        <div className="space-y-1.5">
          {data && totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 text-sm">
              <button
                className="rounded border px-2 py-1 disabled:opacity-40"
                disabled={page <= 1 || movQ.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Önceki
              </button>
              <span className="text-gray-500">
                {page} / {totalPages}
              </span>
              <button
                className="rounded border px-2 py-1 disabled:opacity-40"
                disabled={page >= totalPages || movQ.isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Sonraki
              </button>
            </div>
          )}
          <p className="text-[11px] text-gray-400">
            Birleşik hareket görünümüdür; tek bir yürüyen bakiye değildir. <strong>Dosya geneli</strong> satırlar
            (borçlu tahsilatı, masraf/avans hareketi) çoklu alacaklıda doğrudan müvekkile atfedilmez.
          </p>
        </div>
      }
    >
      {movQ.isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner className="h-6 w-6" />
        </div>
      ) : movQ.isError ? (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          <span>Hareketler yüklenemedi.</span>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-500">
          {filtersActive ? 'Seçili filtrelere uyan hareket yok.' : 'Bu müvekkil için hareket bulunmuyor.'}
        </div>
      ) : (
        <AccountingTable
          head={
            <>
              <th className="whitespace-nowrap">Tarih</th>
              <th>İşlem</th>
              <th className="whitespace-nowrap">Dosya</th>
              <th>Kapsam</th>
              <th className="text-right whitespace-nowrap">Tutar</th>
              <th>Yön</th>
              <th>Durum</th>
              <th className="whitespace-nowrap">Kaynak</th>
            </>
          }
        >
            {data.items.map((m) => {
              const eff = EFFECT_META[m.clientEffect];
              const isContext = m.scopeGroup === 'CASE_CONTEXT';
              const ref = sourceRef(m.sourceId);
              return (
                <tr key={m.id} className={`hover:bg-gray-50 ${isContext ? 'bg-slate-50/40' : ''}`}>
                  <td className="px-2 whitespace-nowrap text-gray-600">
                    {new Date(m.occurredAt).toLocaleDateString('tr-TR')}
                  </td>
                  <td className="px-2">
                    <div className="text-gray-900">{SOURCE_TYPE_LABEL[m.sourceType]}</div>
                    {m.description && <div className="text-[10px] text-gray-400">{m.description}</div>}
                  </td>
                  <td className="px-2 whitespace-nowrap">{m.caseNo || '—'}</td>
                  <td className="px-2 whitespace-nowrap">
                    <Badge variant="secondary" className={isContext ? 'opacity-70' : ''}>
                      {GROUP_LABEL[m.scopeGroup]}
                    </Badge>
                  </td>
                  <td className={`px-2 text-right whitespace-nowrap ${eff.cls}`}>
                    {eff.sign && <span className="mr-0.5">{eff.sign}</span>}
                    {formatMoneyString(m.amount, m.currency || currency)}
                  </td>
                  <td className={`px-2 whitespace-nowrap ${eff.cls}`}>{eff.label}</td>
                  <td className="px-2 whitespace-nowrap text-gray-500">
                    {STATUS_LABEL[m.status] ?? m.status}
                  </td>
                  <td
                    className="px-2 whitespace-nowrap font-mono text-[10px] text-gray-400"
                    title={`${SOURCE_TYPE_LABEL[m.sourceType]} · ${ref.full}`}
                  >
                    {ref.short}
                  </td>
                </tr>
              );
            })}
        </AccountingTable>
      )}
    </AccountingPanel>
  );
}

export default ClientMovementsTable;
