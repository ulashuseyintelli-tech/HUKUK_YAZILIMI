'use client';

/**
 * TM3 Faz A — Müvekkil Genel Cari (client-level, READ-ONLY). scope=client.
 *
 * İki metrik grubu (kilitli karar):
 *  A) Müvekkile Özgü — temiz toplanır (caseClientId/clientId scope).
 *  B) Dosya Geneli / Paylaşılan Bağlam — müvekkile ATFEDİLMEZ (distinct caseId). Açık uyarı.
 * UI HESAP MOTORU DEĞİL: değerler backend'den (offsettableNetPosition yalnız BİLGİ).
 * Faz B-2: client-level immutable "Genel Ekstre" (Oluştur/Yenile) bu ekranda eklendi (yalnız CLIENT_SPECIFIC).
 * Mahsup butonu hâlâ YOK (Faz C). Summary/movements salt-okuma kalır.
 *
 * B-2.2 (frontend-only, salt-layout): Genel Cari = fixed-viewport dashboard.
 *  - Kök: xl'de flex-1 + overflow-hidden (sayfa scroll'u YOK; min-h-0 zinciri).
 *  - SUMMARY DECK (A+B) sabit kalır (shrink-0), scroll etmez.
 *  - WORKSPACE: Dosya Kırılımı (üst, full width) + Birleşik Hareketler/Genel Ekstre (alt) — her biri kendi içinde scroll.
 *  - Muhasebe davranışı, label'lar, scope ayrımı, API DEĞİŞMEDİ.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Spinner, Button } from '@hukuk/ui';
import { Wallet, Send, CheckCircle, Landmark, Building2, Info, AlertCircle, Scale, AlertTriangle, ArrowLeftRight } from 'lucide-react';
import { clientAccountingApi, formatMoneyString } from '@/lib/api/client-accounting';
import { AccountingPanel } from './AccountingPanel';
import { ClientMovementsTable } from './ClientMovementsTable';
import { ClientLevelStatementSection } from './ClientLevelStatementSection';
import { OffsetDrawer } from './OffsetDrawer';

interface ClientCariViewProps {
  clientId: string;
  currency?: string;
}

/** Decimal-string farkı (req−paid) — yalnız GÖSTERİM (per-satır ödenmemiş). */
function diffMoney(a: string, b: string, currency: string): string {
  const n = Number(a) - Number(b);
  return formatMoneyString(String(Number.isFinite(n) ? n : 0), currency);
}

export function ClientCariView({ clientId, currency = 'TRY' }: ClientCariViewProps) {
  const summaryQ = useQuery({
    queryKey: ['client-cari-summary', clientId, currency],
    queryFn: () => clientAccountingApi.getClientSummary(clientId, currency),
    enabled: !!clientId,
  });
  const [mahsupOpen, setMahsupOpen] = useState(false); // C-2b Mahsup Side Drawer (hook early-return'den ÖNCE)

  if (summaryQ.isLoading) {
    return (
      <div className="flex min-h-0 items-center justify-center p-8 xl:flex-1">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }
  if (summaryQ.isError || !summaryQ.data) {
    return (
      // loading erken-return'ü ile aynı dashboard sizing/centering (xl:flex-1 + ortala).
      <div className="flex min-h-0 items-center justify-center p-8 xl:flex-1">
        <Card className="flex items-center gap-2 p-4 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">Genel cari yüklenemedi.</span>
        </Card>
      </div>
    );
  }

  const s = summaryQ.data;
  const cur = s.currency || currency;
  const M = (v: string) => formatMoneyString(v, cur);

  return (
    <div className="flex min-h-0 flex-col gap-3 xl:flex-1 xl:overflow-hidden">
      {/* ── SUMMARY DECK — sabit, scroll etmez (shrink-0) ─────────────────────────── */}
      <div className="grid shrink-0 gap-3 xl:grid-cols-[1.5fr_1fr]">
        {/* A — Müvekkile Özgü Cari */}
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-emerald-600" />
              <h2 className="text-[15px] font-bold text-gray-900">Müvekkile Özgü Cari</h2>
              {summaryQ.isFetching && <Spinner className="ml-1 h-4 w-4" />}
            </div>
            {/* C-2b — Mahsup Side Drawer tetikleyici (yetki backend; yetkisiz drawer read-only açılır) */}
            <Button variant="outline" size="sm" onClick={() => setMahsupOpen(true)}>
              <ArrowLeftRight className="mr-1 h-4 w-4" /> Mahsup
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-3">
            <Metric icon={Wallet} accent="text-emerald-700" label="Müvekkile Borç (Net)" value={M(s.clientScoped.payableNet)} />
            <Metric icon={CheckCircle} accent="text-green-700" label="Müvekkile Ödenen" value={M(s.clientScoped.paidToClient)} />
            <Metric icon={Send} accent="text-amber-700" label="Talep Edilen Masraf" value={M(s.clientScoped.expenseRequested)} />
            <Metric icon={CheckCircle} accent="text-green-700" label="Tahsil Edilen Masraf" value={M(s.clientScoped.expensePaid)} />
            <Metric icon={Send} accent="text-amber-700" label="Ödenmemiş Masraf" value={M(s.clientScoped.expenseUnpaid)} />
            <Metric
              icon={Scale}
              accent="text-gray-700"
              label="Bilgi Amaçlı Net Pozisyon"
              value={M(s.clientScoped.offsettableNetPosition)}
              note="Bilgi amaçlıdır; defter kaydı/mahsup DEĞİLDİR."
            />
          </div>
        </Card>

        {/* B — Dosya Geneli / Paylaşılan Bağlam */}
        <Card className="p-3">
          <div className="mb-1 flex items-center gap-2">
            <Landmark className="h-5 w-5 text-slate-600" />
            <h2 className="text-[15px] font-bold text-gray-900">Dosya Geneli / Paylaşılan Bağlam</h2>
          </div>
          <div className="mb-2.5 flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 p-2 text-[11px] text-blue-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Bu tutarlar <strong>dosya genelidir</strong>. Çoklu alacaklı dosyalarda doğrudan seçili müvekkile ait kabul edilmez.
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            <Metric icon={Building2} accent="text-indigo-700" label="Borçlu Tahsilatı" value={M(s.caseScopedContext.debtorCollection)} />
            <Metric icon={Wallet} accent="text-indigo-700" label="Dağıtım Bekleyen" value={M(s.caseScopedContext.pendingDistribution)} />
            <Metric icon={Landmark} accent="text-slate-800" label="Masraf/Avans Bakiyesi" value={M(s.caseScopedContext.advanceBalance)} />
          </div>
          {s.needsReview && (
            <div className="mt-2.5 flex items-start gap-2 rounded-md border border-red-100 bg-red-50 p-2 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>Kontrol gerekli:</strong> bir veya daha fazla dosyada dağıtım bekleyen tutar negatif hesaplandı.
                Tahsilat/disposition kayıtları kontrol edilmeli.
              </span>
            </div>
          )}
        </Card>
      </div>

      {/* ── WORKSPACE — xl'de flex-1 (iç scroll panelleri); altında klasik akış (fallback) ───── */}
      <div className="grid min-h-0 gap-3 xl:flex-1 xl:grid-rows-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* Satır 1 — Dosya Kırılımı (full width; kendi içinde scroll + sticky header) */}
        <AccountingPanel
          ariaLabel="Dosya kırılımı tablosu"
          className="min-h-0 min-w-0"
          title={
            <>
              <Building2 className="h-5 w-5 shrink-0 text-gray-600" />
              <h2 className="text-[15px] font-bold text-gray-900">Dosya Kırılımı</h2>
              <Badge variant="secondary" className="ml-1">
                {s.caseBreakdown.length} dosya
              </Badge>
            </>
          }
          footer={
            <p className="text-[11px] text-gray-400">
              Soldaki sütunlar (Müv. Borç/Ödenen/Masraf) müvekkile özgüdür; sağdaki (Borçlu Tahsilatı/Dağıtım
              Bekleyen/Masraf-Avans) dosya genelidir ve çoklu alacaklıda müvekkile atfedilmez.
            </p>
          }
        >
          {s.caseBreakdown.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500">Muhasebeye konu dosya yok.</div>
          ) : (
            <table className="w-full text-[13px] tabular-nums [&_td]:px-2.5 [&_td]:py-2.5 [&_td.text-right]:whitespace-nowrap [&_td.text-right]:font-semibold [&_th]:px-2.5 [&_th]:py-2.5">
              <thead className="sticky top-0 z-10 bg-gray-50 [&_th]:font-semibold">
                <tr className="border-b text-left">
                  <th>Dosya</th>
                  <th>Rol</th>
                  <th className="text-right">Müv. Borç Net</th>
                  <th className="text-right">Müv. Ödenen</th>
                  <th className="text-right">Talep Masraf</th>
                  <th className="text-right">Tahsil Masraf</th>
                  <th className="text-right">Ödenmemiş Masraf</th>
                  <th className="text-right">Borçlu Tahsilatı</th>
                  <th className="text-right">Dağıtım Bekleyen</th>
                  <th className="text-right">Masraf/Avans</th>
                  <th>Kontrol</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {s.caseBreakdown.map((r) => (
                  <tr key={r.caseId} className={`hover:bg-gray-50 ${r.needsReview ? 'bg-red-50' : ''}`}>
                    {/* A — müvekkile özgü */}
                    <td className="whitespace-nowrap">{r.caseNumber}</td>
                    <td className="whitespace-nowrap">{r.role}</td>
                    <td className="text-right">{M(r.payableNet)}</td>
                    <td className="text-right">{M(r.paidToClient)}</td>
                    <td className="text-right">{M(r.expenseRequested)}</td>
                    <td className="text-right">{M(r.expensePaid)}</td>
                    <td className="text-right">{diffMoney(r.expenseRequested, r.expensePaid, cur)}</td>
                    {/* B — dosya geneli (nötr renk) */}
                    <td className="text-right text-gray-500">{M(r.debtorCollection)}</td>
                    <td className="text-right text-gray-500">{M(r.pendingDistribution)}</td>
                    <td className="text-right text-gray-500">{M(r.advanceBalance)}</td>
                    <td>
                      {r.needsReview ? (
                        <span
                          className="inline-flex items-center gap-1 text-red-700"
                          title="Dağıtım bekleyen tutar negatif hesaplandı. Tahsilat/disposition kayıtları kontrol edilmeli."
                        >
                          <AlertTriangle className="h-3 w-3" /> Kontrol gerekli
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AccountingPanel>

        {/* Satır 2 — Birleşik Hareketler (sol) + Müvekkil Genel Ekstresi (sağ). Mahsup Geçmişi+reverse → C-2C. */}
        <div className="grid min-h-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] lg:grid-rows-1">
          {/* Birleşik Hareketler — Faz A-MOV (read-only; mahsup/ekstre/export YOK, running balance YOK) */}
          <ClientMovementsTable
            clientId={clientId}
            currency={cur}
            cases={s.caseBreakdown.map((b) => ({ caseId: b.caseId, caseNumber: b.caseNumber }))}
            className="min-h-0 min-w-0"
          />

          {/* Müvekkil Genel Ekstresi — Faz B-2 (client-level immutable; yalnız CLIENT_SPECIFIC, mahsup YOK) */}
          <ClientLevelStatementSection
            clientId={clientId}
            currency={cur}
            cases={s.caseBreakdown.map((b) => ({ caseId: b.caseId, caseNumber: b.caseNumber }))}
            className="min-h-0 min-w-0"
          />
        </div>
      </div>

      {/* C-2b — Mahsup Side Drawer (D1: overlay; layout etkilemez). Başarı→query invalidation + kapanış drawer içinde. */}
      <OffsetDrawer clientId={clientId} currency={cur} isOpen={mahsupOpen} onClose={() => setMahsupOpen(false)} />
    </div>
  );
}

function Metric({
  icon: Icon,
  accent,
  label,
  value,
  note,
}: {
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-lg border p-2.5">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500">
        <Icon className={`h-4 w-4 ${accent}`} />
        {label}
      </div>
      <div className={`mt-0.5 whitespace-nowrap text-xl font-bold tabular-nums ${accent}`}>{value}</div>
      {note && <div className="mt-1 text-[10px] text-gray-400">{note}</div>}
    </div>
  );
}

export default ClientCariView;
