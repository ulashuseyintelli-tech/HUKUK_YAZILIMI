'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientAccountingApi, formatMoneyString } from '@/lib/api/client-accounting';

/** G2 is a read-only selection. It supplies no currency or amount to existing operations/documents. */
export function ClientCariNativeSummary({ clientId }: { clientId: string }) {
  const query = useQuery({ queryKey: ['client-cari-native-summary', clientId],
    queryFn: () => clientAccountingApi.getClientSummaryByCurrency(clientId), enabled: !!clientId });
  const [choice, setChoice] = useState({ clientId: '', currency: '' });
  if (query.isLoading || !query.data && !query.isError) return <p role="status">Para birimi özetleri yükleniyor.</p>;
  if (query.isError || !query.data || query.data.clientId !== clientId) {
    return <p role="alert">Genel cari özeti hesaplanamadı veya erişim sağlanamadı.</p>;
  }
  const data = query.data;
  if (!data.groups.length) return <p>Bu müvekkil için doğrulanmış mali kayıt yok.</p>;
  const group = data.groups.find(g => choice.clientId === clientId && g.currency === choice.currency) ?? data.groups[0];
  const money = (amount: string) => formatMoneyString(amount, group.currency);
  const clientMetrics: Array<[string, string]> = [
    ['Müvekkile Borç (Net)', group.clientScoped.payableNet], ['Müvekkile Ödenen', group.clientScoped.paidToClient],
    ['Talep Edilen Masraf', group.clientScoped.expenseRequested], ['Tahsil Edilen Masraf', group.clientScoped.expensePaid],
    ['Ödenmemiş Masraf', group.clientScoped.expenseUnpaid], ['Bilgi Amaçlı Net Pozisyon', group.clientScoped.offsettableNetPosition],
  ];
  const caseMetrics: Array<[string, string]> = [['Borçlu Tahsilatı', group.caseScopedContext.debtorCollection],
    ['Dağıtım Bekleyen', group.caseScopedContext.pendingDistribution], ['Masraf/Avans Bakiyesi', group.caseScopedContext.advanceBalance]];
  return <section aria-label="Para birimine göre genel cari" className="min-h-0 space-y-3 overflow-auto rounded-lg border bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-bold">Para Birimine Göre Genel Cari</h2>
      <label>Para birimi <select aria-label="Genel cari para birimi" value={group.currency}
        onChange={event => setChoice({ clientId, currency: event.target.value })}>
        {data.groups.map(g => <option key={g.currency} value={g.currency}>{g.currency}</option>)}
      </select></label>
    </div>
    <p className="text-xs text-gray-500">Okuma zamanı: {new Date(data.asOf).toLocaleString('tr-TR')}. Para birimleri çevrilmez veya birleştirilmez.</p>
    <h3 className="font-semibold">Müvekkile Özgü Cari · {group.currency}</h3>
    <dl className="grid grid-cols-2 gap-2 xl:grid-cols-3">{clientMetrics.map(([label, amount]) =>
      <div key={label} className="rounded border p-2"><dt className="text-xs text-gray-600">{label}</dt><dd className="font-semibold">{money(amount)}</dd></div>)}</dl>
    <p className="text-xs">Net pozisyon bilgi amaçlıdır; defter kaydı veya mahsup değildir.</p>
    <h3 className="font-semibold">Dosya Geneli / Paylaşılan Bağlam · {group.currency}</h3>
    <p className="text-xs">Bu tutarlar dosya genelidir; çoklu alacaklı dosyada seçili müvekkile ait kabul edilmez.</p>
    <dl className="grid grid-cols-3 gap-2">{caseMetrics.map(([label, amount]) =>
      <div key={label} className="rounded border p-2"><dt className="text-xs text-gray-600">{label}</dt><dd>{money(amount)}</dd></div>)}</dl>
    <p className="text-xs">Mahsubu bekleyen: {money(group.caseScopedContext.allocationHeld)} · Dağıtıma kapalıdır.
      {' '}Dağıtılabilir bekleyen: {money(group.caseScopedContext.pendingDistributionExcludingHeld)}.</p>
    {group.needsReview && <p role="status" className="text-red-700">Kontrol gerekli: negatif dağıtım bekleyen tutar var.</p>}
    <div className="overflow-x-auto"><table aria-label="Para birimine göre dosya kırılımı" className="w-full text-xs">
      <thead><tr>{['Dosya', 'Rol', 'Para birimi', 'Müv. Borç Net', 'Müv. Ödenen', 'Talep Masraf', 'Tahsil Masraf',
        'Ödenmemiş Masraf', 'Borçlu Tahsilatı', 'Dağıtım Bekleyen', 'Masraf/Avans', 'Kontrol'].map(h => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{group.caseBreakdown.map(row => <tr key={row.caseId + ':' + row.currency}>
        <td>{row.caseNumber}</td><td>{row.role}</td><td>{row.currency}</td>
        {[row.payableNet, row.paidToClient, row.expenseRequested, row.expensePaid, row.expenseUnpaid,
          row.debtorCollection, row.pendingDistribution, row.advanceBalance].map((value, index) => <td key={index}>{money(value)}</td>)}
        <td>{row.needsReview ? 'Kontrol gerekli' : '—'}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}
