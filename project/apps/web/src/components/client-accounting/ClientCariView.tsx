'use client';

/**
 * TM3 Faz A — Müvekkil Genel Cari (client-level, READ-ONLY). scope=client.
 *
 * İki metrik grubu (kilitli karar):
 *  A) Müvekkile Özgü — temiz toplanır (caseClientId/clientId scope).
 *  B) Dosya Geneli / Paylaşılan Bağlam — müvekkile ATFEDİLMEZ (distinct caseId). Açık uyarı.
 * UI HESAP MOTORU DEĞİL: değerler backend'den (offsettableNetPosition yalnız BİLGİ).
 * Genel ekstre / mahsup butonu YOK (Faz B/C). Yeni mutation YOK.
 */

import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Spinner } from '@hukuk/ui';
import { Wallet, Send, CheckCircle, Landmark, Building2, Info, AlertCircle, Scale, AlertTriangle } from 'lucide-react';
import { clientAccountingApi, formatMoneyString } from '@/lib/api/client-accounting';

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

  if (summaryQ.isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }
  if (summaryQ.isError || !summaryQ.data) {
    return (
      <Card className="p-4 flex items-center gap-2 text-red-600">
        <AlertCircle className="w-5 h-5" />
        <span className="text-sm">Genel cari yüklenemedi.</span>
      </Card>
    );
  }

  const s = summaryQ.data;
  const cur = s.currency || currency;
  const M = (v: string) => formatMoneyString(v, cur);

  return (
    <div className="flex flex-col gap-4">
      {/* A — Müvekkile Özgü Cari */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-5 h-5 text-emerald-600" />
          <h2 className="font-medium text-gray-900">Müvekkile Özgü Cari</h2>
          {summaryQ.isFetching && <Spinner className="w-4 h-4 ml-1" />}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <Metric icon={Wallet} accent="text-emerald-700" label="Müvekkile Borç (Net)" value={M(s.clientScoped.payableNet)} />
          <Metric icon={CheckCircle} accent="text-green-700" label="Müvekkile Ödenen" value={M(s.clientScoped.paidToClient)} />
          <Metric icon={Send} accent="text-amber-700" label="Talep Edilen Masraf" value={M(s.clientScoped.expenseRequested)} />
          <Metric icon={CheckCircle} accent="text-green-700" label="Tahsil Edilen Masraf" value={M(s.clientScoped.expensePaid)} />
          <Metric icon={Send} accent="text-amber-700" label="Ödenmemiş Masraf" value={M(s.clientScoped.expenseUnpaid)} />
          <Metric
            icon={Scale}
            accent="text-gray-700"
            label="Mahsup Edilebilir Net Pozisyon"
            value={M(s.clientScoped.offsettableNetPosition)}
            note="Bilgi amaçlıdır; defter kaydı/mahsup DEĞİLDİR."
          />
        </div>
      </Card>

      {/* B — Dosya Geneli / Paylaşılan Bağlam */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Landmark className="w-5 h-5 text-slate-600" />
          <h2 className="font-medium text-gray-900">Dosya Geneli / Paylaşılan Bağlam</h2>
        </div>
        <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-100 p-2 text-[11px] text-blue-800 mb-3">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Bu tutarlar <strong>dosya genelidir</strong>. Çoklu alacaklı dosyalarda doğrudan seçili müvekkile ait kabul edilmez.
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Metric icon={Building2} accent="text-indigo-700" label="Borçlu Tahsilatı" value={M(s.caseScopedContext.debtorCollection)} />
          <Metric icon={Wallet} accent="text-indigo-700" label="Dağıtım Bekleyen" value={M(s.caseScopedContext.pendingDistribution)} />
          <Metric icon={Landmark} accent="text-slate-800" label="Masraf/Avans Bakiyesi" value={M(s.caseScopedContext.advanceBalance)} />
        </div>
        {s.needsReview && (
          <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-100 p-2 text-xs text-red-700 mt-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              <strong>Kontrol gerekli:</strong> bir veya daha fazla dosyada dağıtım bekleyen tutar negatif hesaplandı.
              Tahsilat/disposition kayıtları kontrol edilmeli.
            </span>
          </div>
        )}
      </Card>

      {/* Dosya Kırılımı */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-5 h-5 text-gray-600" />
          <h2 className="font-medium text-gray-900">Dosya Kırılımı</h2>
          <Badge variant="secondary" className="ml-1">{s.caseBreakdown.length} dosya</Badge>
        </div>
        {s.caseBreakdown.length === 0 ? (
          <div className="text-sm text-gray-500 py-6 text-center">Muhasebeye konu dosya yok.</div>
        ) : (
          <div className="overflow-auto border rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr className="border-b text-left">
                  <th className="px-2 py-2">Dosya</th>
                  <th className="px-2 py-2">Rol</th>
                  <th className="px-2 py-2 text-right">Müv. Borç Net</th>
                  <th className="px-2 py-2 text-right">Müv. Ödenen</th>
                  <th className="px-2 py-2 text-right">Talep Masraf</th>
                  <th className="px-2 py-2 text-right">Tahsil Masraf</th>
                  <th className="px-2 py-2 text-right">Ödenmemiş Masraf</th>
                  <th className="px-2 py-2 text-right">Borçlu Tahsilatı</th>
                  <th className="px-2 py-2 text-right">Dağıtım Bekleyen</th>
                  <th className="px-2 py-2 text-right">Masraf/Avans</th>
                  <th className="px-2 py-2">Kontrol</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {s.caseBreakdown.map((r) => (
                  <tr key={r.caseId} className={`hover:bg-gray-50 ${r.needsReview ? 'bg-red-50' : ''}`}>
                    <td className="px-2 py-2 whitespace-nowrap">{r.caseNumber}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{r.role}</td>
                    {/* A — müvekkile özgü */}
                    <td className="px-2 py-2 text-right">{M(r.payableNet)}</td>
                    <td className="px-2 py-2 text-right">{M(r.paidToClient)}</td>
                    <td className="px-2 py-2 text-right">{M(r.expenseRequested)}</td>
                    <td className="px-2 py-2 text-right">{M(r.expensePaid)}</td>
                    <td className="px-2 py-2 text-right">{diffMoney(r.expenseRequested, r.expensePaid, cur)}</td>
                    {/* B — dosya geneli */}
                    <td className="px-2 py-2 text-right text-gray-500">{M(r.debtorCollection)}</td>
                    <td className="px-2 py-2 text-right text-gray-500">{M(r.pendingDistribution)}</td>
                    <td className="px-2 py-2 text-right text-gray-500">{M(r.advanceBalance)}</td>
                    <td className="px-2 py-2">
                      {r.needsReview ? (
                        <span
                          className="inline-flex items-center gap-1 text-red-700"
                          title="Dağıtım bekleyen tutar negatif hesaplandı. Tahsilat/disposition kayıtları kontrol edilmeli."
                        >
                          <AlertTriangle className="w-3 h-3" /> Kontrol gerekli
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-gray-400">
          Soldaki sütunlar (Müv. Borç/Ödenen/Masraf) müvekkile özgüdür; sağdaki (Borçlu Tahsilatı/Dağıtım
          Bekleyen/Masraf-Avans) dosya genelidir ve çoklu alacaklıda müvekkile atfedilmez.
        </p>
      </Card>
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
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Icon className={`w-4 h-4 ${accent}`} />
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold ${accent}`}>{value}</div>
      {note && <div className="mt-1 text-[10px] text-gray-400">{note}</div>}
    </div>
  );
}

export default ClientCariView;
